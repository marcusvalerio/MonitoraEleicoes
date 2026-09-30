const TZ = "America/Sao_Paulo";

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}m`;
  return m ? `${m}m${String(r).padStart(2, "0")}s` : `${r}s`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
}

/** Horário de parede (BRT) de um offset do debate. Offset desconhecido ⇒ "—" (nunca inventado). */
export function wallClock(startsAt: string, offset: number | null, withSeconds = true): string {
  if (offset === null || !Number.isFinite(offset)) return "—";
  const d = new Date(Date.parse(startsAt) + offset * 1000);
  return d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hour12: false });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "").toUpperCase();
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function fmtCompact(n: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits).replace(".", ",")}%`;
}
