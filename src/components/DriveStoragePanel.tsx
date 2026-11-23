import React, { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  ExternalLink,
  FileSpreadsheet,
  FolderSync,
  HardDriveUpload,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  Farm,
  MolassesArrival,
  MolassesDispatch,
  PersonAccount,
} from '../types/molasses';
import {
  clearDriveAccessToken,
  connectGoogleDrive,
  getDriveAccessToken,
} from '../firebase';
import {
  deleteDriveFile,
  downloadDriveBackup,
  DriveAuthError,
  exportLedgerSheetToDrive,
  listMelazaDriveFiles,
  saveFarmBackupToDrive,
  type DriveFileSummary,
} from '../services/driveStorageService';

interface DriveStoragePanelProps {
  farm: Farm;
  userEmail: string;
  arrivals: MolassesArrival[];
  persons: PersonAccount[];
  dispatches: MolassesDispatch[];
  canEdit: boolean;
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

function formatFileSize(bytesStr?: string): string {
  const bytes = Number(bytesStr);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Hoja de cálculo';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DriveStoragePanel: React.FC<DriveStoragePanelProps> = ({
  farm,
  userEmail,
  arrivals,
  persons,
  dispatches,
  canEdit,
  onRestoreBackup,
  onRequestConfirm,
}) => {
  const [driveToken, setDriveToken] = useState<string | null>(() =>
    getDriveAccessToken()
  );
  const [files, setFiles] = useState<DriveFileSummary[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadFiles = useCallback(async (token: string) => {
    setLoadingFiles(true);
    setErrorMsg(null);
    try {
      const list = await listMelazaDriveFiles(token);
      setFiles(list);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        clearDriveAccessToken();
        setDriveToken(null);
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudieron consultar los archivos en Google Drive.'
      );
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const current = getDriveAccessToken();
    setDriveToken(current);
    if (current) {
      void loadFiles(current);
    }
  }, [loadFiles, userEmail]);

  const handleConnectDrive = async () => {
    setConnecting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const token = await connectGoogleDrive();
      setDriveToken(token);
      setStatusMsg('Google Drive conectado para esta sesión.');
      await loadFiles(token);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Google Drive.'
      );
    } finally {
      setConnecting(false);
    }
  };

  const ensureToken = async (): Promise<string> => {
    const existing = driveToken || getDriveAccessToken();
    if (existing) return existing;
    const fresh = await connectGoogleDrive();
    setDriveToken(fresh);
    return fresh;
  };

  const existingJsonBackup = files.find(
    (f) =>
      f.mimeType === 'application/json' &&
      f.name.includes(farm.name)
  );

  const handleBackupToDriveClick = () => {
    const willOverwrite = Boolean(existingJsonBackup);
    onRequestConfirm({
      title: willOverwrite
        ? 'Actualizar respaldo en tu Google Drive'
        : 'Guardar respaldo en tu Google Drive',
      description: willOverwrite
        ? `Se actualizará el archivo "${existingJsonBackup?.name}" en tu Google Drive (${userEmail}) con ${arrivals.length} entradas, ${persons.length} personas y ${dispatches.length} despachos.`
        : `Se creará el archivo "MelazaFinca - ${farm.name} (Respaldo).json" en tu Google Drive (${userEmail}) con toda la información de la finca.`,
      confirmLabel: willOverwrite ? 'Actualizar respaldo' : 'Guardar en Drive',
      onConfirm: async () => {
        setErrorMsg(null);
        setStatusMsg(null);
        try {
          const token = await ensureToken();
          const saved = await saveFarmBackupToDrive(
            token,
            farm,
            { arrivals, persons, dispatches },
            existingJsonBackup?.id
          );
          setStatusMsg(`Respaldo guardado en Google Drive: ${saved.name}`);
          await loadFiles(token);
        } catch (err) {
          if (err instanceof DriveAuthError) {
            clearDriveAccessToken();
            setDriveToken(null);
          }
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Error al guardar respaldo en Google Drive.'
          );
        }
      },
    });
  };

  const handleExportSheetClick = () => {
    onRequestConfirm({
      title: 'Subir libro de despachos a Google Sheets',
      description: `Se guardará una hoja de cálculo de Google Sheets en tu Google Drive (${userEmail}) con los ${dispatches.length} despachos y sus 10+ columnas de abonos.`,
      confirmLabel: 'Subir a Google Sheets',
      onConfirm: async () => {
        setErrorMsg(null);
        setStatusMsg(null);
        try {
          const token = await ensureToken();
          const saved = await exportLedgerSheetToDrive(token, farm, dispatches);
          setStatusMsg(`Hoja de cálculo creada en Google Drive: ${saved.name}`);
          await loadFiles(token);
        } catch (err) {
          if (err instanceof DriveAuthError) {
            clearDriveAccessToken();
            setDriveToken(null);
          }
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Error al exportar el libro a Google Drive.'
          );
        }
      },
    });
  };

  const handleRestoreClick = (file: DriveFileSummary) => {
    onRequestConfirm({
      title: 'Restaurar respaldo desde Google Drive',
      description: `Se importarán las entradas, personas, despachos y abonos desde "${file.name}" hacia la finca activa "${farm.name}".`,
      confirmLabel: 'Restaurar datos',
      onConfirm: async () => {
        setErrorMsg(null);
        setStatusMsg(null);
        try {
          const token = await ensureToken();
          const backup = await downloadDriveBackup(token, file.id);
          const result = await onRestoreBackup({
            arrivals: backup.arrivals,
            persons: backup.persons,
            dispatches: backup.dispatches,
          });
          setStatusMsg(
            `Restauración completada (${result.importedCount} registros procesados desde ${file.name}).`
          );
        } catch (err) {
          if (err instanceof DriveAuthError) {
            clearDriveAccessToken();
            setDriveToken(null);
          }
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'No se pudo restaurar el respaldo desde Google Drive.'
          );
        }
      },
    });
  };

  const handleDeleteFileClick = (file: DriveFileSummary) => {
    onRequestConfirm({
      title: 'Eliminar archivo de Google Drive',
      description: `¿Seguro que deseas eliminar "${file.name}" de tu Google Drive? Esta acción no borra los datos actuales de la finca, solo el archivo en Drive.`,
      confirmLabel: 'Eliminar de Drive',
      destructive: true,
      onConfirm: async () => {
        setErrorMsg(null);
        setStatusMsg(null);
        try {
          const token = await ensureToken();
          await deleteDriveFile(token, file.id);
          setStatusMsg(`Archivo eliminado de Google Drive: ${file.name}`);
          await loadFiles(token);
        } catch (err) {
          if (err instanceof DriveAuthError) {
            clearDriveAccessToken();
            setDriveToken(null);
          }
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'No se pudo eliminar el archivo de Google Drive.'
          );
        }
      },
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-emerald-700 shrink-0" />
            <h2 className="text-base font-semibold text-slate-900">
              Almacenamiento en tu Google Drive (Gmail)
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Guarda respaldos completos y libros de despachos directamente en el almacenamiento de tu cuenta Gmail ({userEmail}). Solo accede a los archivos creados por MelazaFinca.
          </p>
        </div>

        <div className="shrink-0">
          {driveToken ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">
                Drive conectado
              </span>
              <button
                type="button"
                onClick={() => void loadFiles(driveToken)}
                disabled={loadingFiles}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer min-h-[44px] sm:min-h-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin text-emerald-700' : ''}`}
                />
                Actualizar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnectDrive()}
              disabled={connecting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            >
              <FolderSync className="w-4 h-4" />
              {connecting ? 'Conectando...' : 'Conectar mi Google Drive'}
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {statusMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {statusMsg}
        </div>
      )}

      {!driveToken ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed">
          Conecta tu cuenta de Google Drive para guardar copias de respaldo en la nube de tu Gmail, exportar tu libro de abonos a Google Sheets o restaurar una copia anterior en cualquier celular o computadora.
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <button
              type="button"
              onClick={handleBackupToDriveClick}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            >
              <HardDriveUpload className="w-4 h-4" />
              {existingJsonBackup
                ? 'Actualizar respaldo en Drive'
                : 'Guardar respaldo en Drive'}
            </button>

            <button
              type="button"
              onClick={handleExportSheetClick}
              disabled={dispatches.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              Subir libro a Google Sheets
            </button>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-semibold text-slate-700">
              Archivos guardados en tu Google Drive ({files.length})
            </h3>

            {loadingFiles ? (
              <div className="p-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
                Cargando archivos de tu Google Drive...
              </div>
            ) : files.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
                Aún no hay archivos de MelazaFinca en tu Google Drive. Usa los botones de arriba para guardar tu primer respaldo o hoja de cálculo.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                {files.map((file) => {
                  const isJson =
                    file.mimeType === 'application/json' ||
                    file.name.endsWith('.json');
                  return (
                    <div
                      key={file.id}
                      className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          {formatModifiedDate(file.modifiedTime)} ·{' '}
                          {formatFileSize(file.size)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors min-h-[44px] sm:min-h-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir
                          </a>
                        )}
                        {isJson && canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRestoreClick(file)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer min-h-[44px] sm:min-h-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteFileClick(file)}
                          title="Eliminar archivo de Google Drive"
                          className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
