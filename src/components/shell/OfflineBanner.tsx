"use client";

import { useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-warn/30 bg-warn-bg px-4 py-1.5 text-[12px] text-warn">
      <CloudOff size={13} aria-hidden /> Você está offline. Os dados exibidos podem estar desatualizados; a atualização será retomada automaticamente.
    </div>
  );
}
