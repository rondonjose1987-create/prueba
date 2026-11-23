import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BLUEPRINT_LIMITS, type MolassesArrival, type UnitType } from '../types/molasses';
import { formatBs, round2, todayIsoDate } from '../utils/format';

interface ArrivalModalProps {
  open: boolean;
  initialData: MolassesArrival | null;
  defaultRate: number;
  onClose: () => void;
  onSubmit: (data: {
    id?: string;
    arrivalDate: string;
    supplier: string;
    quantity: number;
    unit: UnitType;
    costUsd: number;
    exchangeRateBs: number;
    costBs: number;
    notes: string;
  }) => Promise<void>;
}

export const ArrivalModal: React.FC<ArrivalModalProps> = ({
  open,
  initialData,
  defaultRate,
  onClose,
  onSubmit,
}) => {
  const [arrivalDate, setArrivalDate] = useState(todayIsoDate());
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<UnitType>('litros');
  const [costUsd, setCostUsd] = useState('');
  const [exchangeRateBs, setExchangeRateBs] = useState(String(defaultRate));
  const [costBsManual, setCostBsManual] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initialData) {
      setArrivalDate(initialData.arrivalDate);
      setSupplier(initialData.supplier);
      setQuantity(String(initialData.quantity));
      setUnit(initialData.unit);
      setCostUsd(String(initialData.costUsd));
      setExchangeRateBs(String(initialData.exchangeRateBs));
      setCostBsManual(String(initialData.costBs));
      setNotes(initialData.notes || '');
    } else {
      setArrivalDate(todayIsoDate());
      setSupplier('');
      setQuantity('');
      setUnit('litros');
      setCostUsd('');
      setExchangeRateBs(String(defaultRate));
      setCostBsManual('');
      setNotes('');
    }
  }, [open, initialData, defaultRate]);

  if (!open) return null;

  const parsedUsd = Number(costUsd) || 0;
  const parsedRate = Number(exchangeRateBs) || defaultRate || 1;
  const computedBs = round2(parsedUsd * parsedRate);
  const effectiveBs = costBsManual.trim() !== '' ? Number(costBsManual) || 0 : computedBs;
  const parsedQty = Number(quantity) || 0;
  const unitCostUsd = parsedQty > 0 && parsedUsd > 0 ? round2(parsedUsd / parsedQty) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!BLUEPRINT_LIMITS.DATE_REGEX.test(arrivalDate)) {
      setError('Selecciona una fecha válida.');
      return;
    }
    if (!supplier.trim()) {
      setError('Ingresa el proveedor o procedencia de la melaza.');
      return;
    }
    if (parsedQty <= 0) {
      setError('La cantidad debe ser mayor a cero.');
      return;
    }
    if (parsedRate <= 0) {
      setError('La tasa referencial debe ser mayor a cero.');
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        id: initialData?.id,
        arrivalDate,
        supplier: supplier.trim(),
        quantity: parsedQty,
        unit,
        costUsd: parsedUsd,
        exchangeRateBs: parsedRate,
        costBs: effectiveBs,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la entrada.');
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
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 space-y-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {initialData ? 'Editar entrada de melaza' : 'Registrar llegada de melaza a finca'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Suma inventario disponible en litros o kilos
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fecha de llegada
              </label>
              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Proveedor / Central
              </label>
              <input
                type="text"
                value={supplier}
                maxLength={BLUEPRINT_LIMITS.SUPPLIER_MAX}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ej. Central Azucarero / Cisterna"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cantidad que llegó
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ej. 1000"
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Unidad
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Costo total ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costUsd}
                onChange={(e) => {
                  setCostUsd(e.target.value);
                  setCostBsManual('');
                }}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tasa ref. (Bs/$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={exchangeRateBs}
                onChange={(e) => {
                  setExchangeRateBs(e.target.value);
                  setCostBsManual('');
                }}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Costo en Bs.V
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costBsManual !== '' ? costBsManual : computedBs || ''}
                onChange={(e) => setCostBsManual(e.target.value)}
                placeholder={String(computedBs)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
          </div>

          {parsedQty > 0 && (
            <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-600">
              <span>Costo por {unit === 'litros' ? 'Litro' : 'Kilo'}</span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                ${unitCostUsd.toFixed(2)} USD · {formatBs(effectiveBs)} total
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notas u observaciones
            </label>
            <textarea
              rows={2}
              maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Tanque 1, factura #402, grados Brix..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 resize-none"
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
              {isSaving ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Registrar entrada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
