import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  BLUEPRINT_LIMITS,
  type BcvRateInfo,
  type Collaborator,
  type CollaboratorRole,
  type Farm,
  type MolassesArrival,
  type MolassesDispatch,
  type PersonAccount,
} from '../types/molasses';
import {
  formatIsoDateShort,
  saveAndShareTextFile,
  todayIsoDate,
} from '../utils/format';
import { DriveStoragePanel } from './DriveStoragePanel';
import { PWAInstallButton } from './PWAInstallButton';

interface CollaboratorsViewProps {
  farm: Farm;
  userEmail: string;
  isCloudMode: boolean;
  authLoading?: boolean;
  authError?: string | null;
  onSignIn?: () => Promise<void>;
  arrivals: MolassesArrival[];
  persons: PersonAccount[];
  dispatches: MolassesDispatch[];
  collaborators: Collaborator[];
  bcvInfo: BcvRateInfo | null;
  bcvSyncing: boolean;
  isOwner: boolean;
  canEdit: boolean;
  onSyncBcvNow: () => Promise<void>;
  onUpdateFarm: (updates: {
    name?: string;
    defaultExchangeRate?: number;
    densityKgPerLiter?: number;
    bcvAutoSync?: boolean;
  }) => Promise<void>;
  onAddCollaborator: (
    email: string,
    displayName: string,
    role: CollaboratorRole
  ) => Promise<void>;
  onChangeRole: (collab: Collaborator, newRole: CollaboratorRole) => Promise<void>;
  onRemoveCollaborator: (collab: Collaborator) => void;
  onCreateNewFarm: (name: string) => Promise<void>;
  onRestoreBackup: (backup: {
    arrivals: MolassesArrival[];
    persons: PersonAccount[];
    dispatches: MolassesDispatch[];
  }) => Promise<{ importedCount: number }>;
  onRequestConfirm: (opts: {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}

export const CollaboratorsView: React.FC<CollaboratorsViewProps> = ({
  farm,
  userEmail,
  isCloudMode,
  authLoading = false,
  authError = null,
  onSignIn,
  arrivals,
  persons,
  dispatches,
  collaborators,
  bcvInfo,
  bcvSyncing,
  isOwner,
  canEdit,
  onSyncBcvNow,
  onUpdateFarm,
  onAddCollaborator,
  onChangeRole,
  onRemoveCollaborator,
  onCreateNewFarm,
  onRestoreBackup,
  onRequestConfirm,
}) => {
  const [farmName, setFarmName] = useState(farm.name);
  const [rate, setRate] = useState(String(farm.defaultExchangeRate));
  const [density, setDensity] = useState(String(farm.densityKgPerLiter));
  const [bcvAutoSync, setBcvAutoSync] = useState(farm.bcvAutoSync ?? true);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<CollaboratorRole>('operador');
  const [collabError, setCollabError] = useState<string | null>(null);
  const [collabSuccess, setCollabSuccess] = useState<string | null>(null);
  const [addingCollab, setAddingCollab] = useState(false);

  const [extraFarmName, setExtraFarmName] = useState('');
  const [creatingFarm, setCreatingFarm] = useState(false);

  const [localBackupMsg, setLocalBackupMsg] = useState<string | null>(null);
  const [localBackupErr, setLocalBackupErr] = useState<string | null>(null);
  const [localBackupBusy, setLocalBackupBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isNativeApk = Capacitor.isNativePlatform();

  useEffect(() => {
    setFarmName(farm.name);
    setRate(String(farm.defaultExchangeRate));
    setDensity(String(farm.densityKgPerLiter));
    setBcvAutoSync(farm.bcvAutoSync ?? true);
  }, [farm]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      await onUpdateFarm({
        name: isOwner ? farmName.trim() : undefined,
        defaultExchangeRate: Number(rate) || farm.defaultExchangeRate,
        densityKgPerLiter: Number(density) || farm.densityKgPerLiter,
        bcvAutoSync,
      });
      setSettingsMsg('Configuración actualizada.');
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddCollab = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollabError(null);
    setCollabSuccess(null);
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setCollabError('Ingresa un correo Gmail válido.');
      return;
    }
    setAddingCollab(true);
    try {
      await onAddCollaborator(newEmail.trim(), newName.trim(), newRole);
      setCollabSuccess(
        `Acceso concedido a ${newEmail.trim().toLowerCase()}. Al iniciar sesión con ese Gmail verá esta finca.`
      );
      setNewEmail('');
      setNewName('');
      setNewRole('operador');
    } catch (err) {
      setCollabError(
        err instanceof Error ? err.message : 'No se pudo autorizar el usuario.'
      );
    } finally {
      setAddingCollab(false);
    }
  };

  const handleCreateExtraFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraFarmName.trim()) return;
    setCreatingFarm(true);
    try {
      await onCreateNewFarm(extraFarmName.trim());
      setExtraFarmName('');
    } finally {
      setCreatingFarm(false);
    }
  };

  const handleExportLocalBackup = async () => {
    setLocalBackupErr(null);
    setLocalBackupMsg(null);
    setLocalBackupBusy(true);
    try {
      const payload = {
        app: 'MelazaFinca',
        version: 1,
        exportedAt: new Date().toISOString(),
        farmName: farm.name,
        arrivals,
        persons,
        dispatches,
      };
      const safeName = farm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await saveAndShareTextFile(
        `respaldo-melazafinca-${safeName}-${todayIsoDate()}.json`,
        JSON.stringify(payload, null, 2),
        'application/json;charset=utf-8;',
        `Respaldo MelazaFinca — ${farm.name}`
      );
      setLocalBackupMsg(
        `Respaldo generado (${arrivals.length} entradas, ${dispatches.length} despachos, ${persons.length} personas).`
      );
    } catch (err) {
      setLocalBackupErr(
        err instanceof Error ? err.message : 'No se pudo exportar el respaldo.'
      );
    } finally {
      setLocalBackupBusy(false);
    }
  };

  const handleLocalFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLocalBackupErr(null);
    setLocalBackupMsg(null);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as {
        arrivals?: MolassesArrival[];
        persons?: PersonAccount[];
        dispatches?: MolassesDispatch[];
      };
      if (
        !Array.isArray(parsed.arrivals) &&
        !Array.isArray(parsed.persons) &&
        !Array.isArray(parsed.dispatches)
      ) {
        setLocalBackupErr('El archivo seleccionado no es un respaldo válido de MelazaFinca.');
        return;
      }
      const arrivalList = Array.isArray(parsed.arrivals) ? parsed.arrivals : [];
      const personList = Array.isArray(parsed.persons) ? parsed.persons : [];
      const dispatchList = Array.isArray(parsed.dispatches) ? parsed.dispatches : [];
      onRequestConfirm({
        title: 'Restaurar respaldo en este dispositivo',
        description: `Se importarán ${arrivalList.length} entradas, ${personList.length} personas y ${dispatchList.length} despachos en "${farm.name}".`,
        confirmLabel: 'Restaurar respaldo',
        onConfirm: async () => {
          const res = await onRestoreBackup({
            arrivals: arrivalList,
            persons: personList,
            dispatches: dispatchList,
          });
          setLocalBackupMsg(`Respaldo restaurado (${res.importedCount} registros importados).`);
        },
      });
    } catch {
      setLocalBackupErr('No se pudo leer el archivo JSON de respaldo.');
    }
  };

  return (
    <div className="space-y-6">
      {isCloudMode ? (
        <DriveStoragePanel
          farm={farm}
          userEmail={userEmail}
          arrivals={arrivals}
          persons={persons}
          dispatches={dispatches}
          canEdit={canEdit}
          onRestoreBackup={onRestoreBackup}
          onRequestConfirm={onRequestConfirm}
        />
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-700 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">
                  Almacenamiento en el dispositivo (Sin Gmail)
                </h2>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                Tus registros (<strong className="text-slate-700 font-mono tabular-nums">{arrivals.length}</strong> entradas, <strong className="text-slate-700 font-mono tabular-nums">{dispatches.length}</strong> despachos, <strong className="text-slate-700 font-mono tabular-nums">{persons.length}</strong> personas) se guardan automáticamente en la memoria nativa del teléfono. También puedes exportar o restaurar un respaldo en archivo cuando quieras.
              </p>
              {authError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                  {authError}
                </p>
              )}
            </div>
            {onSignIn && (
              <button
                type="button"
                onClick={() => void onSignIn()}
                disabled={authLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[44px] sm:min-h-0"
              >
                {authLoading ? 'Conectando...' : 'Conectar Gmail (Opcional)'}
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleExportLocalBackup()}
              disabled={localBackupBusy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5" />
              {localBackupBusy ? 'Generando...' : 'Guardar respaldo (.json)'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleLocalFilePicked(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer min-h-[40px]"
            >
              <Upload className="w-3.5 h-3.5" />
              Cargar respaldo (.json)
            </button>
          </div>

          {localBackupMsg && (
            <p className="text-xs text-emerald-700 font-medium">{localBackupMsg}</p>
          )}
          {localBackupErr && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {localBackupErr}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Authorized Gmail Users */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Usuarios Gmail con acceso a esta finca
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isCloudMode
                ? 'Agrega el correo Gmail de otro usuario para que pueda iniciar sesión con Google e interactuar con el inventario, despachos y abonos en tiempo real.'
                : 'Actualmente estás en acceso directo local sin restricción de Gmail. Conecta una cuenta Gmail si más adelante quieres invitar colaboradores en la nube.'}
            </p>
          </div>

        {!isCloudMode ? (
          <p className="text-xs text-slate-500">
            No se requiere correo Gmail para registrar llegadas, despachos, personas o abonos en este modo de acceso directo.
          </p>
        ) : (
          <>
        {/* Owner Row */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {farm.ownerEmail}
            </p>
            <p className="text-xs text-slate-500">
              Propietario principal · Control total
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 shrink-0">
            <ShieldCheck className="w-4 h-4" />
            Propietario
          </span>
        </div>

        {/* Collaborator List */}
        {collaborators.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            Todavía no has autorizado otros correos Gmail en esta finca.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {collaborators.map((c) => (
              <div
                key={c.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {c.displayName}
                  </p>
                  <p className="text-xs text-slate-500 font-mono truncate">
                    {c.email}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isOwner ? (
                    <>
                      <select
                        value={c.role}
                        onChange={(e) =>
                          void onChangeRole(c, e.target.value as CollaboratorRole)
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
                      >
                        <option value="operador">Operador (registrar y abonar)</option>
                        <option value="admin">Administrador (puede editar)</option>
                        <option value="consulta">Solo lectura</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onRemoveCollaborator(c)}
                        title="Quitar acceso"
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-600 capitalize">
                      {c.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Invite Collaborator Form (Owner Only) */}
        {isOwner ? (
          <form
            onSubmit={handleAddCollab}
            className="pt-4 border-t border-slate-200 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Autorizar otro usuario Gmail
            </h3>

            {collabError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {collabError}
              </div>
            )}
            {collabSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                {collabSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Correo Gmail del usuario
                </label>
                <input
                  type="email"
                  maxLength={BLUEPRINT_LIMITS.EMAIL_MAX}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="colaborador@gmail.com"
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre / Alias
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.PERSON_NAME_MAX}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Encargado"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-700">Permiso:</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as CollaboratorRole)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
                >
                  <option value="operador">Operador (registrar llegadas, despachos y abonos)</option>
                  <option value="consulta">Solo consulta (ver inventario y cuentas)</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={addingCollab}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {addingCollab ? 'Autorizando...' : 'Autorizar usuario Gmail'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
            Solo el propietario ({farm.ownerEmail}) puede agregar o quitar usuarios Gmail de esta finca.
          </p>
        )}
          </>
        )}
      </section>

      {/* Right: Farm Settings & Multi-Farm Creator */}
      <div className="lg:col-span-5 space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Tasa oficial BCV y configuración
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Conectado al Banco Central de Venezuela (bcv.org.ve)
              </p>
            </div>
            <a
              href="https://www.bcv.org.ve/notas-de-prensa/bcv-y-banca-articulan-acciones-de-politica-monetaria-para-consolidar-la-estabilidad"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              BCV
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-700">
                Tasa USD ($) del BCV
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {bcvInfo
                  ? `${bcvInfo.exactRate.toFixed(4)} Bs/$ · Fecha valor: ${formatIsoDateShort(bcvInfo.fechaValorIso)}`
                  : farm.bcvFechaValor
                  ? `Última sincronización: ${formatIsoDateShort(farm.bcvFechaValor)}`
                  : 'Listo para sincronizar'}
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => void onSyncBcvNow()}
                disabled={bcvSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${bcvSyncing ? 'animate-spin' : ''}`} />
                {bcvSyncing ? 'Consultando...' : 'Sincronizar BCV'}
              </button>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            {isOwner && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre de la finca
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.FARM_NAME_MAX}
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tasa referencial hoy (Bs/$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  disabled={!canEdit}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Densidad ref. (Kg/L)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="10"
                  disabled={!canEdit}
                  value={density}
                  onChange={(e) => setDensity(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 disabled:bg-slate-50"
                />
              </div>
            </div>

            {canEdit && (
              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bcvAutoSync}
                  onChange={(e) => setBcvAutoSync(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>
                  Actualizar automáticamente todos los días la tasa referencial del dólar ($) desde bcv.org.ve
                </span>
              </label>
            )}

            {settingsMsg && (
              <p className="text-xs text-emerald-700 font-medium">{settingsMsg}</p>
            )}

            {canEdit && (
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {savingSettings ? 'Guardando...' : 'Guardar configuración'}
              </button>
            )}
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Crear otra finca independiente
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Si manejas más de una finca o lote separado, puedes crear otro espacio de trabajo.
            </p>
          </div>

          <form onSubmit={handleCreateExtraFarm} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.FARM_NAME_MAX}
              value={extraFarmName}
              onChange={(e) => setExtraFarmName(e.target.value)}
              placeholder="Nombre de la nueva finca"
              required
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 min-h-[44px] sm:min-h-0"
            />
            <button
              type="submit"
              disabled={creatingFarm}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            >
              {creatingFarm ? 'Creando...' : 'Crear finca'}
            </button>
          </form>
        </section>

        {!isNativeApk && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Instalar como App (Celular y PC)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Instala MelazaFinca en la pantalla de inicio de tu teléfono Android, iPhone o computadora para abrirla sin barra del navegador y consultar datos guardados sin conexión.
                </p>
              </div>
            </div>
            <div className="pt-1">
              <PWAInstallButton showGuideFallback />
            </div>
          </section>
        )}
      </div>
    </div>
    </div>
  );
};
