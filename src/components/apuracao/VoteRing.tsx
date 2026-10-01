import { fmtInt } from "@/lib/format";
import { NumberTicker } from "./NumberTicker";

type M = { value: number | null; status: string };
const has = (m: M) => m.status === "value" && m.value !== null;

/**
 * Anel da apuração presidencial — SOMENTE métricas oficiais do arquivo do TSE:
 *   anel externo  = % de seções totalizadas (s.pst);
 *   anel interno  = composição do comparecimento: válidos · brancos · nulos (só quando a fonte publica os três).
 * Indicador ausente ⇒ "Dado indisponível" (nunca estimado).
 */
export function VoteRing({ countedPct, turnout, valid, blank, nul, sectionsCounted, sectionsTotal }: { countedPct: M; turnout: M; valid: M; blank: M; nul: M; sectionsCounted: M; sectionsTotal: M }) {
  const R1 = 92;
  const R2 = 74;
  const C1 = 2 * Math.PI * R1;
  const C2 = 2 * Math.PI * R2;
  const pct = has(countedPct) ? Math.max(0, Math.min(100, countedPct.value!)) : null;
  const comp = has(turnout) && has(valid) && has(blank) && has(nul) && turnout.value! > 0 ? [
    { k: "Válidos", v: valid.value!, c: "#3987e5" },
    { k: "Brancos", v: blank.value!, c: "#a4a4a8" },
    { k: "Nulos", v: nul.value!, c: "#5a5a60" },
  ] : null;
  let acc = 0;
  return (
    <figure className="flex flex-col items-center gap-4 sm:flex-row sm:items-center lg:flex-col" data-testid="vote-ring" aria-label="Anel da apuração presidencial">
      <div className="relative size-[220px] shrink-0">
        <svg viewBox="0 0 220 220" className="size-full -rotate-90" aria-hidden>
          <circle cx="110" cy="110" r={R1} fill="none" stroke="#1d1d21" strokeWidth="10" />
          {pct !== null && <circle cx="110" cy="110" r={R1} fill="none" stroke="#f2f2f0" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C1} ${C1}`} style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }} />}
          <circle cx="110" cy="110" r={R2} fill="none" stroke="#1d1d21" strokeWidth="14" />
          {comp?.map((s) => {
            const len = (s.v / turnout.value!) * C2;
            const el = <circle key={s.k} cx="110" cy="110" r={R2} fill="none" stroke={s.c} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 2)} ${C2}`} strokeDashoffset={-acc} style={{ transition: "stroke-dasharray 900ms ease, stroke-dashoffset 900ms ease" }} />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[9.5px] tracking-[0.06em] leading-tight text-fg-3 uppercase">Seções<br />totalizadas</span>
          <NumberTicker value={pct} digits={2} suffix="%" empty="—" className="text-[34px] leading-none font-semibold text-fg" />
          <span className="mt-1 text-[11px] text-fg-3 tnum">{has(sectionsCounted) && has(sectionsTotal) ? `${fmtInt(sectionsCounted.value!)} de ${fmtInt(sectionsTotal.value!)}` : "Dado indisponível"}</span>
        </div>
      </div>
      <dl className="grid w-full max-w-[260px] grid-cols-1 gap-1.5 text-[12.5px]">
        <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
          <dt className="text-fg-3">Comparecimento</dt>
          <dd className="text-fg">{has(turnout) ? <NumberTicker value={turnout.value} className="text-[15px] font-medium" /> : <Unavailable m={turnout} />}</dd>
        </div>
        {[{ k: "Válidos", m: valid, c: "#3987e5" }, { k: "Brancos", m: blank, c: "#a4a4a8" }, { k: "Nulos", m: nul, c: "#5a5a60" }].map((x) => (
          <div key={x.k} className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-fg-3"><span className="size-2 rounded-[2px]" style={{ background: x.c }} aria-hidden />{x.k}</dt>
            <dd className="text-fg">
              {has(x.m) ? (
                <>
                  <NumberTicker value={x.m.value} className="text-[14px] font-medium" />
                  {has(turnout) && turnout.value! > 0 && <span className="ml-1.5 text-[11px] text-fg-3 tnum">{((x.m.value! / turnout.value!) * 100).toFixed(1).replace(".", ",")}%</span>}
                </>
              ) : (
                <Unavailable m={x.m} />
              )}
            </dd>
          </div>
        ))}
        <p className="mt-1 text-[10.5px] text-fg-3">Percentuais sobre o comparecimento publicado pelo TSE.</p>
      </dl>
    </figure>
  );
}

function Unavailable({ m }: { m: M }) {
  return <span className="text-[12px] text-fg-3">{m.status === "not_collected" ? "Não coletado" : "Dado indisponível"}</span>;
}
