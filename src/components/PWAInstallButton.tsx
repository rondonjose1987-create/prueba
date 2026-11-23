import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  showGuideFallback?: boolean;
  shortMobileLabel?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  showGuideFallback = false,
  shortMobileLabel = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } =
    usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (isInstalled) {
    return null;
  }

  const appUrl =
    typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = async () => {
    if (!appUrl) return;
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Clipboard blocked
    }
  };

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[40px] sm:min-h-0 ${
          compact ? 'px-2.5 sm:px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs'
        }`}
        title="Instalar MelazaFinca en tu teléfono o computadora"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        {shortMobileLabel ? (
          <>
            <span className="sm:hidden">Instalar</span>
            <span className="hidden sm:inline">Instalar App</span>
          </>
        ) : (
          <span>Instalar App</span>
        )}
      </button>
    );
  }

  if (isIOS || showGuideFallback) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className={`inline-flex items-center justify-center gap-1.5 font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[40px] sm:min-h-0 ${
            compact ? 'px-2.5 sm:px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
          }`}
          title="Instalar en tu teléfono o computadora"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          {shortMobileLabel ? (
            <>
              <span className="sm:hidden">Instalar</span>
              <span className="hidden sm:inline">Instalar App</span>
            </>
          ) : (
            <span>{isIOS ? 'Instalar en iPhone' : 'Instalar App'}</span>
          )}
        </button>

        {showGuideModal && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Instalar MelazaFinca en tu teléfono
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Se instala directo desde el navegador, sin descargar archivo .apk
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  aria-label="Cerrar"
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isInIframe && appUrl && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
                  <p className="font-medium">
                    Estás viendo la app dentro de una vista previa. Para que aparezca el botón de instalar en tu teléfono, ábrela directo en Chrome o Safari:
                  </p>
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full min-h-[44px] px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir en navegador (Chrome / Safari)
                  </a>
                </div>
              )}

              {appUrl && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    Enlace directo de instalación para tu teléfono:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={appUrl}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 min-w-0 px-2.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl()}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer shrink-0 min-h-[40px]"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {isIOS ? (
                <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-900 text-xs">
                    Pasos en iPhone / iPad (Safari):
                  </p>
                  <p className="flex items-start gap-2 text-xs">
                    <Share className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                    <span>
                      1. Abre el enlace en <strong>Safari</strong> y toca el botón <strong>Compartir</strong> abajo.
                    </span>
                  </p>
                  <p className="text-xs">
                    2. Desliza hacia abajo y toca <strong>Agregar a inicio</strong>.
                  </p>
                  <p className="text-xs">
                    3. Toca <strong>Agregar</strong> y quedará instalada como aplicación.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-900">
                    Pasos en Android (Google Chrome):
                  </p>
                  <p>
                    1. Abre el enlace de arriba directamente en <strong>Google Chrome</strong> (no dentro de WhatsApp).
                  </p>
                  <p>
                    2. Toca los tres puntos <strong>⋮</strong> arriba a la derecha y elige <strong>Instalar aplicación</strong> (o <strong>Agregar a pantalla principal</strong>).
                  </p>
                  <p>
                    3. Confirma tocando <strong>Instalar</strong> y aparecerá el ícono verde de MelazaFinca en tu teléfono.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
