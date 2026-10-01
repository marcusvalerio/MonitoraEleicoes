import type { CountState } from "@/analytics/apuracao";

export type Headline = "nao_iniciada" | "ao_vivo" | "encerrada" | "indisponivel";
export function headlineOf(s: CountState): Headline {
  if (s === "totalizada") return "encerrada";
  if (s === "em_apuracao" || s === "parcial") return "ao_vivo";
  if (s === "indisponivel") return "indisponivel";
  return "nao_iniciada";
}
const TEXT: Record<Headline, string> = { nao_iniciada: "APURAÇÃO NÃO INICIADA", ao_vivo: "APURAÇÃO AO VIVO", encerrada: "APURAÇÃO ENCERRADA", indisponivel: "DADO INDISPONÍVEL" };

/** Indicador do estado da apuração presidencial (texto + forma; cor nunca sozinha). Pulso só ao vivo (e sem reduced-motion). */
export function LiveStatus({ state }: { state: CountState }) {
  const h = headlineOf(state);
  const tone = h === "ao_vivo" ? "border-[#e5484d]/50 text-[#ff8a8e]" : h === "encerrada" ? "border-pos/50 text-pos" : "border-border-strong text-fg-2";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-[family-name:var(--font-display)] text-[11.5px] font-semibold tracking-[0.12em] ${tone}`} data-testid="live-status" data-headline={h}>
      <span className="relative inline-flex size-2" aria-hidden>
        {h === "ao_vivo" && <span className="absolute inset-0 rounded-full bg-[#e5484d] motion-safe:animate-ping" />}
        <span className={`relative inline-block size-2 ${h === "encerrada" ? "rounded-[1px] bg-pos" : h === "ao_vivo" ? "rounded-full bg-[#e5484d]" : "rounded-full border border-current"}`} />
      </span>
      {TEXT[h]}
      {state === "parcial" && <span className="font-[family-name:var(--font-sans)] text-[10.5px] font-normal tracking-normal text-warn">· atualização atrasada</span>}
    </span>
  );
}
