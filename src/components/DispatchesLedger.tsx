import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  Copy,
  Download,
  Edit2,
  Mail,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  BLUEPRINT_LIMITS,
  type DispatchStatus,
  type Farm,
  type MolassesDispatch,
  type PersonAccount,
  type UnitType,
} from '../types/molasses';
import {
  buildDispatchSummaryText,
  buildGmailComposeUrl,
  exportDispatchesToCsv,
  formatBs,
  formatIsoDateShort,
  formatQty,
  formatRate,
  formatUsd,
  round2,
  shareTextNatively,
} from '../utils/format';

interface DispatchesLedgerProps {
  farm: Farm;
  dispatches: MolassesDispatch[];
  persons: PersonAccount[];
  canEdit: boolean;
  isOwner: boolean;
  onNewDispatch: () => void;
  onEditDispatch: (dispatch: MolassesDispatch) => void;
  onDeleteDispatch: (dispatch: MolassesDispatch) => void;
  onOpenAbono: (dispatch: MolassesDispatch, slot: number) => void;
}

export const DispatchesLedger: React.FC<DispatchesLedgerProps> = ({
  farm,
  dispatches,
  persons,
  canEdit,
  isOwner,
  onNewDispatch,
  onEditDispatch,
  onDeleteDispatch,
  onOpenAbono,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DispatchStatus>('all');
  const [unitFilter, setUnitFilter] = useState<'all' | UnitType>('all');
  const [abonoColumnsCount, setAbonoColumnsCount] = useState<number>(
    BLUEPRINT_LIMITS.DEFAULT_ABONO_COLUMNS
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const personEmailMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of persons) {
      if (p.email) m.set(p.id, p.email);
    }
    return m;
  }, [persons]);

  const maxSlotUsed = useMemo(() => {
    let max = abonoColumnsCount;
    for (const d of dispatches) {
      for (const a of d.abonos) {
        if (a.slot > max) max = a.slot;
      }
    }
    return Math.min(BLUEPRINT_LIMITS.ABONOS_MAX, max);
  }, [dispatches, abonoColumnsCount]);

  const abonoSlots = useMemo(
    () => Array.from({ length: maxSlotUsed }, (_, idx) => idx + 1),
    [maxSlotUsed]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return dispatches.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (unitFilter !== 'all' && d.unit !== unitFilter) return false;
      if (term) {
        const hay = `${d.personName} ${d.saleDate} ${d.notes}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [dispatches, searchTerm, statusFilter, unitFilter]);

  const filteredTotals = useMemo(() => {
    return filtered.reduce(
      (acc, d) => {
        acc.totalUsd = round2(acc.totalUsd + d.totalUsd);
        acc.totalBs = round2(acc.totalBs + d.totalBs);
        acc.paidUsd = round2(acc.paidUsd + d.totalPaidUsd);
        acc.remainingUsd = round2(acc.remainingUsd + d.remainingUsd);
        return acc;
      },
      { totalUsd: 0, totalBs: 0, paidUsd: 0, remainingUsd: 0 }
    );
  }, [filtered]);

  const handleCopySummary = async (d: MolassesDispatch) => {
    const txt = buildDispatchSummaryText(d, farm.name, farm.defaultExchangeRate);
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedId(d.id);
      setTimeout(() => setCopiedId((prev) => (prev === d.id ? null : prev)), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const handleShareSummary = async (d: MolassesDispatch) => {
    const txt = buildDispatchSummaryText(d, farm.name, farm.defaultExchangeRate);
    const title = `Despacho de melaza — ${d.personName} (${formatIsoDateShort(d.saleDate)})`;
    const shared = await shareTextNatively(title, txt);
    if (!shared) {
      await handleCopySummary(d);
    }
  };

  const isNativeApk = Capacitor.isNativePlatform();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por persona, fecha o nota..."
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 min-h-[44px] sm:min-h-0"
            />
          </div>

          {/* Status Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(
              [
                { key: 'all', label: 'Todos' },
                { key: 'pendiente', label: 'Sin abono' },
                { key: 'abonando', label: 'Abonando' },
                { key: 'pagado', label: 'Pagado' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] sm:min-h-0 ${
                  statusFilter === opt.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Unit Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            {(
              [
                { key: 'all', label: 'Lts / Kg' },
                { key: 'litros', label: 'Litros' },
                { key: 'kilos', label: 'Kilos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setUnitFilter(opt.key)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] sm:min-h-0 ${
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

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {maxSlotUsed < BLUEPRINT_LIMITS.ABONOS_MAX && (
            <button
              type="button"
              onClick={() =>
                setAbonoColumnsCount((prev) => Math.min(BLUEPRINT_LIMITS.ABONOS_MAX, prev + 1))
              }
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            >
              + Columna Abono ({maxSlotUsed + 1})
            </button>
          )}
          <button
            type="button"
            onClick={() => void exportDispatchesToCsv(filtered, farm.defaultExchangeRate, farm.name)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onNewDispatch}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo despacho
            </button>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-slate-600">
          Mostrando <strong className="text-slate-900 font-mono tabular-nums">{filtered.length}</strong> despachos ·{' '}
          <span className="text-slate-500">Toca cualquier Abono 1 a {maxSlotUsed} para registrar o editar un pago</span>
        </span>
        <div className="flex flex-wrap items-center gap-4 sm:gap-5 font-mono tabular-nums">
          <span className="text-slate-600">
            Capital: <strong className="text-slate-900">{formatUsd(filteredTotals.totalUsd)}</strong>
          </span>
          <span className="text-slate-600">
            Abonado: <strong className="text-emerald-700">{formatUsd(filteredTotals.paidUsd)}</strong>
          </span>
          <span className="text-slate-600">
            Restante: <strong className="text-amber-700">{formatUsd(filteredTotals.remainingUsd)}</strong>
          </span>
        </div>
      </div>

      {/* Empty State OR Mobile Card List + Desktop Spreadsheet Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 sm:p-12 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">
              {dispatches.length === 0
                ? 'Aún no hay despachos de melaza registrados'
                : 'No hay despachos que coincidan con el filtro'}
            </p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Registra ventas por persona (ej. José · 10 Lts · $19.00 · 9.159 Bs.V) y controla cada abono hasta completar el pago.
            </p>
            {canEdit && dispatches.length === 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onNewDispatch}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Registrar primer despacho
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Card View (< md) */}
            <div className="md:hidden divide-y divide-slate-200">
              {filtered.map((d) => {
                const slotMap = new Map(d.abonos.map((a) => [a.slot, a]));
                const isLockedForEditor = d.status === 'pagado' && !isOwner;
                const canEditThisRow = canEdit && !isLockedForEditor;
                const recipientEmail = personEmailMap.get(d.personId) || '';
                const gmailUrl = buildGmailComposeUrl(
                  recipientEmail,
                  `Estado de despacho de melaza — ${d.personName} (${formatIsoDateShort(d.saleDate)})`,
                  buildDispatchSummaryText(d, farm.name, farm.defaultExchangeRate)
                );
                const remainingBsToday = round2(d.remainingUsd * farm.defaultExchangeRate);

                return (
                  <div key={d.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {d.personName}
                        </h3>
                        <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                          {formatIsoDateShort(d.saleDate)} · {formatQty(d.quantity, d.unit)} · Tasa {formatRate(d.exchangeRateBs)}
                        </p>
                        {d.notes && (
                          <p className="text-xs text-slate-500 mt-1">{d.notes}</p>
                        )}
                      </div>

                      <div className="shrink-0 text-xs">
                        {d.status === 'pagado' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Pagado
                          </span>
                        ) : d.status === 'abonando' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            Abonando
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                            <CircleDashed className="w-3.5 h-3.5" />
                            Pendiente
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono tabular-nums">
                      <div>
                        <span className="block text-[11px] text-slate-400">Capital</span>
                        <span className="font-semibold text-slate-900">
                          {formatUsd(d.totalUsd)}
                        </span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {formatBs(d.totalBs)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-400">Abonado</span>
                        <span className="font-semibold text-emerald-700">
                          {formatUsd(d.totalPaidUsd)}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          ¿Abonó?: {d.hasAbono ? 'Sí' : 'No'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-400">Restante</span>
                        <span
                          className={`font-semibold ${
                            d.remainingUsd > 0 ? 'text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          {formatUsd(d.remainingUsd)}
                        </span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {formatBs(remainingBsToday)}
                        </span>
                      </div>
                    </div>

                    {/* 10+ Tappable Abonos Strip */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500">
                        Abonos (1 a {maxSlotUsed})
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {abonoSlots.map((slot) => {
                          const entry = slotMap.get(slot);
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={!canEditThisRow && !entry}
                              onClick={() => canEditThisRow && onOpenAbono(d, slot)}
                              className={`min-h-[44px] px-1.5 py-1 rounded-lg border text-center transition-colors ${
                                entry
                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                                  : canEditThisRow
                                  ? 'bg-white border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-700'
                                  : 'bg-slate-50 border-slate-100 text-slate-300'
                              }`}
                            >
                              <span className="block text-[10px] font-medium">
                                Ab.{slot}
                              </span>
                              <span className="block text-[11px] font-mono tabular-nums font-semibold truncate">
                                {entry ? formatUsd(entry.amountUsd) : '—'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {isNativeApk ? (
                        <button
                          type="button"
                          onClick={() => void handleShareSummary(d)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Compartir
                        </button>
                      ) : (
                        <a
                          href={gmailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Gmail
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopySummary(d)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                      >
                        {copiedId === d.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        Copiar
                      </button>
                      {canEditThisRow && (
                        <button
                          type="button"
                          onClick={() => onEditDispatch(d)}
                          aria-label="Editar despacho"
                          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onDeleteDispatch(d)}
                          aria-label="Eliminar despacho"
                          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-red-700 bg-red-50/70 border border-red-200 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Spreadsheet Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[1650px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-3 border-r border-slate-200 whitespace-nowrap">
                      Fecha venta
                    </th>
                  <th className="sticky left-[102px] z-20 bg-slate-50 text-left px-4 py-3 border-r border-slate-200 min-w-[140px]">
                    Persona
                  </th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Cantidad</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Capital $</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Costo Bs.V</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Tasa Ref.</th>
                  <th className="text-center px-3 py-3 border-r border-slate-200 whitespace-nowrap">
                    ¿Abonó?
                  </th>
                  {abonoSlots.map((slot) => (
                    <th
                      key={slot}
                      className="text-right px-3 py-3 min-w-[116px] border-r border-slate-100 whitespace-nowrap text-slate-700"
                    >
                      Abono {slot}
                    </th>
                  ))}
                  <th className="text-right px-3 py-3 bg-emerald-50/50 text-emerald-900 whitespace-nowrap">
                    Total Abonado
                  </th>
                  <th className="text-right px-3 py-3 bg-amber-50/50 text-amber-900 whitespace-nowrap">
                    Restante $
                  </th>
                  <th className="text-right px-3 py-3 bg-amber-50/50 text-amber-900 whitespace-nowrap">
                    Restante Bs.V
                  </th>
                  <th className="text-left px-3 py-3 whitespace-nowrap">Estado</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((d) => {
                  const slotMap = new Map(d.abonos.map((a) => [a.slot, a]));
                  const isLockedForEditor = d.status === 'pagado' && !isOwner;
                  const canEditThisRow = canEdit && !isLockedForEditor;
                  const recipientEmail = personEmailMap.get(d.personId) || '';
                  const gmailUrl = buildGmailComposeUrl(
                    recipientEmail,
                    `Estado de despacho de melaza — ${d.personName} (${formatIsoDateShort(d.saleDate)})`,
                    buildDispatchSummaryText(d, farm.name, farm.defaultExchangeRate)
                  );
                  const remainingBsToday = round2(d.remainingUsd * farm.defaultExchangeRate);

                  return (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-2.5 border-r border-slate-200 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatIsoDateShort(d.saleDate)}
                      </td>
                      <td className="sticky left-[102px] z-10 bg-white group-hover:bg-slate-50 px-4 py-2.5 border-r border-slate-200 font-medium text-slate-900">
                        <div className="truncate max-w-[160px]" title={d.personName}>
                          {d.personName}
                        </div>
                        {d.notes && (
                          <div
                            className="text-[11px] font-normal text-slate-400 truncate max-w-[160px]"
                            title={d.notes}
                          >
                            {d.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {formatQty(d.quantity, d.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatUsd(d.totalUsd)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatBs(d.totalBs)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {formatRate(d.exchangeRateBs)}
                      </td>
                      <td className="px-3 py-2.5 text-center border-r border-slate-200 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            d.hasAbono ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {d.hasAbono ? 'Sí' : 'No'}
                        </span>
                      </td>

                      {/* 10+ Abono Columns */}
                      {abonoSlots.map((slot) => {
                        const entry = slotMap.get(slot);
                        return (
                          <td
                            key={slot}
                            className="px-2 py-1.5 text-right border-r border-slate-100 align-middle"
                          >
                            {entry ? (
                              <button
                                type="button"
                                disabled={!canEditThisRow}
                                onClick={() => onOpenAbono(d, slot)}
                                title={`Fecha: ${formatIsoDateShort(entry.date)} · Tasa: ${formatRate(entry.exchangeRateBs)}${entry.note ? ` · ${entry.note}` : ''}`}
                                className={`w-full text-right px-2 py-1 rounded transition-colors ${
                                  canEditThisRow
                                    ? 'hover:bg-emerald-50 cursor-pointer'
                                    : 'cursor-default'
                                }`}
                              >
                                <div className="font-mono tabular-nums font-medium text-emerald-700">
                                  {formatUsd(entry.amountUsd)}
                                </div>
                                <div className="text-[10px] font-mono tabular-nums text-slate-400">
                                  {formatIsoDateShort(entry.date)}
                                </div>
                              </button>
                            ) : canEditThisRow ? (
                              <button
                                type="button"
                                onClick={() => onOpenAbono(d, slot)}
                                className="w-full py-2 px-2 text-center text-[11px] text-slate-300 hover:text-emerald-700 hover:bg-emerald-50/70 rounded transition-colors cursor-pointer"
                              >
                                + Abono {slot}
                              </button>
                            ) : (
                              <span className="block text-center text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700 bg-emerald-50/30 whitespace-nowrap">
                        {formatUsd(d.totalPaidUsd)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold bg-amber-50/30 whitespace-nowrap ${
                          d.remainingUsd > 0 ? 'text-amber-700' : 'text-slate-500'
                        }`}
                      >
                        {formatUsd(d.remainingUsd)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 bg-amber-50/30 whitespace-nowrap">
                        {formatBs(remainingBsToday)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {d.status === 'pagado' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Pagado
                          </span>
                        ) : d.status === 'abonando' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            Abonando
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                            <CircleDashed className="w-3.5 h-3.5" />
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <a
                            href={gmailUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar resumen por Gmail"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleCopySummary(d)}
                            title="Copiar resumen"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            {copiedId === d.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {canEditThisRow && (
                            <button
                              type="button"
                              onClick={() => onEditDispatch(d)}
                              title="Editar despacho"
                              className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onDeleteDispatch(d)}
                              title="Eliminar despacho"
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
