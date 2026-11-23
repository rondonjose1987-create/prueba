export type UnitType = 'litros' | 'kilos';
export type DispatchStatus = 'pendiente' | 'abonando' | 'pagado';
export type CollaboratorRole = 'admin' | 'operador' | 'consulta';

export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  FARM_NAME_MIN: 2,
  FARM_NAME_MAX: 80,
  EMAIL_MAX: 120,
  AUTHORIZED_EMAILS_MAX: 20,
  SUPPLIER_MAX: 100,
  PERSON_NAME_MAX: 80,
  PHONE_MAX: 30,
  NOTES_MAX: 300,
  PERSON_NOTES_MAX: 240,
  ABONO_NOTE_MAX: 120,
  ABONOS_MAX: 15,
  DEFAULT_ABONO_COLUMNS: 10,
} as const;

export interface AbonoEntry {
  slot: number; // 1..15
  amountUsd: number;
  exchangeRateBs: number;
  amountBs: number;
  date: string; // YYYY-MM-DD
  note: string;
  recordedByEmail: string;
}

export interface BcvRateInfo {
  rate: number;
  exactRate: number;
  fechaValorIso: string;
  fechaValorText: string;
  sourceUrl: string;
  fetchedAt: string;
}

export interface Farm {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  defaultExchangeRate: number;
  densityKgPerLiter: number;
  bcvAutoSync?: boolean;
  bcvFechaValor?: string;
  bcvExactRate?: number;
  authorizedEmails: string[];
  editorEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Collaborator {
  id: string;
  farmId: string;
  email: string;
  displayName: string;
  role: CollaboratorRole;
  ownerEmail: string;
  authorizedEmails: string[];
  addedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MolassesArrival {
  id: string;
  farmId: string;
  arrivalDate: string; // YYYY-MM-DD
  supplier: string;
  quantity: number;
  unit: UnitType;
  costUsd: number;
  exchangeRateBs: number;
  costBs: number;
  notes: string;
  ownerEmail: string;
  authorizedEmails: string[];
  createdByUid: string;
  createdByEmail: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PersonAccount {
  id: string;
  farmId: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  ownerEmail: string;
  authorizedEmails: string[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MolassesDispatch {
  id: string;
  farmId: string;
  saleDate: string; // YYYY-MM-DD
  personId: string;
  personName: string;
  quantity: number;
  unit: UnitType;
  unitPriceUsd: number;
  totalUsd: number;
  exchangeRateBs: number;
  totalBs: number;
  hasAbono: boolean;
  abonos: AbonoEntry[];
  totalPaidUsd: number;
  remainingUsd: number;
  status: DispatchStatus;
  notes: string;
  ownerEmail: string;
  authorizedEmails: string[];
  createdByUid: string;
  createdByEmail: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
