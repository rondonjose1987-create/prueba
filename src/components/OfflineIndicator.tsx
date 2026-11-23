import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      <span>
        Sin conexión a internet — mostrando datos guardados en caché local.
      </span>
    </div>
  );
};
