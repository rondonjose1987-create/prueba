import type {
  Farm,
  MolassesArrival,
  MolassesDispatch,
  PersonAccount,
} from '../types/molasses';
import { buildDispatchesCsvString, todayIsoDate } from '../utils/format';

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface FarmDriveBackup {
  version: 1;
  exportedAt: string;
  farm: {
    id: string;
    name: string;
    defaultExchangeRate: number;
    densityKgPerLiter: number;
  };
  arrivals: MolassesArrival[];
  persons: PersonAccount[];
  dispatches: MolassesDispatch[];
}

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

async function handleDriveResponse<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 403) {
    throw new DriveAuthError(
      'Tu sesión de Google Drive expiró o requiere permisos. Conecta tu Google Drive nuevamente.'
    );
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg =
      errBody?.error?.message ||
      `Error de Google Drive (${res.status}).`;
    throw new Error(msg);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  contentType: string,
  bodyContent: string
): { boundary: string; payload: string } {
  const boundary = `melazafinca_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    '',
    bodyContent,
    `--${boundary}--`,
  ].join('\r\n');
  return { boundary, payload };
}

export async function listMelazaDriveFiles(
  accessToken: string
): Promise<DriveFileSummary[]> {
  const query = encodeURIComponent("trashed = false and name contains 'MelazaFinca'");
  const fields = encodeURIComponent(
    'files(id,name,mimeType,modifiedTime,size,webViewLink)'
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20desc&pageSize=30&fields=${fields}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await handleDriveResponse<{ files?: DriveFileSummary[] }>(res);
  return data.files || [];
}

export async function saveFarmBackupToDrive(
  accessToken: string,
  farm: Farm,
  data: {
    arrivals: MolassesArrival[];
    persons: PersonAccount[];
    dispatches: MolassesDispatch[];
  },
  existingFileId?: string
): Promise<DriveFileSummary> {
  const backup: FarmDriveBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    farm: {
      id: farm.id,
      name: farm.name,
      defaultExchangeRate: farm.defaultExchangeRate,
      densityKgPerLiter: farm.densityKgPerLiter,
    },
    arrivals: data.arrivals,
    persons: data.persons,
    dispatches: data.dispatches,
  };

  const fileName = `MelazaFinca - ${farm.name} (Respaldo).json`;
  const metadata: Record<string, unknown> = existingFileId
    ? { name: fileName }
    : { name: fileName, mimeType: 'application/json' };

  const { boundary, payload } = buildMultipartBody(
    metadata,
    'application/json',
    JSON.stringify(backup, null, 2)
  );

  const fields = encodeURIComponent(
    'id,name,mimeType,modifiedTime,size,webViewLink'
  );
  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=${fields}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`;

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  });

  return handleDriveResponse<DriveFileSummary>(res);
}

export async function exportLedgerSheetToDrive(
  accessToken: string,
  farm: Farm,
  dispatches: MolassesDispatch[],
  existingFileId?: string
): Promise<DriveFileSummary> {
  const csvString = buildDispatchesCsvString(dispatches, farm.defaultExchangeRate);
  const fileName = `MelazaFinca - ${farm.name} - Libro (${todayIsoDate()})`;
  const metadata: Record<string, unknown> = existingFileId
    ? { name: fileName }
    : {
        name: fileName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
      };

  const { boundary, payload } = buildMultipartBody(
    metadata,
    'text/csv',
    csvString
  );

  const fields = encodeURIComponent(
    'id,name,mimeType,modifiedTime,size,webViewLink'
  );
  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=${fields}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`;

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  });

  return handleDriveResponse<DriveFileSummary>(res);
}

export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<FarmDriveBackup> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const parsed = await handleDriveResponse<FarmDriveBackup>(res);
  if (
    !parsed ||
    !Array.isArray(parsed.arrivals) ||
    !Array.isArray(parsed.persons) ||
    !Array.isArray(parsed.dispatches)
  ) {
    throw new Error('El archivo seleccionado no tiene un respaldo válido de MelazaFinca.');
  }
  return parsed;
}

export async function deleteDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  await handleDriveResponse<void>(res);
}
