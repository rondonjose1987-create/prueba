import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type UserCredential,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as { firestoreDatabaseId?: string })
  .firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
] as const;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const driveGoogleProvider = new GoogleAuthProvider();
driveGoogleProvider.addScope('https://www.googleapis.com/auth/drive.file');
driveGoogleProvider.setCustomParameters({ prompt: 'consent select_account' });

// Strictly in-memory OAuth access token for Google Drive API calls (never persisted to storage)
let cachedDriveAccessToken: string | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedDriveAccessToken = null;
  }
});

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedDriveAccessToken = null;
}

function mapGoogleAuthError(err: unknown, context: 'login' | 'drive'): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  if (code === 'auth/popup-blocked') {
    return new Error(
      'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e intenta nuevamente.'
    );
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error(
      context === 'drive'
        ? 'Se cerró la ventana de permiso de Google Drive antes de finalizar.'
        : 'Se cerró la ventana de inicio de sesión antes de completar el ingreso.'
    );
  }
  if (code === 'auth/unauthorized-domain') {
    return new Error(
      'Este dominio aún no está autorizado en Firebase Authentication (Authorized domains).'
    );
  }
  if (err instanceof Error) return err;
  return new Error(
    context === 'drive'
      ? 'No se pudo conectar con Google Drive.'
      : 'No se pudo iniciar sesión con Google.'
  );
}

export async function signInWithGoogle(): Promise<UserCredential> {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    throw mapGoogleAuthError(err, 'login');
  }
}

export async function connectGoogleDrive(): Promise<string> {
  try {
    const result = await signInWithPopup(auth, driveGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Google no devolvió permiso de acceso para Google Drive. Intenta nuevamente.'
      );
    }
    cachedDriveAccessToken = credential.accessToken;
    return credential.accessToken;
  } catch (err) {
    throw mapGoogleAuthError(err, 'drive');
  }
}

export async function logoutUser(): Promise<void> {
  cachedDriveAccessToken = null;
  await signOut(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
