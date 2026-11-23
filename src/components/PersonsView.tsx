import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Mail,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  type Farm,
  type MolassesDispatch,
  type PersonAccount,
} from '../types/molasses';
import {
  buildGmailComposeUrl,
  formatBs,
  formatIsoDateShort,
  formatQty,
  formatRate,
  formatUsd,
  round2,
} from '../utils/format';

interface PersonsViewProps {
  farm: Farm;
  persons: PersonAccount[];
  dispatches: MolassesDispatch[];
  canEdit: boolean;
  onSavePerson: (input: {
    id?: string;
    name: string;
    phone: string;
    email: string;
    notes: string;
  }) => Promise<void>;
  onNewDispatchForPerson: (personId: string) => void;
  onOpenAbono: (dispatch: MolassesDispatch, slot: number) => void;
}

export const PersonsView: React.FC<PersonsViewProps> = ({
  farm,
  persons,
  dispatches,
  canEdit,
  onSavePerson,
  onNewDispatchForPerson,
  onOpenAbono,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonAccount | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const personSummaries = useMemo(() => {
    const map = new Map<string, MolassesDispatch[]>();
    for (const d of dispatches) {
      const list = map.get(d.personId) || [];
      list.push(d);
      map.set(d.personId, list);
    }

    return persons
      .map((p) => {
        const list = map.get(p.id) || [];
        const totalLitros = round2(
          list.filter((d) => d.unit === 'litros').reduce((s, d) => s + d.quantity, 0)
        );
        const totalKilos = round2(
          list.filter((d) => d.unit === 'kilos').reduce((s, d) => s + d.quantity, 0)
        );
        const capitalUsd = round2(list.reduce((s, d) => s + d.totalUsd, 0));
        const paidUsd = round2(list.reduce((s, d) => s + d.totalPaidUsd, 0));
        const remainingUsd = round2(list.reduce((s, d) => s + d.remainingUsd, 0));
        return {
          person: p,
          dispatches: list,
          totalLitros,
          totalKilos,
          capitalUsd,
          paidUsd,
          remainingUsd,
        };
      })
      .filter((row) => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;
        return (
          row.person.name.toLowerCase().includes(term) ||
          row.person.email.toLowerCase().includes(term) ||
          row.person.phone.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.remainingUsd - a.remainingUsd || a.person.name.localeCompare(b.person.name, 'es'));
  }, [persons, dispatches, searchTerm]);

  const openCreateModal = () => {
    setEditingPerson(null);
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: PersonAccount) => {
    setEditingPerson(p);
    setName(p.name);
    setPhone(p.phone || '');
    setEmail(p.email || '');
    setNotes(p.notes || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('El nombre de la persona es obligatorio.');
      return;
    }
    setIsSaving(true);
    try {
      await onSavePerson({
        id: editingPerson?.id,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
      });
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar persona.');
    } finally {
      setIsSaving(false);
    }
  };

  const getNextSlot = (d: MolassesDispatch) => {
    const used = new Set(d.abonos.map((a) => a.slot));
    for (let s = 1; s <= BLUEPRINT_LIMITS.ABONOS_MAX; s++) {
      if (!used.has(s)) return s;
    }
    return 1;
  };

  const buildAccountStatementUrl = (row: (typeof personSummaries)[number]) => {
    const lines = row.dispatches.map(
      (d) =>
        `• ${formatIsoDateShort(d.saleDate)}: ${formatQty(d.quantity, d.unit)} | Capital ${formatUsd(d.totalUsd)} (${formatBs(d.totalBs)}) | Abonado ${formatUsd(d.totalPaidUsd)} | Restante ${formatUsd(d.remainingUsd)}`
    );
    const body = [
      `ESTADO DE CUENTA DE MELAZA — ${farm.name}`,
      `Persona: ${row.person.name}`,
      `Tasa referencial actual: ${formatRate(farm.defaultExchangeRate)}`,
      '',
      ...(lines.length > 0 ? lines : ['Sin despachos registrados']),
      '',
      `Total Capital: ${formatUsd(row.capitalUsd)}`,
      `Total Abonado: ${formatUsd(row.paidUsd)}`,
      `Saldo Restante Total: ${formatUsd(row.remainingUsd)} (${formatBs(row.remainingUsd * farm.defaultExchangeRate)})`,
    ].join('\n');

    return buildGmailComposeUrl(
      row.person.email || '',
      `Estado de cuenta melaza — ${row.person.name} (${farm.name})`,
      body
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar persona por nombre, teléfono o Gmail..."
            className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 min-h-[44px] sm:min-h-0"
          />
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
          >
            <UserPlus className="w-4 h-4" />
            Agregar persona
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {personSummaries.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">
              No hay personas registradas todavía
            </p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Agrega compradores o encargados para llevar el historial de litros/kilos despachados, sus abonos y saldo restante por persona.
            </p>
            {canEdit && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Agregar primera persona
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {personSummaries.map((row) => {
              const isExpanded = expandedId === row.person.id;
              return (
                <div key={row.person.id}>
                  <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : row.person.id)
                        }
                        className="mt-0.5 p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                        aria-label="Ver detalle"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {row.person.name}
                          </h3>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(row.person)}
                              title="Editar contacto"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {[
                            `${row.dispatches.length} ${row.dispatches.length === 1 ? 'venta' : 'ventas'}`,
                            row.totalLitros > 0 ? formatQty(row.totalLitros, 'litros') : '',
                            row.totalKilos > 0 ? formatQty(row.totalKilos, 'kilos') : '',
                            row.person.phone || '',
                            row.person.email || '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 justify-between lg:justify-end">
                      <div className="flex items-center gap-6 text-xs font-mono tabular-nums">
                        <div>
                          <div className="text-slate-400">Capital</div>
                          <div className="font-semibold text-slate-900">
                            {formatUsd(row.capitalUsd)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">Abonado</div>
                          <div className="font-semibold text-emerald-700">
                            {formatUsd(row.paidUsd)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">Restante</div>
                          <div
                            className={`font-semibold ${
                              row.remainingUsd > 0 ? 'text-amber-700' : 'text-slate-600'
                            }`}
                          >
                            {formatUsd(row.remainingUsd)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatBs(row.remainingUsd * farm.defaultExchangeRate)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={buildAccountStatementUrl(row)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Enviar estado de cuenta por Gmail"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Gmail
                        </a>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onNewDispatchForPerson(row.person.id)}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Despachar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-slate-50/70 border-t border-slate-200 px-4 sm:px-6 py-4">
                      {row.dispatches.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Esta persona aún no tiene despachos registrados.
                        </p>
                      ) : (
                        <>
                          {/* Mobile expanded dispatches */}
                          <div className="md:hidden space-y-2.5">
                            {row.dispatches.map((d) => (
                              <div
                                key={d.id}
                                className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                                  <span className="text-slate-700 font-medium">
                                    {formatIsoDateShort(d.saleDate)}
                                  </span>
                                  <span className="text-slate-900 font-semibold">
                                    {formatQty(d.quantity, d.unit)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                                  <span className="text-slate-600">
                                    Cap: {formatUsd(d.totalUsd)}
                                  </span>
                                  <span className="text-emerald-700">
                                    Ab: {formatUsd(d.totalPaidUsd)}
                                  </span>
                                  <span className="font-semibold text-amber-700">
                                    Rest: {formatUsd(d.remainingUsd)}
                                  </span>
                                </div>
                                {canEdit && (
                                  <div className="pt-1 flex justify-end">
                                    {d.status !== 'pagado' ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenAbono(d, getNextSlot(d))}
                                        className="w-full min-h-[44px] px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                                      >
                                        + Abono {getNextSlot(d)}
                                      </button>
                                    ) : (
                                      <span className="text-emerald-700 font-medium">
                                        Pagado
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Desktop expanded dispatches */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                                  <th className="text-left py-2 pr-3">Fecha</th>
                                  <th className="text-right py-2 px-3">Cantidad</th>
                                  <th className="text-right py-2 px-3">Capital $ / Bs.V</th>
                                  <th className="text-right py-2 px-3">Abonos registrados</th>
                                  <th className="text-right py-2 px-3">Restante $</th>
                                  {canEdit && <th className="text-right py-2 pl-3">Abonar</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/70">
                                {row.dispatches.map((d) => (
                                  <tr key={d.id}>
                                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700">
                                      {formatIsoDateShort(d.saleDate)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                                      {formatQty(d.quantity, d.unit)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                      <span className="font-semibold text-slate-900">
                                        {formatUsd(d.totalUsd)}
                                      </span>{' '}
                                      <span className="text-slate-500">
                                        ({formatBs(d.totalBs)})
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                                      {d.abonos.length > 0
                                        ? `${d.abonos.length} abonos (${formatUsd(d.totalPaidUsd)})`
                                        : 'Sin abonos'}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                                      {formatUsd(d.remainingUsd)}
                                    </td>
                                    {canEdit && (
                                      <td className="py-2.5 pl-3 text-right">
                                        {d.status !== 'pagado' ? (
                                          <button
                                            type="button"
                                            onClick={() => onOpenAbono(d, getNextSlot(d))}
                                            className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 rounded cursor-pointer whitespace-nowrap"
                                          >
                                            + Abono {getNextSlot(d)}
                                          </button>
                                        ) : (
                                          <span className="text-emerald-700 font-medium">
                                            Pagado
                                          </span>
                                        )}
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Person Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 space-y-5 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingPerson ? 'Editar persona' : 'Nueva persona'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre completo
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.PERSON_NAME_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. José"
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 min-h-[44px] sm:min-h-0"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Teléfono (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0414-0000000"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 min-h-[44px] sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Gmail (opcional)
                  </label>
                  <input
                    type="email"
                    maxLength={BLUEPRINT_LIMITS.EMAIL_MAX}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="persona@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 min-h-[44px] sm:min-h-0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notas
                </label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.PERSON_NOTES_MAX}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Finca, sector, referencia..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer min-h-[44px] sm:min-h-0"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 cursor-pointer min-h-[44px] sm:min-h-0"
                >
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
