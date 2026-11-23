import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  type AbonoEntry,
  type MolassesDispatch,
  type PersonAccount,
  type UnitType,
} from '../types/molasses';
import { formatBs, formatUsd, round2, todayIsoDate } from '../utils/format';

interface DispatchModalProps {
  open: boolean;
  initialData: MolassesDispatch | null;
  persons: PersonAccount[];
  defaultRate: number;
  userEmail: string;
  preselectedPersonId?: string;
  onClose: () => void;
  onSubmit: (data: {
    id?: string;
    saleDate: string;
    personId?: string;
    personName: string;
    personPhone?: string;
    personEmail?: string;
    quantity: number;
    unit: UnitType;
    unitPriceUsd: number;
    totalUsd: number;
    exchangeRateBs: number;
    totalBs: number;
    abonos: AbonoEntry[];
    notes: string;
  }) => Promise<void>;
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  open,
  initialData,
  persons,
  defaultRate,
  userEmail,
  preselectedPersonId,
  onClose,
  onSubmit,
}) => {
  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<UnitType>('litros');
  const [totalUsd, setTotalUsd] = useState('');
  const [exchangeRateBs, setExchangeRateBs] = useState(String(defaultRate));
  const [totalBsManual, setTotalBsManual] = useState('');

  // Optional initial abono when creating a dispatch
  const [didInitialAbono, setDidInitialAbono] = useState(false);
  const [initialAbonoUsd, setInitialAbonoUsd] = useState('');
  const [initialAbonoNote, setInitialAbonoNote] = useState('');

  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowSuggestions(false);

    if (initialData) {
      setSaleDate(initialData.saleDate);
      setPersonName(initialData.personName);
      setPersonPhone('');
      setPersonEmail('');
      setQuantity(String(initialData.quantity));
      setUnit(initialData.unit);
      setTotalUsd(String(initialData.totalUsd));
      setExchangeRateBs(String(initialData.exchangeRateBs));
      setTotalBsManual(String(initialData.totalBs));
      setDidInitialAbono(false);
      setInitialAbonoUsd('');
      setInitialAbonoNote('');
      setNotes(initialData.notes || '');
    } else {
      const preselected = preselectedPersonId
        ? persons.find((p) => p.id === preselectedPersonId)
        : undefined;
      setSaleDate(todayIsoDate());
      // Always start empty for new dispatch unless opened from a specific person's card
      setPersonName(preselected ? preselected.name : '');
      setPersonPhone('');
      setPersonEmail('');
      setQuantity('');
      setUnit('litros');
      setTotalUsd('');
      setExchangeRateBs(String(defaultRate));
      setTotalBsManual('');
      setDidInitialAbono(false);
      setInitialAbonoUsd('');
      setInitialAbonoNote('');
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?.id, preselectedPersonId]);

  const matchedExistingPerson = useMemo(() => {
    const normalized = personName.trim().toLowerCase();
    if (!normalized) return undefined;
    return persons.find((p) => p.name.trim().toLowerCase() === normalized);
  }, [personName, persons]);

  const filteredSuggestions = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return persons.slice(0, 6);
    return persons
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [personName, persons]);

  if (!open) return null;

  const parsedQty = Number(quantity) || 0;
  const parsedTotalUsd = Number(totalUsd) || 0;
  const parsedRate = Number(exchangeRateBs) || defaultRate || 1;
  const computedBs = round2(parsedTotalUsd * parsedRate);
  const effectiveBs = totalBsManual.trim() !== '' ? Number(totalBsManual) || 0 : computedBs;
  const computedUnitPrice = parsedQty > 0 && parsedTotalUsd > 0 ? round2(parsedTotalUsd / parsedQty) : 0;

  const parsedInitialAbono = didInitialAbono ? Math.max(0, Number(initialAbonoUsd) || 0) : 0;
  const previewRemaining = Math.max(0, round2(parsedTotalUsd - parsedInitialAbono));

  const isBrandNewPerson = personName.trim().length > 0 && !matchedExistingPerson;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!BLUEPRINT_LIMITS.DATE_REGEX.test(saleDate)) {
      setError('Selecciona una fecha de venta válida.');
      return;
    }

    const cleanName = personName.trim();
    if (!cleanName) {
      setError('Ingresa el nombre de la persona.');
      return;
    }

    if (parsedQty <= 0) {
      setError('La cantidad despachada debe ser mayor a cero.');
      return;
    }
    if (parsedTotalUsd <= 0) {
      setError('El costo / capital inicial en dólares debe ser mayor a cero.');
      return;
    }
    if (parsedRate <= 0) {
      setError('El precio referencial del dólar debe ser mayor a cero.');
      return;
    }

    if (!initialData && didInitialAbono && parsedInitialAbono <= 0) {
      setError('Si marcó que abonó, indica el monto del Abono 1 en dólares.');
      return;
    }

    let abonos: AbonoEntry[] = initialData ? initialData.abonos : [];
    if (!initialData && didInitialAbono && parsedInitialAbono > 0) {
      abonos = [
        {
          slot: 1,
          amountUsd: round2(parsedInitialAbono),
          exchangeRateBs: round2(parsedRate),
          amountBs: round2(parsedInitialAbono * parsedRate),
          date: saleDate,
          note: initialAbonoNote.trim() || 'Abono inicial',
          recordedByEmail: userEmail,
        },
      ];
    }

    setIsSaving(true);
    try {
      await onSubmit({
        id: initialData?.id,
        saleDate,
        personId: matchedExistingPerson?.id,
        personName: cleanName,
        personPhone: isBrandNewPerson ? personPhone.trim() : undefined,
        personEmail: isBrandNewPerson ? personEmail.trim() : undefined,
        quantity: parsedQty,
        unit,
        unitPriceUsd: computedUnitPrice,
        totalUsd: round2(parsedTotalUsd),
        exchangeRateBs: round2(parsedRate),
        totalBs: round2(effectiveBs),
        abonos,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el despacho.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 space-y-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {initialData ? 'Editar despacho de melaza' : 'Nuevo despacho / venta de melaza'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registra fecha, persona, cantidad en litros o kilos, capital en $ y Bs.V y abono inicial
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Fecha y Persona (siempre editable e individual por registro) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fecha de la venta
              </label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  Nombre de la persona
                </label>
                {personName && (
                  <button
                    type="button"
                    onClick={() => {
                      setPersonName('');
                      setShowSuggestions(false);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <input
                type="text"
                value={personName}
                maxLength={BLUEPRINT_LIMITS.PERSON_NAME_MAX}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
                onChange={(e) => {
                  setPersonName(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="Escribe el nombre (ej. José)"
                autoComplete="off"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />

              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-md max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {filteredSuggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setPersonName(p.name);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="font-medium text-slate-900 truncate">{p.name}</span>
                      {(p.phone || p.email) && (
                        <span className="text-slate-400 truncate max-w-[120px]">
                          {p.phone || p.email}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isBrandNewPerson && !initialData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Teléfono (opcional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                  value={personPhone}
                  onChange={(e) => setPersonPhone(e.target.value)}
                  placeholder="0414-0000000"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Correo Gmail (opcional, para recibos)
                </label>
                <input
                  type="email"
                  maxLength={BLUEPRINT_LIMITS.EMAIL_MAX}
                  value={personEmail}
                  onChange={(e) => setPersonEmail(e.target.value)}
                  placeholder="cliente@gmail.com"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>
          )}

          {/* Cantidad y Unidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cantidad despachada
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ej. 10"
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Unidad de medida
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUnit('litros')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    unit === 'litros'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Litros (Lts)
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('kilos')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    unit === 'kilos'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kilos (Kg)
                </button>
              </div>
            </div>
          </div>

          {/* Capital USD, Tasa Ref y Bolívares */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Capital / Costo ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={totalUsd}
                onChange={(e) => {
                  setTotalUsd(e.target.value);
                  setTotalBsManual('');
                }}
                placeholder="Ej. 19"
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Precio ref. dólar (Bs/$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={exchangeRateBs}
                onChange={(e) => {
                  setExchangeRateBs(e.target.value);
                  setTotalBsManual('');
                }}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Costo en Bolívares (Bs.V)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalBsManual !== '' ? totalBsManual : computedBs || ''}
                onChange={(e) => setTotalBsManual(e.target.value)}
                placeholder={String(computedBs)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
          </div>

          {parsedQty > 0 && parsedTotalUsd > 0 && (
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-600">
              <span>Precio unitario calculado</span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                ${computedUnitPrice.toFixed(2)} / {unit === 'litros' ? 'Litro' : 'Kilo'} ·{' '}
                {formatBs(effectiveBs)}
              </span>
            </div>
          )}

          {/* ¿Abonó o no? (solo en creación; en edición se gestionan en las 10 columnas) */}
          {!initialData && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    ¿Realizó abono inicial hoy?
                  </p>
                  <p className="text-xs text-slate-500">
                    Se registra en Abono 1 y se descuenta del capital inicial
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setDidInitialAbono(false)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      !didInitialAbono
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setDidInitialAbono(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      didInitialAbono
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sí abonó
                  </button>
                </div>
              </div>

              {didInitialAbono && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Monto Abono 1 ($ USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={initialAbonoUsd}
                      onChange={(e) => setInitialAbonoUsd(e.target.value)}
                      placeholder="Ej. 10.00"
                      className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Referencia / Nota de pago
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.ABONO_NOTE_MAX}
                      value={initialAbonoNote}
                      onChange={(e) => setInitialAbonoNote(e.target.value)}
                      placeholder="Ej. Pago Móvil / Efectivo"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                  {parsedTotalUsd > 0 && (
                    <div className="sm:col-span-2 text-xs text-slate-600 flex items-center justify-between pt-1">
                      <span>Saldo restante después de Abono 1:</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatUsd(previewRemaining)} ({formatBs(previewRemaining * parsedRate)})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notas del despacho (opcional)
            </label>
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Retiró en bidones propios"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              {isSaving ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Guardar despacho'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
