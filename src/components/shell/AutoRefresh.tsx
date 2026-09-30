"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Revalida a página do servidor periodicamente durante eventos ao vivo. */
export function AutoRefresh({ seconds = 30, enabled = true }: { seconds?: number; enabled?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, enabled]);
  return null;
}
