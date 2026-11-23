import React, { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Users } from 'lucide-react';
import type { Farm, MolassesArrival, MolassesDispatch, PersonAccount } from '../types/molasses';
import {
  formatBs,
  formatIsoDateShort,
  formatQty,
  formatRate,
  formatUsd,
  round2,
} from '../utils/format';

interface DashboardOverviewProps {
  farm: Farm;
  arrivals: MolassesArrival[];
  dispatches: MolassesDispatch[];
  persons: PersonAccount[];
  canEdit: boolean;
  onNewArrival: () => void;
  onNewDispatch: () => void;
  onNavigate: (tab: 'dispatches' | 'arrivals' | 'persons' | 'collaborators') => void;
  onOpenAbono: (dispatch: MolassesDispatch, slot: number) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  farm,
  arrivals,
  dispatches,
  persons,
  canEdit,
  onNewArrival,
  onNewDispatch,
  onNavigate,
  onOpenAbono,
}) => {
  const stats = useMemo(() => {
    const arrivedLitros = arrivals
      .filter((a) => a.unit === 'litros')
      .reduce((sum, a) => sum + a.quantity, 0);
    const arrivedKilos = arrivals
      .filter((a) => a.unit === 'kilos')
      .reduce((sum, a) => sum + a.quantity, 0);

    const dispatchedLitros = dispatches
      .filter((d) => d.unit === 'litros')
      .reduce((sum, d) => sum + d.quantity, 0);
    const dispatchedKilos = dispatches
      .filter((d) => d.unit === 'kilos')
      .reduce((sum, d) => sum + d.quantity, 0);

    const stockLitros = round2(arrivedLitros - dispatchedLitros);
    const stockKilos = round2(arrivedKilos - dispatchedKilos);

    const totalCapitalUsd = round2(dispatches.reduce((sum, d) => sum + d.totalUsd, 0));
    const totalCapitalBs = round2(dispatches.reduce((sum, d) => sum + d.totalBs, 0));
    const totalPaidUsd = round2(dispatches.reduce((sum, d) => sum + d.totalPaidUsd, 0));
    const totalRemainingUsd = round2(dispatches.reduce((sum, d) => sum + d.remainingUsd, 0));
    const totalRemainingBs = round2(totalRemainingUsd * farm.defaultExchangeRate);

    const arrivalCostUsd = round2(arrivals.reduce((sum, a) => sum + a.costUsd, 0));

    return {
      arrivedLitros: round2(arrivedLitros),
      arrivedKilos: round2(arrivedKilos),
      dispatchedLitros: round2(dispatchedLitros),
      dispatchedKilos: round2(dispatchedKilos),
      stockLitros,
      stockKilos,
      totalCapitalUsd,
      totalCapitalBs,
      totalPaidUsd,
      totalRemainingUsd,
      totalRemainingBs,
      arrivalCostUsd,
      collectionPct: totalCapitalUsd > 0 ? Math.round((totalPaidUsd / totalCapitalUsd) * 100) : 0,
    };
  }, [arrivals, dispatches, farm.defaultExchangeRate]);

  const pendingByPerson = useMemo(() => {
    const map = new Map<
      string,
      {
        personId: string;
        personName: string;
        count: number;
        totalUsd: number;
        paidUsd: number;
        remainingUsd: number;
        latestDispatch: MolassesDispatch;
      }
    >();

    for (const d of dispatches) {
      if (d.remainingUsd <= 0.009) continue;
      const existing = map.get(d.personId);
      if (existing) {
        existing.count += 1;
        existing.totalUsd = round2(existing.totalUsd + d.totalUsd);
        existing.paidUsd = round2(existing.paidUsd + d.totalPaidUsd);
        existing.remainingUsd = round2(existing.remainingUsd + d.remainingUsd);
      } else {
        map.set(d.personId, {
          personId: d.personId,
          personName: d.personName,
          count: 1,
          totalUsd: d.totalUsd,
          paidUsd: d.totalPaidUsd,
          remainingUsd: d.remainingUsd,
          latestDispatch: d,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.remainingUsd - a.remainingUsd);
  }, [dispatches]);

  const getNextSlot = (d: MolassesDispatch) => {
    const used = new Set(d.abonos.map((a) => a.slot));
    for (let s = 1; s <= 15; s++) {
      if (!used.has(s)) return s;
    }
    return 1;
  };

  return (
    <div className="space-y-6">
      {/* 4 Single-Elevation KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500">
            Melaza disponible en finca
          </p>
          <div className="space-y-1">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatQty(stats.stockLitros, 'litros')}
            </p>
            { (stats.arrivedKilos > 0 || stats.dispatchedKilos > 0) && (
              <p className="text-sm font-semibold font-mono tabular-nums text-slate-700">
                {formatQty(stats.stockKilos, 'kilos')}
              </p>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono tabular-nums pt-1 border-t border-slate-100">
            Entró {formatQty(stats.arrivedLitros, 'litros')} · Salió {formatQty(stats.dispatchedLitros, 'litros')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500">
            Capital total despachado
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatUsd(stats.totalCapitalUsd)}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums pt-1 border-t border-slate-100">
            {formatBs(stats.totalCapitalBs)} · {dispatches.length} ventas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500">
            Total abonado (cobrado)
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatUsd(stats.totalPaidUsd)}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums pt-1 border-t border-slate-100">
            {stats.collectionPct}% recuperado del capital
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500">
            Saldo restante por cobrar
          </p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums ${
              stats.totalRemainingUsd > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {formatUsd(stats.totalRemainingUsd)}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums pt-1 border-t border-slate-100">
            {formatBs(stats.totalRemainingBs)} @ {formatRate(farm.defaultExchangeRate)}
          </p>
        </div>
      </div>

      {/* Quick Action Bar */}
      {canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Acciones rápidas</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>{persons.length} personas registradas</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>{farm.authorizedEmails.length} usuarios Gmail con acceso</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNewArrival}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
              Registrar llegada
            </button>
            <button
              type="button"
              onClick={onNewDispatch}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nuevo despacho
            </button>
          </div>
        </div>
      )}

      {/* Two-Column Operational Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pending Accounts per Person */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Saldos pendientes por persona
              </h2>
              <p className="text-xs text-slate-500">
                Haz clic en Abonar para descontar directamente del capital inicial
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('persons')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              Ver todas
            </button>
          </div>

          {pendingByPerson.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">
                No hay saldos pendientes por cobrar
              </p>
              <p className="text-xs text-slate-500">
                Cuando registres un despacho con saldo restante aparecerá aquí.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="text-left px-5 py-2.5">Persona</th>
                    <th className="text-right px-4 py-2.5">Capital $</th>
                    <th className="text-right px-4 py-2.5">Abonado $</th>
                    <th className="text-right px-4 py-2.5">Restante</th>
                    <th className="text-right px-5 py-2.5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingByPerson.slice(0, 6).map((row) => (
                    <tr key={row.personId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{row.personName}</div>
                        <div className="text-xs text-slate-500">
                          {row.count} {row.count === 1 ? 'despacho pendiente' : 'despachos pendientes'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatUsd(row.totalUsd)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                        {formatUsd(row.paidUsd)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono tabular-nums font-semibold text-amber-700">
                          {formatUsd(row.remainingUsd)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500">
                          {formatBs(row.remainingUsd * farm.defaultExchangeRate)}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAbono(row.latestDispatch, getNextSlot(row.latestDispatch))
                            }
                            className="px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            + Abonar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Solo lectura</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Movements (Arrivals + Dispatches) */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Últimos movimientos
              </h2>
              <p className="text-xs text-slate-500">
                Llegadas a finca y despachos recientes
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dispatches')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
            >
              Ver libro completo
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {[
              ...arrivals.slice(0, 4).map((a) => ({
                id: `arr_${a.id}`,
                kind: 'arrival' as const,
                date: a.arrivalDate,
                title: `Entrada · ${a.supplier}`,
                subtitle: `${formatQty(a.quantity, a.unit)} · ${formatUsd(a.costUsd)}`,
                rightTop: `+${formatQty(a.quantity, a.unit)}`,
                rightBottom: formatIsoDateShort(a.arrivalDate),
              })),
              ...dispatches.slice(0, 5).map((d) => ({
                id: `dis_${d.id}`,
                kind: 'dispatch' as const,
                date: d.saleDate,
                title: `Despacho · ${d.personName}`,
                subtitle: `${formatQty(d.quantity, d.unit)} · ${formatUsd(d.totalUsd)} · Rest. ${formatUsd(d.remainingUsd)}`,
                rightTop: `-${formatQty(d.quantity, d.unit)}`,
                rightBottom: formatIsoDateShort(d.saleDate),
              })),
            ]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 7)
              .map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {item.kind === 'arrival' ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-amber-700" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-semibold font-mono tabular-nums ${
                        item.kind === 'arrival' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {item.rightTop}
                    </p>
                    <p className="text-xs text-slate-400 font-mono tabular-nums">
                      {item.rightBottom}
                    </p>
                  </div>
                </div>
              ))}

            {arrivals.length === 0 && dispatches.length === 0 && (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Sin movimientos todavía
                </p>
                <p className="text-xs text-slate-500">
                  Comienza registrando la llegada de melaza o tu primer despacho.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
