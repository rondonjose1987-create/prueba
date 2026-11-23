import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AbonoEntry,
  type BcvRateInfo,
  type Collaborator,
  type CollaboratorRole,
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

export function subscribeUserFarms(
  userEmailRaw: string,
  onData: (farms: Farm[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const email = normalizeEmail(userEmailRaw);
  const path = 'farms';
  const q = query(
    collection(db, path),
    where('authorizedEmails', 'array-contains', email)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const farms = snapshot.docs.map((d) => ({
        ...(d.data() as Farm),
        id: d.id,
      }));
      farms.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      onData(farms);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeFarmData(
  farmId: string,
  userEmailRaw: string,
  callbacks: {
    onArrivals: (items: MolassesArrival[]) => void;
    onDispatches: (items: MolassesDispatch[]) => void;
    onPersons: (items: PersonAccount[]) => void;
    onCollaborators: (items: Collaborator[]) => void;
    onError: (err: Error) => void;
  }
): Unsubscribe {
  const email = normalizeEmail(userEmailRaw);

  const arrivalsPath = `farms/${farmId}/arrivals`;
  const dispatchesPath = `farms/${farmId}/dispatches`;
  const personsPath = `farms/${farmId}/persons`;
  const collabsPath = `farms/${farmId}/collaborators`;

  const unsubArrivals = onSnapshot(
    query(
      collection(db, arrivalsPath),
      where('authorizedEmails', 'array-contains', email)
    ),
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as MolassesArrival),
        id: d.id,
      }));
      list.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));
      callbacks.onArrivals(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, arrivalsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubDispatches = onSnapshot(
    query(
      collection(db, dispatchesPath),
      where('authorizedEmails', 'array-contains', email)
    ),
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as MolassesDispatch),
        id: d.id,
      }));
      list.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
      callbacks.onDispatches(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, dispatchesPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubPersons = onSnapshot(
    query(
      collection(db, personsPath),
      where('authorizedEmails', 'array-contains', email)
    ),
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as PersonAccount),
        id: d.id,
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      callbacks.onPersons(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, personsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubCollabs = onSnapshot(
    query(
      collection(db, collabsPath),
      where('authorizedEmails', 'array-contains', email)
    ),
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as Collaborator),
        id: d.id,
      }));
      list.sort((a, b) => a.email.localeCompare(b.email));
      callbacks.onCollaborators(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collabsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubArrivals();
    unsubDispatches();
    unsubPersons();
    unsubCollabs();
  };
}

export async function fetchBcvRate(forceRefresh = false): Promise<BcvRateInfo> {
  const apiBase = (
    (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env
      ?.VITE_API_BASE_URL || ''
  ).replace(/\/$/, '');
  const path = forceRefresh ? '/api/bcv-rate?refresh=1' : '/api/bcv-rate';
  const url = `${apiBase}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : 'No se pudo consultar la tasa oficial del BCV.'
    );
  }
  return (await res.json()) as BcvRateInfo;
}

export async function createFarmWorkspace(
  user: User,
  name: string,
  defaultExchangeRate = 917.78,
  densityKgPerLiter = 1.4,
  bcvInfo?: { fechaValorIso?: string; exactRate?: number }
): Promise<string> {
  const email = normalizeEmail(user.email || '');
  if (!email) throw new Error('Se requiere una cuenta de correo Gmail verificada.');
  const farmId = generateSafeId('finca');
  const path = `farms/${farmId}`;
  const cleanName = clampString(name, BLUEPRINT_LIMITS.FARM_NAME_MAX) || 'Finca Principal';
  const rate = Math.max(0.01, round2(defaultExchangeRate));
  const density = Math.min(10, Math.max(0.1, round2(densityKgPerLiter)));
  const exactRate = bcvInfo?.exactRate && bcvInfo.exactRate > 0 ? bcvInfo.exactRate : rate;
  const fechaValor = clampString(bcvInfo?.fechaValorIso || '', 20);

  try {
    await setDoc(doc(db, 'farms', farmId), {
      id: farmId,
      name: cleanName.length >= 2 ? cleanName : 'Finca Melaza',
      ownerId: user.uid,
      ownerEmail: email,
      defaultExchangeRate: rate,
      densityKgPerLiter: density,
      bcvAutoSync: true,
      bcvFechaValor: fechaValor,
      bcvExactRate: exactRate,
      authorizedEmails: [email],
      editorEmails: [email],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return farmId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFarmSettings(
  farm: Farm,
  updates: {
    name?: string;
    defaultExchangeRate?: number;
    densityKgPerLiter?: number;
    bcvAutoSync?: boolean;
    bcvFechaValor?: string;
    bcvExactRate?: number;
  }
): Promise<void> {
  const path = `farms/${farm.id}`;
  const payload: Record<string, unknown> = {
    bcvAutoSync:
      updates.bcvAutoSync !== undefined
        ? updates.bcvAutoSync
        : farm.bcvAutoSync ?? true,
    bcvFechaValor: clampString(
      updates.bcvFechaValor !== undefined
        ? updates.bcvFechaValor
        : farm.bcvFechaValor ?? '',
      20
    ),
    bcvExactRate:
      updates.bcvExactRate !== undefined
        ? updates.bcvExactRate
        : farm.bcvExactRate ?? farm.defaultExchangeRate,
    updatedAt: serverTimestamp(),
  };

  if (updates.name !== undefined) {
    const cleanName = clampString(updates.name, BLUEPRINT_LIMITS.FARM_NAME_MAX);
    if (cleanName.length >= BLUEPRINT_LIMITS.FARM_NAME_MIN) {
      payload.name = cleanName;
    }
  }
  if (updates.defaultExchangeRate !== undefined && updates.defaultExchangeRate > 0) {
    payload.defaultExchangeRate = round2(updates.defaultExchangeRate);
  }
  if (updates.densityKgPerLiter !== undefined && updates.densityKgPerLiter > 0) {
    payload.densityKgPerLiter = Math.min(10, round2(updates.densityKgPerLiter));
  }

  try {
    await updateDoc(doc(db, 'farms', farm.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function syncAuthorizedEmailsAcrossFarm(
  farmId: string,
  nextAuthorizedEmails: string[],
  refs: {
    arrivals: MolassesArrival[];
    dispatches: MolassesDispatch[];
    persons: PersonAccount[];
    collaborators: Collaborator[];
  }
): Promise<void> {
  const allDocPaths: string[] = [
    ...refs.arrivals.map((a) => `farms/${farmId}/arrivals/${a.id}`),
    ...refs.dispatches.map((d) => `farms/${farmId}/dispatches/${d.id}`),
    ...refs.persons.map((p) => `farms/${farmId}/persons/${p.id}`),
    ...refs.collaborators.map((c) => `farms/${farmId}/collaborators/${c.id}`),
  ];

  const CHUNK_SIZE = 400;
  for (let i = 0; i < allDocPaths.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const slice = allDocPaths.slice(i, i + CHUNK_SIZE);
    for (const fullPath of slice) {
      batch.update(doc(db, fullPath), {
        authorizedEmails: nextAuthorizedEmails,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function addCollaboratorToFarm(
  farm: Farm,
  collabEmailRaw: string,
  displayNameRaw: string,
  role: CollaboratorRole,
  actorUid: string,
  existingData: {
    arrivals: MolassesArrival[];
    dispatches: MolassesDispatch[];
    persons: PersonAccount[];
    collaborators: Collaborator[];
  }
): Promise<void> {
  const email = normalizeEmail(collabEmailRaw);
  if (!email || !email.includes('@')) {
    throw new Error('Ingresa un correo Gmail válido.');
  }
  if (email === farm.ownerEmail) {
    throw new Error('El propietario principal ya tiene acceso total.');
  }
  if (farm.authorizedEmails.includes(email)) {
    throw new Error('Ese correo Gmail ya está autorizado en esta finca.');
  }
  if (farm.authorizedEmails.length >= BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX) {
    throw new Error(`Límite máximo de ${BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX} usuarios por finca.`);
  }

  const nextAuthorized = Array.from(new Set([farm.ownerEmail, ...farm.authorizedEmails, email])).slice(
    0,
    BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX
  );
  const nextEditors =
    role === 'consulta'
      ? Array.from(new Set([farm.ownerEmail, ...farm.editorEmails]))
      : Array.from(new Set([farm.ownerEmail, ...farm.editorEmails, email])).slice(
          0,
          BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX
        );

  const collabId = generateSafeId('colab');
  const displayName =
    clampString(displayNameRaw, BLUEPRINT_LIMITS.PERSON_NAME_MAX) || email.split('@')[0];

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'farms', farm.id), {
      authorizedEmails: nextAuthorized,
      editorEmails: nextEditors,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, `farms/${farm.id}/collaborators`, collabId), {
      id: collabId,
      farmId: farm.id,
      email,
      displayName,
      role,
      ownerEmail: farm.ownerEmail,
      authorizedEmails: nextAuthorized,
      addedByUid: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    await syncAuthorizedEmailsAcrossFarm(farm.id, nextAuthorized, existingData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `farms/${farm.id}/collaborators/${collabId}`);
  }
}

export async function updateCollaboratorRole(
  farm: Farm,
  collab: Collaborator,
  newRole: CollaboratorRole,
  collaborators: Collaborator[]
): Promise<void> {
  const nextEditors = new Set<string>([farm.ownerEmail]);
  for (const c of collaborators) {
    const effectiveRole = c.id === collab.id ? newRole : c.role;
    if (effectiveRole !== 'consulta') {
      nextEditors.add(c.email);
    }
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, `farms/${farm.id}/collaborators`, collab.id), {
      role: newRole,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'farms', farm.id), {
      editorEmails: Array.from(nextEditors).slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `farms/${farm.id}/collaborators/${collab.id}`
    );
  }
}

export async function removeCollaboratorFromFarm(
  farm: Farm,
  collab: Collaborator,
  existingData: {
    arrivals: MolassesArrival[];
    dispatches: MolassesDispatch[];
    persons: PersonAccount[];
    collaborators: Collaborator[];
  }
): Promise<void> {
  const nextAuthorized = farm.authorizedEmails.filter((e) => e !== collab.email);
  if (!nextAuthorized.includes(farm.ownerEmail)) nextAuthorized.unshift(farm.ownerEmail);
  const nextEditors = farm.editorEmails.filter((e) => e !== collab.email);
  if (!nextEditors.includes(farm.ownerEmail)) nextEditors.unshift(farm.ownerEmail);

  const remainingCollabs = existingData.collaborators.filter((c) => c.id !== collab.id);

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, `farms/${farm.id}/collaborators`, collab.id));
    batch.update(doc(db, 'farms', farm.id), {
      authorizedEmails: nextAuthorized,
      editorEmails: nextEditors,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    await syncAuthorizedEmailsAcrossFarm(farm.id, nextAuthorized, {
      ...existingData,
      collaborators: remainingCollabs,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `farms/${farm.id}/collaborators/${collab.id}`
    );
  }
}

export async function saveArrival(
  farm: Farm,
  user: User,
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
): Promise<void> {
  const userEmail = normalizeEmail(user.email || '');
  const supplier = clampString(input.supplier, BLUEPRINT_LIMITS.SUPPLIER_MAX) || 'Proveedor';
  const notes = clampString(input.notes, BLUEPRINT_LIMITS.NOTES_MAX);
  const quantity = Math.max(0.01, round2(input.quantity));
  const costUsd = Math.max(0, round2(input.costUsd));
  const exchangeRateBs = Math.max(0.01, round2(input.exchangeRateBs));
  const costBs = Math.max(0, round2(input.costBs));

  if (input.id) {
    const path = `farms/${farm.id}/arrivals/${input.id}`;
    try {
      await updateDoc(doc(db, path), {
        arrivalDate: input.arrivalDate,
        supplier,
        quantity,
        unit: input.unit,
        costUsd,
        exchangeRateBs,
        costBs,
        notes,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  const arrivalId = generateSafeId('ent');
  const path = `farms/${farm.id}/arrivals/${arrivalId}`;
  try {
    await setDoc(doc(db, path), {
      id: arrivalId,
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
      authorizedEmails: farm.authorizedEmails.slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX),
      createdByUid: user.uid,
      createdByEmail: userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteArrival(farmId: string, arrivalId: string): Promise<void> {
  const path = `farms/${farmId}/arrivals/${arrivalId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function savePerson(
  farm: Farm,
  user: User,
  input: {
    id?: string;
    name: string;
    phone: string;
    email: string;
    notes: string;
  }
): Promise<string> {
  const name = clampString(input.name, BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente';
  const phone = clampString(input.phone, BLUEPRINT_LIMITS.PHONE_MAX);
  const email = normalizeEmail(input.email);
  const notes = clampString(input.notes, BLUEPRINT_LIMITS.PERSON_NOTES_MAX);

  if (input.id) {
    const path = `farms/${farm.id}/persons/${input.id}`;
    try {
      await updateDoc(doc(db, path), {
        name,
        phone,
        email,
        notes,
        updatedAt: serverTimestamp(),
      });
      return input.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  const personId = generateSafeId('per');
  const path = `farms/${farm.id}/persons/${personId}`;
  try {
    await setDoc(doc(db, path), {
      id: personId,
      farmId: farm.id,
      name,
      phone,
      email,
      notes,
      ownerEmail: farm.ownerEmail,
      authorizedEmails: farm.authorizedEmails.slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX),
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return personId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveDispatch(
  farm: Farm,
  user: User,
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
): Promise<void> {
  const userEmail = normalizeEmail(user.email || '');
  const cleanPersonName = clampString(input.personName, BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente';
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
      recordedByEmail: normalizeEmail(a.recordedByEmail || userEmail),
    }))
    .sort((a, b) => a.slot - b.slot);

  const totals = computeDispatchTotals(totalUsd, cleanAbonos);

  const resolvedPersonId = input.personId || generateSafeId('per');
  const needsNewPerson = !input.personId;

  if (input.id) {
    const path = `farms/${farm.id}/dispatches/${input.id}`;
    try {
      const batch = writeBatch(db);
      if (needsNewPerson) {
        batch.set(doc(db, `farms/${farm.id}/persons`, resolvedPersonId), {
          id: resolvedPersonId,
          farmId: farm.id,
          name: cleanPersonName,
          phone: clampString(input.personPhone || '', BLUEPRINT_LIMITS.PHONE_MAX),
          email: normalizeEmail(input.personEmail || ''),
          notes: '',
          ownerEmail: farm.ownerEmail,
          authorizedEmails: farm.authorizedEmails.slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX),
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      batch.update(doc(db, path), {
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
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  const dispatchId = generateSafeId('des');
  const personId = resolvedPersonId;
  const dispatchPath = `farms/${farm.id}/dispatches/${dispatchId}`;

  try {
    const batch = writeBatch(db);
    if (needsNewPerson) {
      batch.set(doc(db, `farms/${farm.id}/persons`, personId), {
        id: personId,
        farmId: farm.id,
        name: cleanPersonName,
        phone: clampString(input.personPhone || '', BLUEPRINT_LIMITS.PHONE_MAX),
        email: normalizeEmail(input.personEmail || ''),
        notes: '',
        ownerEmail: farm.ownerEmail,
        authorizedEmails: farm.authorizedEmails.slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX),
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, dispatchPath), {
      id: dispatchId,
      farmId: farm.id,
      saleDate: input.saleDate,
      personId,
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
      authorizedEmails: farm.authorizedEmails.slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX),
      createdByUid: user.uid,
      createdByEmail: userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, dispatchPath);
  }
}

export async function saveDispatchAbonoSlot(
  farmId: string,
  dispatch: MolassesDispatch,
  user: User,
  entry: AbonoEntry | null,
  slotToRemove?: number
): Promise<void> {
  const userEmail = normalizeEmail(user.email || '');
  const path = `farms/${farmId}/dispatches/${dispatch.id}`;

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
      recordedByEmail: userEmail,
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

  try {
    await updateDoc(doc(db, path), {
      hasAbono: totals.hasAbono,
      abonos: nextAbonos,
      totalPaidUsd: totals.totalPaidUsd,
      remainingUsd: totals.remainingUsd,
      status: totals.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDispatch(farmId: string, dispatchId: string): Promise<void> {
  const path = `farms/${farmId}/dispatches/${dispatchId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function restoreFarmDataFromBackup(
  farm: Farm,
  user: User,
  backup: {
    arrivals: MolassesArrival[];
    persons: PersonAccount[];
    dispatches: MolassesDispatch[];
  },
  existingData: {
    arrivals: MolassesArrival[];
    persons: PersonAccount[];
    dispatches: MolassesDispatch[];
  }
): Promise<{ importedCount: number }> {
  const userEmail = normalizeEmail(user.email || '');
  const isOwner = farm.ownerEmail === userEmail;
  const authList = farm.authorizedEmails.slice(0, BLUEPRINT_LIMITS.AUTHORIZED_EMAILS_MAX);

  const existingPersonIds = new Set(existingData.persons.map((p) => p.id));
  const existingArrivalIds = new Set(existingData.arrivals.map((a) => a.id));
  const existingDispatchMap = new Map(existingData.dispatches.map((d) => [d.id, d]));

  const personIdRemap = new Map<string, string>();
  const ensuredPersonIds = new Set(existingPersonIds);

  const validIdOrNew = (raw: string | undefined, prefix: string): string => {
    if (
      raw &&
      raw.length <= BLUEPRINT_LIMITS.ID_MAX &&
      BLUEPRINT_LIMITS.ID_REGEX.test(raw)
    ) {
      return raw;
    }
    return generateSafeId(prefix);
  };

  const validDateOrToday = (raw: string | undefined): string => {
    if (raw && BLUEPRINT_LIMITS.DATE_REGEX.test(raw)) return raw;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  // 1. Persons first so existsAfter/exists checks on dispatches always pass
  for (const p of backup.persons) {
    const pid = validIdOrNew(p.id, 'per');
    if (p.id) personIdRemap.set(p.id, pid);
    ensuredPersonIds.add(pid);

    const name = clampString(p.name || 'Cliente', BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente';
    const phone = clampString(p.phone || '', BLUEPRINT_LIMITS.PHONE_MAX);
    const email = normalizeEmail(p.email || '');
    const notes = clampString(p.notes || '', BLUEPRINT_LIMITS.PERSON_NOTES_MAX);
    const ref = doc(db, `farms/${farm.id}/persons`, pid);

    if (existingPersonIds.has(pid)) {
      ops.push((b) =>
        b.update(ref, {
          name,
          phone,
          email,
          notes,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      ops.push((b) =>
        b.set(ref, {
          id: pid,
          farmId: farm.id,
          name,
          phone,
          email,
          notes,
          ownerEmail: farm.ownerEmail,
          authorizedEmails: authList,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  // Ensure any person referenced by dispatches exists
  for (const d of backup.dispatches) {
    const mappedPid =
      (d.personId && personIdRemap.get(d.personId)) ||
      validIdOrNew(d.personId, 'per');
    if (d.personId) personIdRemap.set(d.personId, mappedPid);
    if (!ensuredPersonIds.has(mappedPid)) {
      ensuredPersonIds.add(mappedPid);
      const ref = doc(db, `farms/${farm.id}/persons`, mappedPid);
      ops.push((b) =>
        b.set(ref, {
          id: mappedPid,
          farmId: farm.id,
          name: clampString(d.personName || 'Cliente', BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente',
          phone: '',
          email: '',
          notes: '',
          ownerEmail: farm.ownerEmail,
          authorizedEmails: authList,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  // Commit persons first
  const CHUNK_SIZE = 350;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const fn of ops.slice(i, i + CHUNK_SIZE)) {
      fn(batch);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farm.id}/persons`);
    }
  }

  // 2. Arrivals & Dispatches
  const dataOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (const a of backup.arrivals) {
    const aid = validIdOrNew(a.id, 'ent');
    const arrivalDate = validDateOrToday(a.arrivalDate);
    const supplier = clampString(a.supplier || 'Proveedor', BLUEPRINT_LIMITS.SUPPLIER_MAX) || 'Proveedor';
    const quantity = Math.max(0.01, round2(Number(a.quantity) || 1));
    const unit: UnitType = a.unit === 'kilos' ? 'kilos' : 'litros';
    const costUsd = Math.max(0, round2(Number(a.costUsd) || 0));
    const exchangeRateBs = Math.max(0.01, round2(Number(a.exchangeRateBs) || farm.defaultExchangeRate));
    const costBs = Math.max(0, round2(Number(a.costBs) || costUsd * exchangeRateBs));
    const notes = clampString(a.notes || '', BLUEPRINT_LIMITS.NOTES_MAX);
    const ref = doc(db, `farms/${farm.id}/arrivals`, aid);

    if (existingArrivalIds.has(aid)) {
      dataOps.push((b) =>
        b.update(ref, {
          arrivalDate,
          supplier,
          quantity,
          unit,
          costUsd,
          exchangeRateBs,
          costBs,
          notes,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      dataOps.push((b) =>
        b.set(ref, {
          id: aid,
          farmId: farm.id,
          arrivalDate,
          supplier,
          quantity,
          unit,
          costUsd,
          exchangeRateBs,
          costBs,
          notes,
          ownerEmail: farm.ownerEmail,
          authorizedEmails: authList,
          createdByUid: user.uid,
          createdByEmail: userEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  for (const d of backup.dispatches) {
    const did = validIdOrNew(d.id, 'des');
    const existing = existingDispatchMap.get(did);
    if (existing && existing.status === 'pagado' && !isOwner) {
      continue;
    }

    const personId =
      (d.personId && personIdRemap.get(d.personId)) ||
      validIdOrNew(d.personId, 'per');
    const saleDate = validDateOrToday(d.saleDate);
    const personName = clampString(d.personName || 'Cliente', BLUEPRINT_LIMITS.PERSON_NAME_MAX) || 'Cliente';
    const quantity = Math.max(0.01, round2(Number(d.quantity) || 1));
    const unit: UnitType = d.unit === 'kilos' ? 'kilos' : 'litros';
    const totalUsd = Math.max(0.01, round2(Number(d.totalUsd) || 0.01));
    const unitPriceUsd = Math.max(0, round2(Number(d.unitPriceUsd) || totalUsd / quantity));
    const exchangeRateBs = Math.max(0.01, round2(Number(d.exchangeRateBs) || farm.defaultExchangeRate));
    const totalBs = Math.max(0, round2(Number(d.totalBs) || totalUsd * exchangeRateBs));
    const notes = clampString(d.notes || '', BLUEPRINT_LIMITS.NOTES_MAX);

    const cleanAbonos: AbonoEntry[] = Array.isArray(d.abonos)
      ? d.abonos
          .slice(0, BLUEPRINT_LIMITS.ABONOS_MAX)
          .map((ab, idx) => ({
            slot: Math.min(BLUEPRINT_LIMITS.ABONOS_MAX, Math.max(1, Math.round(Number(ab.slot) || idx + 1))),
            amountUsd: Math.max(0, round2(Number(ab.amountUsd) || 0)),
            exchangeRateBs: Math.max(0.01, round2(Number(ab.exchangeRateBs) || exchangeRateBs)),
            amountBs: Math.max(0, round2(Number(ab.amountBs) || 0)),
            date: validDateOrToday(ab.date),
            note: clampString(ab.note || '', BLUEPRINT_LIMITS.ABONO_NOTE_MAX),
            recordedByEmail: normalizeEmail(ab.recordedByEmail || userEmail) || userEmail,
          }))
          .sort((a, b) => a.slot - b.slot)
      : [];

    const totals = computeDispatchTotals(totalUsd, cleanAbonos);
    const ref = doc(db, `farms/${farm.id}/dispatches`, did);

    if (existing) {
      dataOps.push((b) =>
        b.update(ref, {
          saleDate,
          personId,
          personName,
          quantity,
          unit,
          unitPriceUsd,
          totalUsd,
          exchangeRateBs,
          totalBs,
          hasAbono: totals.hasAbono,
          abonos: cleanAbonos,
          totalPaidUsd: totals.totalPaidUsd,
          remainingUsd: totals.remainingUsd,
          status: totals.status,
          notes,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      dataOps.push((b) =>
        b.set(ref, {
          id: did,
          farmId: farm.id,
          saleDate,
          personId,
          personName,
          quantity,
          unit,
          unitPriceUsd,
          totalUsd,
          exchangeRateBs,
          totalBs,
          hasAbono: totals.hasAbono,
          abonos: cleanAbonos,
          totalPaidUsd: totals.totalPaidUsd,
          remainingUsd: totals.remainingUsd,
          status: totals.status,
          notes,
          ownerEmail: farm.ownerEmail,
          authorizedEmails: authList,
          createdByUid: user.uid,
          createdByEmail: userEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  for (let i = 0; i < dataOps.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const fn of dataOps.slice(i, i + CHUNK_SIZE)) {
      fn(batch);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farm.id}/dispatches`);
    }
  }

  return {
    importedCount: backup.arrivals.length + backup.dispatches.length + backup.persons.length,
  };
}
