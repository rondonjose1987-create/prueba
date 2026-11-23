import { Preferences } from '@capacitor/preferences';
import {
  BLUEPRINT_LIMITS,
  type AbonoEntry,
  type Farm,
  type MolassesArrival,
  type MolassesDispatch,
  type PersonAccount,
  type UnitType,
} from '../types/molasses';
import {
  clampString,
  computeDispatchTotals,
  generateSafeId,
  normalizeEmail,
  round2,
} from '../utils/format';

const STORAGE_KEY = 'melazafinca_local_workspace_v1';
const IDB_NAME = 'melazafinca_native_db';
const IDB_STORE = 'workspace_store';
const IDB_KEY = 'active_workspace';
const DEFAULT_FARM_ID = 'finca_prueba_local';
const DEFAULT_FARM_NAME = 'Mi Finca (Prueba)';

export const LOCAL_USER_EMAIL = 'modo-prueba@local';
export const LOCAL_USER_UID = 'local_guest_user';

export interface LocalWorkspaceState {
  farms: Farm[];
  arrivalsByFarm: Record<string, MolassesArrival[]>;
  personsByFarm: Record<string, PersonAccount[]>;
  dispatchesByFarm: Record<string, MolassesDispatch[]>;
  lastModifiedMs?: number;
}

function createDefaultWorkspace(lastModifiedMs = 0): LocalWorkspaceState {
  return {
    farms: [
      {
        id: DEFAULT_FARM_ID,
        name: DEFAULT_FARM_NAME,
        ownerId: LOCAL_USER_UID,
        ownerEmail: LOCAL_USER_EMAIL,
        defaultExchangeRate: 917.78,
        densityKgPerLiter: 1.4,
        bcvAutoSync: true,
        bcvFechaValor: '',
        bcvExactRate: 917.78,
        authorizedEmails: [LOCAL_USER_EMAIL],
        editorEmails: [LOCAL_USER_EMAIL],
      },
    ],
    arrivalsByFarm: { [DEFAULT_FARM_ID]: [] },
    personsByFarm: { [DEFAULT_FARM_ID]: [] },
    dispatchesByFarm: { [DEFAULT_FARM_ID]: [] },
    lastModifiedMs,
  };
}

function normalizeWorkspace(raw: Partial<LocalWorkspaceState> | null | undefined): LocalWorkspaceState | null {
  if (!raw || !Array.isArray(raw.farms) || raw.farms.length === 0) {
    return null;
  }
  return {
    farms: raw.farms,
    arrivalsByFarm: raw.arrivalsByFarm || {},
    personsByFarm: raw.personsByFarm || {},
    dispatchesByFarm: raw.dispatchesByFarm || {},
    lastModifiedMs: typeof raw.lastModifiedMs === 'number' ? raw.lastModifiedMs : 0,
  };
}

export function countWorkspaceRecords(state: LocalWorkspaceState): number {
  let count = 0;
  for (const list of Object.values(state.arrivalsByFarm || {})) {
    count += Array.isArray(list) ? list.length : 0;
  }
  for (const list of Object.values(state.dispatchesByFarm || {})) {
    count += Array.isArray(list) ? list.length : 0;
  }
  for (const list of Object.values(state.personsByFarm || {})) {
    count += Array.isArray(list) ? list.length : 0;
  }
  return count;
}

export function hasCustomWorkspaceChanges(state: LocalWorkspaceState): boolean {
  if (countWorkspaceRecords(state) > 0) return true;
  if (state.farms.length > 1) return true;
  const f0 = state.farms[0];
  if (f0 && (f0.id !== DEFAULT_FARM_ID || f0.name !== DEFAULT_FARM_NAME)) return true;
  return (state.lastModifiedMs || 0) > 1;
}

function parseWorkspaceJson(raw: string | null | undefined): LocalWorkspaceState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalWorkspaceState>;
    return normalizeWorkspace(parsed);
  } catch {
    return null;
  }
}

function readFromLocalStorage(): LocalWorkspaceState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return parseWorkspaceJson(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeToLocalStorage(serialized: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function readFromIndexedDb(): Promise<LocalWorkspaceState | null> {
  try {
    const db = await openIndexedDb();
    return await new Promise<LocalWorkspaceState | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result;
        if (typeof val === 'string') {
          resolve(parseWorkspaceJson(val));
        } else if (val && typeof val === 'object') {
          resolve(normalizeWorkspace(val as Partial<LocalWorkspaceState>));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  } catch {
    return null;
  }
}

async function writeToIndexedDb(serialized: string): Promise<boolean> {
  try {
    const db = await openIndexedDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(serialized, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.onabort = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

async function readFromNativePreferences(): Promise<LocalWorkspaceState | null> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return parseWorkspaceJson(value);
  } catch {
    return null;
  }
}

async function writeToNativePreferences(serialized: string): Promise<boolean> {
  try {
    await Preferences.set({ key: STORAGE_KEY, value: serialized });
    return true;
  } catch {
    return false;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function loadLocalWorkspace(): LocalWorkspaceState {
  // Read synchronously from localStorage WITHOUT overwriting storage if empty,
  // so async native Preferences / IndexedDB hydration can recover data safely.
  const cached = readFromLocalStorage();
  return cached || createDefaultWorkspace(0);
}

export function saveLocalWorkspace(state: LocalWorkspaceState): void {
  const stamped: LocalWorkspaceState = {
    ...state,
    lastModifiedMs: state.lastModifiedMs || Date.now(),
  };
  writeToLocalStorage(JSON.stringify(stamped));
}

export function persistLocalWorkspace(state: LocalWorkspaceState): Promise<void> {
  const stamped: LocalWorkspaceState = {
    ...state,
    lastModifiedMs: state.lastModifiedMs || Date.now(),
  };
  const serialized = JSON.stringify(stamped);

  // Write fast synchronous cache immediately so force-closes still have it
  const lsOk = writeToLocalStorage(serialized);

  // Serialize async native + IndexedDB writes in order so older writes never clobber newer ones
  const job = writeQueue.then(async () => {
    const [prefOk, idbOk] = await Promise.all([
      writeToNativePreferences(serialized),
      writeToIndexedDb(serialized),
    ]);
    if (!lsOk && !prefOk && !idbOk) {
      throw new Error(
        'No se pudo guardar en la memoria del dispositivo. Verifica que el almacenamiento no esté bloqueado.'
      );
    }
  });

  writeQueue = job.catch(() => {
    // Keep queue alive for subsequent writes even if one write fails
  });

  return job;
}

function pickBestSnapshot(candidates: (LocalWorkspaceState | null)[]): LocalWorkspaceState | null {
  const valid = candidates.filter((c): c is LocalWorkspaceState => Boolean(c));
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const aHasCustom = hasCustomWorkspaceChanges(a) ? 1 : 0;
    const bHasCustom = hasCustomWorkspaceChanges(b) ? 1 : 0;
    if (bHasCustom !== aHasCustom) return bHasCustom - aHasCustom;

    const aRecords = countWorkspaceRecords(a);
    const bRecords = countWorkspaceRecords(b);
    const aTime = a.lastModifiedMs || 0;
    const bTime = b.lastModifiedMs || 0;

    if (bTime !== aTime) return bTime - aTime;
    return bRecords - aRecords;
  });

  return valid[0];
}

export async function hydrateLocalWorkspace(): Promise<LocalWorkspaceState> {
  // Ask the OS / browser to mark persistent storage durable (prevents auto-eviction)
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported browsers
  }

  const [fromPrefs, fromIdb] = await Promise.all([
    readFromNativePreferences(),
    readFromIndexedDb(),
  ]);
  const fromLs = readFromLocalStorage();

  const best = pickBestSnapshot([fromPrefs, fromIdb, fromLs]);
  if (best) {
    // Keep all 3 storage layers synchronized with the recovered snapshot
    const serialized = JSON.stringify({
      ...best,
      lastModifiedMs: best.lastModifiedMs || Date.now(),
    });
    writeToLocalStorage(serialized);
    await Promise.all([
      writeToNativePreferences(serialized),
      writeToIndexedDb(serialized),
    ]);
    return best;
  }

  const initial = createDefaultWorkspace(1);
  await persistLocalWorkspace(initial).catch(() => {});
  return initial;
}

export function createLocalFarm(
  state: LocalWorkspaceState,
  name: string,
  defaultExchangeRate = 917.78,
  densityKgPerLiter = 1.4,
  bcvInfo?: { fechaValorIso?: string; exactRate?: number }
): { nextState: LocalWorkspaceState; farmId: string } {
  const farmId = generateSafeId('finca');
  const cleanName = clampString(name, BLUEPRINT_LIMITS.FARM_NAME_MAX) || 'Finca Nueva';
  const rate = Math.max(0.01, round2(defaultExchangeRate));
  const density = Math.min(10, Math.max(0.1, round2(densityKgPerLiter)));
  const exactRate = bcvInfo?.exactRate && bcvInfo.exactRate > 0 ? bcvInfo.exactRate : rate;
  const fechaValor = clampString(bcvInfo?.fechaValorIso || '', 20);

  const newFarm: Farm = {
    id: farmId,
    name: cleanName.length >= 2 ? cleanName : 'Finca Melaza',
    ownerId: LOCAL_USER_UID,
    ownerEmail: LOCAL_USER_EMAIL,
    defaultExchangeRate: rate,
    densityKgPerLiter: density,
    bcvAutoSync: true,
    bcvFechaValor: fechaValor,
    bcvExactRate: exactRate,
    authorizedEmails: [LOCAL_USER_EMAIL],
    editorEmails: [LOCAL_USER_EMAIL],
  };

  const nextState: LocalWorkspaceState = {
    farms: [...state.farms, newFarm].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    arrivalsByFarm: { ...state.arrivalsByFarm, [farmId]: [] },
    personsByFarm: { ...state.personsByFarm, [farmId]: [] },
    dispatchesByFarm: { ...state.dispatchesByFarm, [farmId]: [] },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return { nextState, farmId };
}

export function updateLocalFarmSettings(
  state: LocalWorkspaceState,
  farmId: string,
  updates: {
    name?: string;
    defaultExchangeRate?: number;
    densityKgPerLiter?: number;
    bcvAutoSync?: boolean;
    bcvFechaValor?: string;
    bcvExactRate?: number;
  }
): LocalWorkspaceState {
  const nextFarms = state.farms.map((f) => {
    if (f.id !== farmId) return f;
    const nextName =
      updates.name !== undefined
        ? clampString(updates.name, BLUEPRINT_LIMITS.FARM_NAME_MAX)
        : f.name;
    return {
      ...f,
      name: nextName.length >= BLUEPRINT_LIMITS.FARM_NAME_MIN ? nextName : f.name,
      defaultExchangeRate:
        updates.defaultExchangeRate !== undefined && updates.defaultExchangeRate > 0
          ? round2(updates.defaultExchangeRate)
          : f.defaultExchangeRate,
      densityKgPerLiter:
        updates.densityKgPerLiter !== undefined && updates.densityKgPerLiter > 0
          ? Math.min(10, round2(updates.densityKgPerLiter))
          : f.densityKgPerLiter,
      bcvAutoSync:
        updates.bcvAutoSync !== undefined ? updates.bcvAutoSync : f.bcvAutoSync ?? true,
      bcvFechaValor:
        updates.bcvFechaValor !== undefined
          ? clampString(updates.bcvFechaValor, 20)
          : f.bcvFechaValor ?? '',
      bcvExactRate:
        updates.bcvExactRate !== undefined
          ? updates.bcvExactRate
          : f.bcvExactRate ?? f.defaultExchangeRate,
    };
  });

  const nextState: LocalWorkspaceState = {
    ...state,
    farms: nextFarms,
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return nextState;
}

export function saveLocalArrival(
  state: LocalWorkspaceState,
  farm: Farm,
  input: {
    id?: string;
    arrivalDate: string;
    supplier: string;
    quantity: number;
    unit: UnitType;
    costUsd: number;
    exchangeRateBs: number;
    costBs: number;
    notes: string;
  }
): LocalWorkspaceState {
  const current = state.arrivalsByFarm[farm.id] || [];
  const supplier = clampString(input.supplier, BLUEPRINT_LIMITS.SUPPLIER_MAX) || 'Proveedor';
  const notes = clampString(input.notes, BLUEPRINT_LIMITS.NOTES_MAX);
  const quantity = Math.max(0.01, round2(input.quantity));
  const costUsd = Math.max(0, round2(input.costUsd));
  const exchangeRateBs = Math.max(0.01, round2(input.exchangeRateBs));
  const costBs = Math.max(0, round2(input.costBs));

  let nextList: MolassesArrival[];
  if (input.id) {
    nextList = current.map((item) =>
      item.id === input.id
        ? {
            ...item,
            arrivalDate: input.arrivalDate,
            supplier,
            quantity,
            unit: input.unit,
            costUsd,
            exchangeRateBs,
            costBs,
            notes,
          }
        : item
    );
  } else {
    const newItem: MolassesArrival = {
      id: generateSafeId('ent'),
      farmId: farm.id,
      arrivalDate: input.arrivalDate,
      supplier,
      quantity,
      unit: input.unit,
      costUsd,
      exchangeRateBs,
      costBs,
      notes,
      ownerEmail: farm.ownerEmail,
      authorizedEmails: farm.authorizedEmails,
      createdByUid: LOCAL_USER_UID,
      createdByEmail: LOCAL_USER_EMAIL,
    };
    nextList = [newItem, ...current];
  }

  nextList.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));
  const nextState: LocalWorkspaceState = {
    ...state,
    arrivalsByFarm: { ...state.arrivalsByFarm, [farm.id]: nextList },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return nextState;
}

export function deleteLocalArrival(
  state: LocalWorkspaceState,
  farmId: string,
  arrivalId: string
): LocalWorkspaceState {
  const current = state.arrivalsByFarm[farmId] || [];
  const nextState: LocalWorkspaceState = {
    ...state,
    arrivalsByFarm: {
      ...state.arrivalsByFarm,
      [farmId]: current.filter((a) => a.id !== arrivalId),
    },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return nextState;
}

export function saveLocalPerson(
  state: LocalWorkspaceState,
  farm: Farm,
  input: {
    id?: string;
    name: string;
    phone: string;
    email: string;
    notes: string;
  }
): { nextState: LocalWorkspaceState; personId: string } {
  const current = state.personsByFarm[farm.id] || [];
  const name = clampString(input.name, BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente';
  const phone = clampString(input.phone, BLUEPRINT_LIMITS.PHONE_MAX);
  const email = normalizeEmail(input.email);
  const notes = clampString(input.notes, BLUEPRINT_LIMITS.PERSON_NOTES_MAX);

  const personId = input.id || generateSafeId('per');
  let nextList: PersonAccount[];

  if (input.id) {
    nextList = current.map((p) =>
      p.id === input.id ? { ...p, name, phone, email, notes } : p
    );
  } else {
    const newPerson: PersonAccount = {
      id: personId,
      farmId: farm.id,
      name,
      phone,
      email,
      notes,
      ownerEmail: farm.ownerEmail,
      authorizedEmails: farm.authorizedEmails,
      createdByUid: LOCAL_USER_UID,
    };
    nextList = [...current, newPerson];
  }

  nextList.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const nextState: LocalWorkspaceState = {
    ...state,
    personsByFarm: { ...state.personsByFarm, [farm.id]: nextList },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return { nextState, personId };
}

export function saveLocalDispatch(
  state: LocalWorkspaceState,
  farm: Farm,
  input: {
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
  }
): LocalWorkspaceState {
  const currentPersons = state.personsByFarm[farm.id] || [];
  const currentDispatches = state.dispatchesByFarm[farm.id] || [];

  const cleanPersonName =
    clampString(input.personName, BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente';
  const cleanNotes = clampString(input.notes, BLUEPRINT_LIMITS.NOTES_MAX);
  const quantity = Math.max(0.01, round2(input.quantity));
  const unitPriceUsd = Math.max(0, round2(input.unitPriceUsd));
  const totalUsd = Math.max(0.01, round2(input.totalUsd));
  const exchangeRateBs = Math.max(0.01, round2(input.exchangeRateBs));
  const totalBs = Math.max(0, round2(input.totalBs));

  const cleanAbonos: AbonoEntry[] = input.abonos
    .slice(0, BLUEPRINT_LIMITS.ABONOS_MAX)
    .map((a) => ({
      slot: Math.min(BLUEPRINT_LIMITS.ABONOS_MAX, Math.max(1, Math.round(a.slot))),
      amountUsd: Math.max(0, round2(a.amountUsd)),
      exchangeRateBs: Math.max(0.01, round2(a.exchangeRateBs)),
      amountBs: Math.max(0, round2(a.amountBs)),
      date: a.date,
      note: clampString(a.note || '', BLUEPRINT_LIMITS.ABONO_NOTE_MAX),
      recordedByEmail: normalizeEmail(a.recordedByEmail || LOCAL_USER_EMAIL),
    }))
    .sort((a, b) => a.slot - b.slot);

  const totals = computeDispatchTotals(totalUsd, cleanAbonos);
  const resolvedPersonId = input.personId || generateSafeId('per');

  let nextPersons = currentPersons;
  if (!input.personId) {
    nextPersons = [
      ...currentPersons,
      {
        id: resolvedPersonId,
        farmId: farm.id,
        name: cleanPersonName,
        phone: clampString(input.personPhone || '', BLUEPRINT_LIMITS.PHONE_MAX),
        email: normalizeEmail(input.personEmail || ''),
        notes: '',
        ownerEmail: farm.ownerEmail,
        authorizedEmails: farm.authorizedEmails,
        createdByUid: LOCAL_USER_UID,
      },
    ].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  let nextDispatches: MolassesDispatch[];
  if (input.id) {
    nextDispatches = currentDispatches.map((d) =>
      d.id === input.id
        ? {
            ...d,
            saleDate: input.saleDate,
            personId: resolvedPersonId,
            personName: cleanPersonName,
            quantity,
            unit: input.unit,
            unitPriceUsd,
            totalUsd,
            exchangeRateBs,
            totalBs,
            hasAbono: totals.hasAbono,
            abonos: cleanAbonos,
            totalPaidUsd: totals.totalPaidUsd,
            remainingUsd: totals.remainingUsd,
            status: totals.status,
            notes: cleanNotes,
          }
        : d
    );
  } else {
    const newDispatch: MolassesDispatch = {
      id: generateSafeId('des'),
      farmId: farm.id,
      saleDate: input.saleDate,
      personId: resolvedPersonId,
      personName: cleanPersonName,
      quantity,
      unit: input.unit,
      unitPriceUsd,
      totalUsd,
      exchangeRateBs,
      totalBs,
      hasAbono: totals.hasAbono,
      abonos: cleanAbonos,
      totalPaidUsd: totals.totalPaidUsd,
      remainingUsd: totals.remainingUsd,
      status: totals.status,
      notes: cleanNotes,
      ownerEmail: farm.ownerEmail,
      authorizedEmails: farm.authorizedEmails,
      createdByUid: LOCAL_USER_UID,
      createdByEmail: LOCAL_USER_EMAIL,
    };
    nextDispatches = [newDispatch, ...currentDispatches];
  }

  nextDispatches.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  const nextState: LocalWorkspaceState = {
    ...state,
    personsByFarm: { ...state.personsByFarm, [farm.id]: nextPersons },
    dispatchesByFarm: { ...state.dispatchesByFarm, [farm.id]: nextDispatches },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return nextState;
}

export function saveLocalDispatchAbonoSlot(
  state: LocalWorkspaceState,
  farmId: string,
  dispatch: MolassesDispatch,
  entry: AbonoEntry | null,
  slotToRemove?: number
): LocalWorkspaceState {
  let nextAbonos = dispatch.abonos.slice();
  if (entry === null && slotToRemove !== undefined) {
    nextAbonos = nextAbonos.filter((a) => a.slot !== slotToRemove);
  } else if (entry) {
    const cleanEntry: AbonoEntry = {
      slot: Math.min(BLUEPRINT_LIMITS.ABONOS_MAX, Math.max(1, Math.round(entry.slot))),
      amountUsd: Math.max(0, round2(entry.amountUsd)),
      exchangeRateBs: Math.max(0.01, round2(entry.exchangeRateBs)),
      amountBs: Math.max(0, round2(entry.amountBs)),
      date: entry.date,
      note: clampString(entry.note || '', BLUEPRINT_LIMITS.ABONO_NOTE_MAX),
      recordedByEmail: LOCAL_USER_EMAIL,
    };
    const idx = nextAbonos.findIndex((a) => a.slot === cleanEntry.slot);
    if (cleanEntry.amountUsd <= 0) {
      nextAbonos = nextAbonos.filter((a) => a.slot !== cleanEntry.slot);
    } else if (idx >= 0) {
      nextAbonos[idx] = cleanEntry;
    } else {
      nextAbonos.push(cleanEntry);
    }
  }

  nextAbonos = nextAbonos
    .slice(0, BLUEPRINT_LIMITS.ABONOS_MAX)
    .sort((a, b) => a.slot - b.slot);

  const totals = computeDispatchTotals(dispatch.totalUsd, nextAbonos);
  const currentDispatches = state.dispatchesByFarm[farmId] || [];
  const nextDispatches = currentDispatches.map((d) =>
    d.id === dispatch.id
      ? {
          ...d,
          hasAbono: totals.hasAbono,
          abonos: nextAbonos,
          totalPaidUsd: totals.totalPaidUsd,
          remainingUsd: totals.remainingUsd,
          status: totals.status,
        }
      : d
  );

  const nextState: LocalWorkspaceState = {
    ...state,
    dispatchesByFarm: { ...state.dispatchesByFarm, [farmId]: nextDispatches },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return nextState;
}

export function deleteLocalDispatch(
  state: LocalWorkspaceState,
  farmId: string,
  dispatchId: string
): LocalWorkspaceState {
  const currentDispatches = state.dispatchesByFarm[farmId] || [];
  const nextState: LocalWorkspaceState = {
    ...state,
    dispatchesByFarm: {
      ...state.dispatchesByFarm,
      [farmId]: currentDispatches.filter((d) => d.id !== dispatchId),
    },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return nextState;
}

export function restoreLocalFarmBackup(
  state: LocalWorkspaceState,
  farm: Farm,
  backup: {
    arrivals: MolassesArrival[];
    persons: PersonAccount[];
    dispatches: MolassesDispatch[];
  }
): { nextState: LocalWorkspaceState; importedCount: number } {
  const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
    const map = new Map<string, T>();
    for (const item of existing) map.set(item.id, item);
    for (const item of incoming) {
      if (item && item.id) map.set(item.id, item);
    }
    return Array.from(map.values());
  };

  const nextArrivals = mergeById(
    state.arrivalsByFarm[farm.id] || [],
    (backup.arrivals || []).map((a) => ({ ...a, farmId: farm.id }))
  ).sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));

  const nextPersons = mergeById(
    state.personsByFarm[farm.id] || [],
    (backup.persons || []).map((p) => ({ ...p, farmId: farm.id }))
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const nextDispatches = mergeById(
    state.dispatchesByFarm[farm.id] || [],
    (backup.dispatches || []).map((d) => ({ ...d, farmId: farm.id }))
  ).sort((a, b) => b.saleDate.localeCompare(a.saleDate));

  const importedCount =
    (backup.arrivals?.length || 0) +
    (backup.persons?.length || 0) +
    (backup.dispatches?.length || 0);

  const nextState: LocalWorkspaceState = {
    ...state,
    arrivalsByFarm: { ...state.arrivalsByFarm, [farm.id]: nextArrivals },
    personsByFarm: { ...state.personsByFarm, [farm.id]: nextPersons },
    dispatchesByFarm: { ...state.dispatchesByFarm, [farm.id]: nextDispatches },
    lastModifiedMs: Date.now(),
  };
  saveLocalWorkspace(nextState);
  return { nextState, importedCount };
}
