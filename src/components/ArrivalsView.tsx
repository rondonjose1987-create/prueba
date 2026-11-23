import React, { useMemo, useState } from 'react';
import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import type { MolassesArrival, UnitType } from '../types/molasses';
import {
  formatBs,
  formatIsoDateShort,
  formatQty,
  formatRate,
  formatUsd,
  round2,
} from '../utils/format';

interface ArrivalsViewProps {
  arrivals: MolassesArrival[];
  canEdit: boolean;
  onNewArrival: () => void;
  onEditArrival: (arrival: MolassesArrival) => void;
  onDeleteArrival: (arrival: MolassesArrival) => void;
}

export const ArrivalsView: React.FC<ArrivalsViewProps> = ({
  arrivals,
  canEdit,
  onNewArrival,
  onEditArrival,
  onDeleteArrival,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState<'all' | UnitType>('all');

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return arrivals.filter((a) => {
      if (unitFilter !== 'all' && a.unit !== unitFilter) return false;
      if (term) {
        const hay = `${a.supplier} ${a.arrivalDate} ${a.notes}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [arrivals, searchTerm, unitFilter]);

  const summary = useMemo(() => {
    const totalLitros = round2(
      filtered.filter((a) => a.unit === 'litros').reduce((s, a) => s + a.quantity, 0)
    );
    const totalKilos = round2(
      filtered.filter((a) => a.unit === 'kilos').reduce((s, a) => s + a.quantity, 0)
    );
    const totalUsd = round2(filtered.reduce((s, a) => s + a.costUsd, 0));
    const totalBs = round2(filtered.reduce((s, a) => s + a.costBs, 0));
    return { totalLitros, totalKilos, totalUsd, totalBs };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar proveedor o fecha..."
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 min-h-[44px] sm:min-h-0"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            {(
              [
                { key: 'all', label: 'Todos' },
                { key: 'litros', label: 'Litros' },
                { key: 'kilos', label: 'Kilos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setUnitFilter(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] sm:min-h-0 ${
                  unitFilter === opt.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={onNewArrival}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
          >
            <Plus className="w-4 h-4" />
            Registrar llegada de melaza
          </button>
        )}
      </div>

      {/* Summary Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-slate-600">
          <strong className="text-slate-900 font-mono tabular-nums">{filtered.length}</strong> ingresos registrados en finca
        </span>
        <div className="flex flex-wrap items-center gap-4 sm:gap-5 font-mono tabular-nums">
          <span className="text-slate-600">
            Total Litros: <strong className="text-slate-900">{formatQty(summary.totalLitros, 'litros')}</strong>
          </span>
          <span className="text-slate-600">
            Total Kilos: <strong className="text-slate-900">{formatQty(summary.totalKilos, 'kilos')}</strong>
          </span>
          <span className="text-slate-600">
            Inversión: <strong className="text-slate-900">{formatUsd(summary.totalUsd)}</strong> ({formatBs(summary.totalBs)})
          </span>
        </div>
      </div>

      {/* Cards (Mobile) & Table (Desktop) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 sm:p-12 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">
              No hay llegadas de melaza registradas
            </p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Registra cada carga que llega a la finca en litros o kilos para descontar automáticamente con los despachos.
            </p>
            {canEdit && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onNewArrival}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Registrar primera entrada
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {filtered.map((a) => (
                <div key={a.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {a.supplier}
                      </h3>
                      <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                        {formatIsoDateShort(a.arrivalDate)} · Tasa {formatRate(a.exchangeRateBs)}
                      </p>
                      {a.notes && (
                        <p className="text-xs text-slate-500 mt-1">{a.notes}</p>
                      )}
                    </div>
                    <span className="text-sm font-mono tabular-nums font-semibold text-emerald-700 shrink-0">
                      +{formatQty(a.quantity, a.unit)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                    <div className="font-mono tabular-nums text-slate-700">
                      <strong className="text-slate-900">{formatUsd(a.costUsd)}</strong> ·{' '}
                      {formatBs(a.costBs)}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditArrival(a)}
                          aria-label="Editar llegada"
                          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteArrival(a)}
                          aria-label="Eliminar llegada"
                          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-red-700 bg-red-50/70 border border-red-200 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="text-left px-5 py-3">Fecha llegada</th>
                    <th className="text-left px-4 py-3">Proveedor / Procedencia</th>
                    <th className="text-right px-4 py-3">Cantidad</th>
                    <th className="text-right px-4 py-3">Costo $ USD</th>
                    <th className="text-right px-4 py-3">Tasa Ref.</th>
                    <th className="text-right px-4 py-3">Costo Bs.V</th>
                    <th className="text-left px-4 py-3">Registrado por</th>
                    {canEdit && <th className="text-right px-5 py-3">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatIsoDateShort(a.arrivalDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{a.supplier}</div>
                        {a.notes && (
                          <div className="text-xs text-slate-500 truncate max-w-xs">{a.notes}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                        +{formatQty(a.quantity, a.unit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatUsd(a.costUsd)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {formatRate(a.exchangeRateBs)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatBs(a.costBs)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 truncate max-w-[180px]">
                        {a.createdByEmail}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditArrival(a)}
                              title="Editar llegada"
                              className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteArrival(a)}
                              title="Eliminar llegada"
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
