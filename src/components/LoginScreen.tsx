import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginScreenProps {
  onSignIn: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSignIn,
  isLoading,
  error,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-4">
        <span className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          MelazaFinca
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton compact showGuideFallback />
          <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">
            Control de Inventario y Abonos
          </span>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-medium text-emerald-800 tracking-wide">
            Celular y Computadora · Sincronización Gmail y Google Drive
          </p>
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Control total de llegadas, despachos y abonos de melaza por persona
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            Registra la melaza que ingresa a tu finca y cada despacho en litros o kilos con su precio en dólares, equivalente en bolívares a la tasa oficial BCV del día y seguimiento de hasta 10 columnas de abonos por venta.
          </p>

          <ul className="space-y-3 pt-2 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <span>
                Almacenamiento en tu Gmail (Google Drive): guarda respaldos y exporta tu libro directo a Google Sheets desde cualquier celular o PC.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <span>
                Tasa oficial diaria del Banco Central de Venezuela (BCV) en dólares y bolívares, editable por fecha de venta y abono.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <span>
                Acceso compartido: autoriza otros correos Gmail para consultar o registrar movimientos e instala la app directo en tu dispositivo.
              </span>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Ingresar con cualquier cuenta Gmail
              </h2>
              <p className="text-sm text-slate-600">
                Cualquier persona puede iniciar sesión con Google para crear su propia finca privada o entrar a una finca compartida con su correo.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={isLoading}
              className="gsi-material-button w-full justify-center"
            >
              <div className="gsi-material-button-icon">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  style={{ display: 'block' }}
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </div>
              <span className="whitespace-nowrap">
                {isLoading ? 'Conectando...' : 'Iniciar sesión con Google'}
              </span>
              {!isLoading && <ArrowRight className="w-4 h-4 text-slate-400" />}
            </button>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between gap-2">
              <span>Ejemplo de registro</span>
              <span className="font-mono tabular-nums text-slate-700">
                José · 10 Lts · $19.00 · 9.159 Bs.V
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-6 py-6 text-xs text-slate-500 flex items-center justify-between border-t border-slate-200/70">
        <span>MelazaFinca</span>
        <span>Inventario de Melaza · Litros y Kilos · USD / Bs.V</span>
      </footer>
    </div>
  );
};
