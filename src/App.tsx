import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  ArrowDownLeft,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Users,
  UserCheck,
  X,
} from 'lucide-react';
import { auth, logoutUser, signInWithGoogle } from './firebase';
import {
  addCollaboratorToFarm,
  createFarmWorkspace,
  deleteArrival,
  deleteDispatch,
  fetchBcvRate,
  removeCollaboratorFromFarm,
  restoreFarmDataFromBackup,
  saveArrival,
  saveDispatch,
  saveDispatchAbonoSlot,
  savePerson,
  subscribeFarmData,
  subscribeUserFarms,
  updateCollaboratorRole,
  updateFarmSettings,
} from './services/farmService';
import {
  createLocalFarm,
  deleteLocalArrival,
  deleteLocalDispatch,
  hydrateLocalWorkspace,
  loadLocalWorkspace,
  LOCAL_USER_EMAIL,
  persistLocalWorkspace,
  restoreLocalFarmBackup,
  saveLocalArrival,
  saveLocalDispatch,
  saveLocalDispatchAbonoSlot,
  saveLocalPerson,
  updateLocalFarmSettings,
  type LocalWorkspaceState,
} from './services/localFarmStore';
import type {
  AbonoEntry,
  BcvRateInfo,
  Collaborator,
  CollaboratorRole,
  Farm,
  MolassesArrival,
  MolassesDispatch,
  PersonAccount,
  UnitType,
} from './types/molasses';
import { formatRate, normalizeEmail } from './utils/format';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardOverview } from './components/DashboardOverview';
import { DispatchesLedger } from './components/DispatchesLedger';
import { ArrivalsView } from './components/ArrivalsView';
import { PersonsView } from './components/PersonsView';
import { CollaboratorsView } from './components/CollaboratorsView';
import { ArrivalModal } from './components/ArrivalModal';
import { DispatchModal } from './components/DispatchModal';
import { AbonoModal } from './components/AbonoModal';
import { ConfirmModal } from './components/ConfirmModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

type NavTab = 'overview' | 'dispatches' | 'arrivals' | 'persons' | 'collaborators';

const NAV_ITEMS: {
  key: NavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'overview', label: 'Resumen', mobileLabel: 'Resumen', icon: LayoutDashboard },
  { key: 'dispatches', label: 'Despachos y Abonos', mobileLabel: 'Despachos', icon: BookOpen },
  { key: 'arrivals', label: 'Entradas a Finca', mobileLabel: 'Entradas', icon: ArrowDownLeft },
  { key: 'persons', label: 'Por Persona', mobileLabel: 'Personas', icon: Users },
  { key: 'collaborators', label: 'Drive y Gmail', mobileLabel: 'Drive/Red', icon: UserCheck },
];

const PRIMARY_OWNER_EMAIL = 'rondonjose1987@gmail.com';

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [cloudFarms, setCloudFarms] = useState<Farm[]>([]);
  const [farmsLoaded, setFarmsLoaded] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);

  const [cloudArrivals, setCloudArrivals] = useState<MolassesArrival[]>([]);
  const [cloudDispatches, setCloudDispatches] = useState<MolassesDispatch[]>([]);
  const [cloudPersons, setCloudPersons] = useState<PersonAccount[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  // Direct access local workspace (used when not signed in with Gmail)
  const [localWorkspace, setLocalWorkspace] = useState<LocalWorkspaceState>(() =>
    loadLocalWorkspace()
  );
  const localWorkspaceRef = useRef<LocalWorkspaceState>(localWorkspace);
  localWorkspaceRef.current = localWorkspace;
  const hasLocalMutationRef = useRef(false);

  const [selectedLocalFarmId, setSelectedLocalFarmId] = useState<string | null>(
    () => localWorkspace.farms[0]?.id ?? null
  );

  const commitLocalWorkspace = useCallback(
    async (
      updater: (current: LocalWorkspaceState) => LocalWorkspaceState
    ): Promise<LocalWorkspaceState> => {
      hasLocalMutationRef.current = true;
      const nextState = updater(localWorkspaceRef.current);
      localWorkspaceRef.current = nextState;
      setLocalWorkspace(nextState);
      await persistLocalWorkspace(nextState);
      return nextState;
    },
    []
  );

  // Hydrate workspace from Android native SharedPreferences + IndexedDB on launch
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hydrated = await hydrateLocalWorkspace();
      if (cancelled || hasLocalMutationRef.current) return;
      localWorkspaceRef.current = hydrated;
      setLocalWorkspace(hydrated);
      setSelectedLocalFarmId((prev) => {
        if (prev && hydrated.farms.some((f) => f.id === prev)) return prev;
        return hydrated.farms[0]?.id ?? null;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure any local changes are flushed to disk when Android backgrounds or closes the app
  useEffect(() => {
    const flushLocal = () => {
      if (hasLocalMutationRef.current) {
        void persistLocalWorkspace(localWorkspaceRef.current);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushLocal();
    };
    window.addEventListener('pagehide', flushLocal);
    window.addEventListener('beforeunload', flushLocal);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushLocal);
      window.removeEventListener('beforeunload', flushLocal);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Configure native Android Status Bar inside Capacitor APK
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#15803d' });
      } catch {
        // Ignore on unsupported Android versions
      }
    })();
  }, []);

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'overview';
    const param = new URLSearchParams(window.location.search).get('tab');
    if (
      param === 'overview' ||
      param === 'dispatches' ||
      param === 'arrivals' ||
      param === 'persons' ||
      param === 'collaborators'
    ) {
      return param;
    }
    return 'overview';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Onboarding form for new users without a farm
  const [onboardingFarmName, setOnboardingFarmName] = useState('Mi Finca');
  const [onboardingRate, setOnboardingRate] = useState('917.78');
  const [creatingInitialFarm, setCreatingInitialFarm] = useState(false);
  const [autoBootstrapped, setAutoBootstrapped] = useState(false);

  // Live BCV rate sync state
  const [bcvInfo, setBcvInfo] = useState<BcvRateInfo | null>(null);
  const [bcvSyncing, setBcvSyncing] = useState(false);
  const [bcvError, setBcvError] = useState<string | null>(null);

  // Quick rate editor in top bar
  const [editingTopRate, setEditingTopRate] = useState(false);
  const [topRateInput, setTopRateInput] = useState('');

  // Modals
  const [arrivalModalOpen, setArrivalModalOpen] = useState(false);
  const [editingArrival, setEditingArrival] = useState<MolassesArrival | null>(null);

  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState<MolassesDispatch | null>(null);
  const [preselectedPersonId, setPreselectedPersonId] = useState<string | undefined>(undefined);

  const [abonoModalState, setAbonoModalState] = useState<{
    open: boolean;
    dispatch: MolassesDispatch | null;
    slot: number;
  }>({ open: false, dispatch: null, slot: 1 });

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirmar',
    destructive: false,
    onConfirm: async () => {},
  });
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setCloudFarms([]);
        setFarmsLoaded(false);
        setSelectedFarmId(null);
        setCloudArrivals([]);
        setCloudDispatches([]);
        setCloudPersons([]);
        setCollaborators([]);
        setAutoBootstrapped(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user?.email) return;
    setDataError(null);
    const unsub = subscribeUserFarms(
      user.email,
      (list) => {
        setCloudFarms(list);
        setFarmsLoaded(true);
        setSelectedFarmId((prev) => {
          if (prev && list.some((f) => f.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      },
      (err) => {
        setDataError(err.message);
        setFarmsLoaded(true);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // Auto-create default farm for primary owner on very first sign-in using live BCV rate
  useEffect(() => {
    if (
      authReady &&
      user &&
      farmsLoaded &&
      cloudFarms.length === 0 &&
      !autoBootstrapped &&
      normalizeEmail(user.email || '') === PRIMARY_OWNER_EMAIL
    ) {
      setAutoBootstrapped(true);
      void (async () => {
        let rate = 917.78;
        let bcvMeta: { fechaValorIso?: string; exactRate?: number } | undefined;
        try {
          const live = await fetchBcvRate(false);
          rate = live.rate;
          bcvMeta = { fechaValorIso: live.fechaValorIso, exactRate: live.exactRate };
          setBcvInfo(live);
        } catch {
          // Use fallback default rate
        }
        const newId = await createFarmWorkspace(user, 'Finca Principal', rate, 1.4, bcvMeta);
        setSelectedFarmId(newId);
      })();
    }
  }, [authReady, user, farmsLoaded, cloudFarms.length, autoBootstrapped]);

  const isCloudMode = Boolean(user);
  const farms = isCloudMode ? cloudFarms : localWorkspace.farms;

  const activeCloudFarm = useMemo(
    () => cloudFarms.find((f) => f.id === selectedFarmId) || cloudFarms[0] || null,
    [cloudFarms, selectedFarmId]
  );

  const activeLocalFarm = useMemo(
    () =>
      localWorkspace.farms.find((f) => f.id === selectedLocalFarmId) ||
      localWorkspace.farms[0] ||
      null,
    [localWorkspace.farms, selectedLocalFarmId]
  );

  const activeFarm = isCloudMode ? activeCloudFarm : activeLocalFarm;

  useEffect(() => {
    if (!authReady || !user?.email || !activeCloudFarm) return;
    setDataError(null);
    const unsub = subscribeFarmData(activeCloudFarm.id, user.email, {
      onArrivals: setCloudArrivals,
      onDispatches: setCloudDispatches,
      onPersons: setCloudPersons,
      onCollaborators: setCollaborators,
      onError: (err) => setDataError(err.message),
    });
    return () => unsub();
  }, [authReady, user, activeCloudFarm]);

  const arrivals = isCloudMode
    ? cloudArrivals
    : activeFarm
    ? localWorkspace.arrivalsByFarm[activeFarm.id] || []
    : [];
  const dispatches = isCloudMode
    ? cloudDispatches
    : activeFarm
    ? localWorkspace.dispatchesByFarm[activeFarm.id] || []
    : [];
  const persons = isCloudMode
    ? cloudPersons
    : activeFarm
    ? localWorkspace.personsByFarm[activeFarm.id] || []
    : [];

  const userEmail = isCloudMode
    ? normalizeEmail(user?.email || '')
    : LOCAL_USER_EMAIL;
  const isOwner = isCloudMode
    ? Boolean(activeFarm && activeFarm.ownerEmail === userEmail)
    : true;
  const canEdit = isCloudMode
    ? Boolean(
        activeFarm &&
          (activeFarm.ownerEmail === userEmail ||
            activeFarm.editorEmails.includes(userEmail))
      )
    : true;

  // Automatic daily BCV rate sync (runs on open & every 30 minutes)
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    const runSync = async () => {
      setBcvSyncing(true);
      setBcvError(null);
      try {
        const live = await fetchBcvRate(false);
        if (cancelled) return;
        setBcvInfo(live);
        setOnboardingRate(String(live.rate));

        if (
          activeFarm &&
          canEdit &&
          (activeFarm.bcvAutoSync ?? true) &&
          (activeFarm.bcvFechaValor !== live.fechaValorIso ||
            Math.abs(activeFarm.defaultExchangeRate - live.rate) >= 0.01)
        ) {
          if (isCloudMode) {
            await updateFarmSettings(activeFarm, {
              defaultExchangeRate: live.rate,
              bcvExactRate: live.exactRate,
              bcvFechaValor: live.fechaValorIso,
              bcvAutoSync: true,
            });
          } else {
            await commitLocalWorkspace((prev) =>
              updateLocalFarmSettings(prev, activeFarm.id, {
                defaultExchangeRate: live.rate,
                bcvExactRate: live.exactRate,
                bcvFechaValor: live.fechaValorIso,
                bcvAutoSync: true,
              })
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setBcvError(
            err instanceof Error ? err.message : 'No se pudo consultar el BCV.'
          );
        }
      } finally {
        if (!cancelled) setBcvSyncing(false);
      }
    };

    void runSync();
    const timer = setInterval(() => {
      void runSync();
    }, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    authReady,
    isCloudMode,
    activeFarm?.id,
    activeFarm?.bcvAutoSync,
    activeFarm?.bcvFechaValor,
    activeFarm?.defaultExchangeRate,
    canEdit,
  ]);

  const handleSyncBcvNow = async () => {
    setBcvSyncing(true);
    setBcvError(null);
    try {
      const live = await fetchBcvRate(true);
      setBcvInfo(live);
      if (activeFarm && canEdit) {
        if (isCloudMode) {
          await updateFarmSettings(activeFarm, {
            defaultExchangeRate: live.rate,
            bcvExactRate: live.exactRate,
            bcvFechaValor: live.fechaValorIso,
          });
        } else {
          await commitLocalWorkspace((prev) =>
            updateLocalFarmSettings(prev, activeFarm.id, {
              defaultExchangeRate: live.rate,
              bcvExactRate: live.exactRate,
              bcvFechaValor: live.fechaValorIso,
            })
          );
        }
      }
    } catch (err) {
      setBcvError(
        err instanceof Error ? err.message : 'Error al sincronizar con BCV.'
      );
    } finally {
      setBcvSyncing(false);
    }
  };

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateInitialFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreatingInitialFarm(true);
    setDataError(null);
    try {
      const id = await createFarmWorkspace(
        user,
        onboardingFarmName,
        Number(onboardingRate) || bcvInfo?.rate || 917.78,
        1.4,
        bcvInfo
          ? { fechaValorIso: bcvInfo.fechaValorIso, exactRate: bcvInfo.exactRate }
          : undefined
      );
      setSelectedFarmId(id);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al crear la finca.');
    } finally {
      setCreatingInitialFarm(false);
    }
  };

  const handleSaveTopRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFarm) return;
    const parsed = Number(topRateInput);
    if (parsed > 0) {
      if (isCloudMode) {
        await updateFarmSettings(activeFarm, { defaultExchangeRate: parsed });
      } else {
        await commitLocalWorkspace((prev) =>
          updateLocalFarmSettings(prev, activeFarm.id, { defaultExchangeRate: parsed })
        );
      }
    }
    setEditingTopRate(false);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-3 animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-1/3" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <div className="h-10 bg-slate-100 rounded w-full mt-4" />
        </div>
      </div>
    );
  }

  if (isCloudMode && !farmsLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-8 space-y-4 animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/2" />
          <div className="h-4 bg-slate-100 rounded w-3/4" />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="h-20 bg-slate-100 rounded-lg" />
            <div className="h-20 bg-slate-100 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!activeFarm) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="w-full max-w-5xl mx-auto px-6 py-5 flex items-center justify-between border-b border-slate-200">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            MelazaFinca
          </span>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-600 font-mono">{user?.email || userEmail}</span>
            {user && (
              <button
                type="button"
                onClick={() => void logoutUser()}
                className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-8 space-y-6">
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-900">
                Configura tu espacio de finca
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Conectado como <strong className="font-mono text-slate-900">{user?.email || userEmail}</strong>. Si otro usuario te va a invitar a su finca, compártele este correo Gmail. También puedes crear tu propia finca ahora:
              </p>
            </div>

            {dataError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {dataError}
              </div>
            )}

            <form onSubmit={handleCreateInitialFarm} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre de la finca
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={onboardingFarmName}
                  onChange={(e) => setOnboardingFarmName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Precio referencial del dólar hoy (Bs/$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={onboardingRate}
                  onChange={(e) => setOnboardingRate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              <button
                type="submit"
                disabled={creatingInitialFarm}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                {creatingInitialFarm ? 'Creando finca...' : 'Crear finca e iniciar'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const activeNavLabel = NAV_ITEMS.find((n) => n.key === activeTab)?.label || 'Resumen';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Workspace Sidebar (240px) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              MelazaFinca
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              aria-label="Cerrar menú"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Farm Selector */}
          <div className="px-1">
            <label className="block text-[11px] font-medium text-slate-400 mb-1 px-1">
              Finca activa
            </label>
            {farms.length > 1 ? (
              <select
                value={activeFarm.id}
                onChange={(e) => {
                  if (isCloudMode) {
                    setSelectedFarmId(e.target.value);
                  } else {
                    setSelectedLocalFarmId(e.target.value);
                  }
                }}
                className="w-full px-2.5 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              >
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg truncate">
                {activeFarm.name}
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-900 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile / Mode Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          {user ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuario Gmail'}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold shrink-0">
                    {(user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {user.displayName || 'Usuario Gmail'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="lg:hidden">
                <PWAInstallButton showGuideFallback />
              </div>

              <button
                type="button"
                onClick={() => void logoutUser()}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer min-h-[44px] lg:min-h-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-semibold text-slate-900">
                  Acceso directo (Sin Gmail)
                </p>
                <p className="text-[11px] text-slate-500">
                  Guardado en este dispositivo
                </p>
              </div>

              {authError && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                  {authError}
                </p>
              )}

              <div className="lg:hidden">
                <PWAInstallButton showGuideFallback />
              </div>

              <button
                type="button"
                onClick={() => void handleSignIn()}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer min-h-[44px] lg:min-h-0"
              >
                {authLoading ? 'Conectando...' : 'Conectar Gmail (Opcional)'}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <OfflineIndicator />

        {/* Top Bar Contract (compact on mobile, full on desktop) */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 h-14 sm:h-auto sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden inline-flex items-center justify-center min-w-[40px] min-h-[40px] text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 cursor-pointer shrink-0"
              aria-label="Abrir menú"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 truncate hidden sm:inline">
                {activeFarm.name}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">
                {activeNavLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <PWAInstallButton compact showGuideFallback shortMobileLabel />

            {/* Quick Referential Exchange Rate Editor + BCV Sync */}
            {editingTopRate ? (
              <form onSubmit={handleSaveTopRate} className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={topRateInput}
                  onChange={(e) => setTopRateInput(e.target.value)}
                  className="w-24 px-2 py-1 text-xs font-mono tabular-nums border border-emerald-700 rounded-md focus:outline-none min-h-[36px]"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 rounded-md cursor-pointer min-h-[36px]"
                >
                  Ok
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTopRate(false)}
                  className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer min-h-[36px]"
                >
                  ×
                </button>
              </form>
            ) : (
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setTopRateInput(String(activeFarm.defaultExchangeRate));
                    setEditingTopRate(true);
                  }}
                  title={
                    bcvInfo
                      ? `Tasa oficial BCV (${bcvInfo.fechaValorText}): ${bcvInfo.exactRate} Bs/$ · Clic para editar manualmente`
                      : 'Tasa referencial del día · Clic para editar'
                  }
                  className="px-2 sm:px-3 py-1.5 text-xs font-mono tabular-nums text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap min-h-[40px] sm:min-h-[36px]"
                >
                  <span className="hidden sm:inline">BCV: </span>
                  <strong>
                    {activeFarm.defaultExchangeRate.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  <span className="hidden sm:inline"> Bs/$</span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void handleSyncBcvNow()}
                    disabled={bcvSyncing}
                    title="Actualizar tasa desde bcv.org.ve"
                    className="px-2 py-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 border-l border-slate-200 transition-colors cursor-pointer min-h-[40px] sm:min-h-[36px]"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${bcvSyncing ? 'animate-spin text-emerald-700' : ''}`}
                    />
                  </button>
                )}
              </div>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingDispatch(null);
                  setPreselectedPersonId(undefined);
                  setDispatchModalOpen(true);
                }}
                aria-label="Nuevo despacho"
                className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0"
              >
                <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Nuevo despacho</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 max-w-[1600px] w-full mx-auto space-y-6">
          {dataError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between gap-4">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={() => setDataError(null)}
                className="text-red-800 font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {bcvError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between gap-4">
              <span>No se pudo actualizar automáticamente desde BCV: {bcvError}. Puedes editar la tasa manualmente arriba.</span>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleSyncBcvNow()}
                  className="font-semibold underline cursor-pointer"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => setBcvError(null)}
                  className="font-semibold cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <DashboardOverview
              farm={activeFarm}
              arrivals={arrivals}
              dispatches={dispatches}
              persons={persons}
              canEdit={canEdit}
              onNewArrival={() => {
                setEditingArrival(null);
                setArrivalModalOpen(true);
              }}
              onNewDispatch={() => {
                setEditingDispatch(null);
                setPreselectedPersonId(undefined);
                setDispatchModalOpen(true);
              }}
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenAbono={(dispatch, slot) =>
                setAbonoModalState({ open: true, dispatch, slot })
              }
            />
          )}

          {activeTab === 'dispatches' && (
            <DispatchesLedger
              farm={activeFarm}
              dispatches={dispatches}
              persons={persons}
              canEdit={canEdit}
              isOwner={isOwner}
              onNewDispatch={() => {
                setEditingDispatch(null);
                setPreselectedPersonId(undefined);
                setDispatchModalOpen(true);
              }}
              onEditDispatch={(d) => {
                setEditingDispatch(d);
                setPreselectedPersonId(undefined);
                setDispatchModalOpen(true);
              }}
              onDeleteDispatch={(d) => {
                setConfirmState({
                  open: true,
                  title: 'Eliminar despacho de melaza',
                  description: `¿Seguro que deseas eliminar el despacho a ${d.personName} del ${d.saleDate}? Esta acción no se puede deshacer.`,
                  confirmLabel: 'Eliminar',
                  destructive: true,
                  onConfirm: async () => {
                    if (isCloudMode) {
                      await deleteDispatch(activeFarm.id, d.id);
                    } else {
                      await commitLocalWorkspace((prev) =>
                        deleteLocalDispatch(prev, activeFarm.id, d.id)
                      );
                    }
                  },
                });
              }}
              onOpenAbono={(dispatch, slot) =>
                setAbonoModalState({ open: true, dispatch, slot })
              }
            />
          )}

          {activeTab === 'arrivals' && (
            <ArrivalsView
              arrivals={arrivals}
              canEdit={canEdit}
              onNewArrival={() => {
                setEditingArrival(null);
                setArrivalModalOpen(true);
              }}
              onEditArrival={(a) => {
                setEditingArrival(a);
                setArrivalModalOpen(true);
              }}
              onDeleteArrival={(a) => {
                setConfirmState({
                  open: true,
                  title: 'Eliminar entrada de melaza',
                  description: `¿Seguro que deseas eliminar la entrada de ${a.supplier} del ${a.arrivalDate}?`,
                  confirmLabel: 'Eliminar',
                  destructive: true,
                  onConfirm: async () => {
                    if (isCloudMode) {
                      await deleteArrival(activeFarm.id, a.id);
                    } else {
                      await commitLocalWorkspace((prev) =>
                        deleteLocalArrival(prev, activeFarm.id, a.id)
                      );
                    }
                  },
                });
              }}
            />
          )}

          {activeTab === 'persons' && (
            <PersonsView
              farm={activeFarm}
              persons={persons}
              dispatches={dispatches}
              canEdit={canEdit}
              onSavePerson={async (input) => {
                if (isCloudMode && user) {
                  await savePerson(activeFarm, user, input);
                } else {
                  await commitLocalWorkspace(
                    (prev) => saveLocalPerson(prev, activeFarm, input).nextState
                  );
                }
              }}
              onNewDispatchForPerson={(personId) => {
                setEditingDispatch(null);
                setPreselectedPersonId(personId);
                setDispatchModalOpen(true);
              }}
              onOpenAbono={(dispatch, slot) =>
                setAbonoModalState({ open: true, dispatch, slot })
              }
            />
          )}

          {activeTab === 'collaborators' && (
            <CollaboratorsView
              farm={activeFarm}
              userEmail={userEmail}
              isCloudMode={isCloudMode}
              authLoading={authLoading}
              authError={authError}
              onSignIn={handleSignIn}
              arrivals={arrivals}
              persons={persons}
              dispatches={dispatches}
              collaborators={collaborators}
              bcvInfo={bcvInfo}
              bcvSyncing={bcvSyncing}
              isOwner={isOwner}
              canEdit={canEdit}
              onSyncBcvNow={handleSyncBcvNow}
              onUpdateFarm={async (updates) => {
                if (isCloudMode) {
                  await updateFarmSettings(activeFarm, updates);
                } else {
                  await commitLocalWorkspace((prev) =>
                    updateLocalFarmSettings(prev, activeFarm.id, updates)
                  );
                }
              }}
              onAddCollaborator={async (email, displayName, role) => {
                if (!user) return;
                await addCollaboratorToFarm(
                  activeFarm,
                  email,
                  displayName,
                  role,
                  user.uid,
                  { arrivals, dispatches, persons, collaborators }
                );
              }}
              onChangeRole={async (collab, newRole: CollaboratorRole) => {
                await updateCollaboratorRole(
                  activeFarm,
                  collab,
                  newRole,
                  collaborators
                );
              }}
              onRemoveCollaborator={(collab) => {
                setConfirmState({
                  open: true,
                  title: 'Revocar acceso Gmail',
                  description: `¿Deseas quitar el acceso a ${collab.email} de ${activeFarm.name}?`,
                  confirmLabel: 'Revocar acceso',
                  destructive: true,
                  onConfirm: async () => {
                    await removeCollaboratorFromFarm(activeFarm, collab, {
                      arrivals,
                      dispatches,
                      persons,
                      collaborators,
                    });
                  },
                });
              }}
              onCreateNewFarm={async (name) => {
                if (isCloudMode && user) {
                  const newId = await createFarmWorkspace(
                    user,
                    name,
                    bcvInfo?.rate || activeFarm.defaultExchangeRate,
                    activeFarm.densityKgPerLiter,
                    bcvInfo
                      ? { fechaValorIso: bcvInfo.fechaValorIso, exactRate: bcvInfo.exactRate }
                      : undefined
                  );
                  setSelectedFarmId(newId);
                } else {
                  let createdId = '';
                  await commitLocalWorkspace((prev) => {
                    const res = createLocalFarm(
                      prev,
                      name,
                      bcvInfo?.rate || activeFarm.defaultExchangeRate,
                      activeFarm.densityKgPerLiter,
                      bcvInfo
                        ? { fechaValorIso: bcvInfo.fechaValorIso, exactRate: bcvInfo.exactRate }
                        : undefined
                    );
                    createdId = res.farmId;
                    return res.nextState;
                  });
                  if (createdId) setSelectedLocalFarmId(createdId);
                }
                setActiveTab('overview');
              }}
              onRestoreBackup={async (backup) => {
                if (isCloudMode && user) {
                  return restoreFarmDataFromBackup(activeFarm, user, backup, {
                    arrivals,
                    persons,
                    dispatches,
                  });
                }
                let importedCount = 0;
                await commitLocalWorkspace((prev) => {
                  const res = restoreLocalFarmBackup(prev, activeFarm, backup);
                  importedCount = res.importedCount;
                  return res.nextState;
                });
                return { importedCount };
              }}
              onRequestConfirm={(opts) =>
                setConfirmState({
                  open: true,
                  title: opts.title,
                  description: opts.description,
                  confirmLabel: opts.confirmLabel,
                  destructive: Boolean(opts.destructive),
                  onConfirm: opts.onConfirm,
                })
              }
            />
          )}
        </main>

        {/* Mobile Bottom Tab Bar (Thumb-friendly, 5 tabs) */}
        <nav
          aria-label="Navegación móvil"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[52px] px-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  isActive ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Modals */}
      <ArrivalModal
        open={arrivalModalOpen}
        initialData={editingArrival}
        defaultRate={activeFarm.defaultExchangeRate}
        onClose={() => setArrivalModalOpen(false)}
        onSubmit={async (data: {
          id?: string;
          arrivalDate: string;
          supplier: string;
          quantity: number;
          unit: UnitType;
          costUsd: number;
          exchangeRateBs: number;
          costBs: number;
          notes: string;
        }) => {
          if (isCloudMode && user) {
            await saveArrival(activeFarm, user, data);
          } else {
            await commitLocalWorkspace((prev) => saveLocalArrival(prev, activeFarm, data));
          }
        }}
      />

      <DispatchModal
        open={dispatchModalOpen}
        initialData={editingDispatch}
        persons={persons}
        defaultRate={activeFarm.defaultExchangeRate}
        userEmail={userEmail}
        preselectedPersonId={preselectedPersonId}
        onClose={() => setDispatchModalOpen(false)}
        onSubmit={async (data) => {
          if (isCloudMode && user) {
            await saveDispatch(activeFarm, user, data);
          } else {
            await commitLocalWorkspace((prev) => saveLocalDispatch(prev, activeFarm, data));
          }
        }}
      />

      <AbonoModal
        open={abonoModalState.open}
        dispatch={abonoModalState.dispatch}
        slot={abonoModalState.slot}
        defaultRate={activeFarm.defaultExchangeRate}
        userEmail={userEmail}
        onClose={() => setAbonoModalState((prev) => ({ ...prev, open: false }))}
        onSave={async (entry: AbonoEntry | null, slotToRemove?: number) => {
          if (!abonoModalState.dispatch) return;
          if (isCloudMode && user) {
            await saveDispatchAbonoSlot(
              activeFarm.id,
              abonoModalState.dispatch,
              user,
              entry,
              slotToRemove
            );
          } else {
            await commitLocalWorkspace((prev) =>
              saveLocalDispatchAbonoSlot(
                prev,
                activeFarm.id,
                abonoModalState.dispatch!,
                entry,
                slotToRemove
              )
            );
          }
        }}
      />

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        isBusy={confirmBusy}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          setConfirmBusy(true);
          try {
            await confirmState.onConfirm();
            setConfirmState((prev) => ({ ...prev, open: false }));
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
