import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  type AbonoEntry,
  type MolassesDispatch,
} from '../types/molasses';
import {
  computeDispatchTotals,
  formatBs,
  formatIsoDateShort,
  formatQty,
  formatUsd,
  round2,
  todayIsoDate,
} from '../utils/format';

interface AbonoModalProps {
  open: boolean;
  dispatch: MolassesDispatch | null;
  slot: number;
  defaultRate: number;
  userEmail: string;
  onClose: () => void;
  onSave: (entry: AbonoEntry | null, slotToRemove?: number) => Promise<void>;
}

export const AbonoModal: React.FC<AbonoModalProps> = ({
  open,
  dispatch,
  slot,
  defaultRate,
  userEmail,
  onClose,
  onSave,
}) => {
  const [amountUsd, setAmountUsd] = useState('');
  const [rateBs, setRateBs] = useState(String(defaultRate));
  const [amountBsManual, setAmountBsManual] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const existingSlot = dispatch?.abonos.find((a) => a.slot === slot) || null;

  useEffect(() => {
    if (!open || !dispatch) return;
    setError(null);
    if (existingSlot) {
      setAmountUsd(String(existingSlot.amountUsd));
      setRateBs(String(existingSlot.exchangeRateBs));
      setAmountBsManual(String(existingSlot.amountBs));
      setDate(existingSlot.date);
      setNote(existingSlot.note || '');
    } else {
      setAmountUsd('');
      setRateBs(String(defaultRate));
      setAmountBsManual('');
      setDate(todayIsoDate());
      setNote('');
    }
  }, [open, dispatch, slot, defaultRate, existingSlot]);

  if (!open || !dispatch) return null;

  const parsedUsd = Math.max(0, Number(amountUsd) || 0);
  const parsedRate = Math.max(0.01, Number(rateBs) || defaultRate || 1);
  const computedBs = round2(parsedUsd * parsedRate);
  const effectiveBs = amountBsManual.trim() !== '' ? Math.max(0, Number(amountBsManual) || 0) : computedBs;

  const otherAbonos = dispatch.abonos.filter((a) => a.slot !== slot);
  const previewTotals = computeDispatchTotals(dispatch.totalUsd, [
    ...otherAbonos,
    ...(parsedUsd > 0
      ? [
          {
            slot,
            amountUsd: parsedUsd,
            exchangeRateBs: parsedRate,
            amountBs: effectiveBs,
            date,
            note,
            recordedByEmail: userEmail,
          },
        ]
      : []),
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!BLUEPRINT_LIMITS.DATE_REGEX.test(date)) {
      setError('Fecha inválida.');
      return;
    }
    if (parsedUsd <= 0) {
      setError('El monto del abono en dólares debe ser mayor a cero.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        slot,
        amountUsd: round2(parsedUsd),
        exchangeRateBs: round2(parsedRate),
        amountBs: round2(effectiveBs),
        date,
        note: note.trim(),
        recordedByEmail: userEmail,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el abono.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlot = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(null, slot);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el abono.');
    } finally {
      setIsSaving(false);
    }
  };

  const fillRemainingBalance = () => {
    const otherPaid = otherAbonos.reduce((acc, a) => acc + a.amountUsd, 0);
    const needed = Math.max(0, round2(dispatch.totalUsd - otherPaid));
    setAmountUsd(String(needed));
    setAmountBsManual('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 space-y-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Abono {slot} · {dispatch.personName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Venta del {formatIsoDateShort(dispatch.saleDate)} ·{' '}
              {formatQty(dispatch.quantity, dispatch.unit)} · Capital{' '}
              <span className="font-mono tabular-nums">{formatUsd(dispatch.totalUsd)}</span>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  Monto ($ USD)
                </label>
                <button
                  type="button"
                  onClick={fillRemainingBalance}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Saldar todo
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountUsd}
                onChange={(e) => {
                  setAmountUsd(e.target.value);
                  setAmountBsManual('');
                }}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fecha del abono
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tasa ref. del día (Bs/$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={rateBs}
                onChange={(e) => {
                  setRateBs(e.target.value);
                  setAmountBsManual('');
                }}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Equivalente en Bs.V
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountBsManual !== '' ? amountBsManual : computedBs || ''}
                onChange={(e) => setAmountBsManual(e.target.value)}
                placeholder={String(computedBs)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Método / Nota (opcional)
            </label>
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.ABONO_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Pago Móvil Banesco, Efectivo $, Transferencia"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          {/* Descuento en vivo del capital inicial */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Capital inicial</span>
              <span className="font-mono tabular-nums">{formatUsd(dispatch.totalUsd)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Total abonado (con este abono)</span>
              <span className="font-mono tabular-nums text-emerald-700 font-medium">
                {formatUsd(previewTotals.totalPaidUsd)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-semibold text-slate-900">
              <span>Saldo restante</span>
              <span className="font-mono tabular-nums">
                {formatUsd(previewTotals.remainingUsd)} ({formatBs(previewTotals.remainingUsd * parsedRate)})
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {existingSlot ? (
              <button
                type="button"
                onClick={handleDeleteSlot}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar abono
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
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
                {isSaving ? 'Guardando...' : 'Guardar abono'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
