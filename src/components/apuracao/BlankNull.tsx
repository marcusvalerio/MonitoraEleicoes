import type { BlankNullRow } from "@/analytics/turnos";
import { fmtInt } from "@/lib/format";

const share = (n: number | null, t: number | null) => (n === null || !t ? null : (n / t) * 100);
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

function Row({ r }: { r: BlankNullRow }) {
  const b = share(r.blank, r.turnout);
  const n = share(r.nul, r.turnout);
  return (
    <li className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/70 py-2 text-[12.5px]">
      <span className="truncate text-fg-2">{r.name}</span>
      <span className="flex h-2.5 overflow-hidden rounded-full bg-[#e8e4dc]" title={`Brancos ${pct(b)} · Nulos ${pct(n)} do comparecimento`}>
        <span className="h-full bg-[#9a948a]" style={{ width: `${Math.min(100, (b ?? 0) * 5)}%` }} />
        <span className="h-full bg-[#4f4b45]" style={{ width: `${Math.min(100, (n ?? 0) * 5)}%` }} />
      </span>
      <span className="text-right font-[family-name:var(--font-num)] text-fg tabular-nums">
        {pct(b)} <span className="text-fg-3">·</span> {pct(n)}
      </span>
    </li>
  );
}

/** Brancos e nulos por região e por UF (+ Exterior): % sobre o comparecimento, números oficiais do TSE. */
export function BlankNull({ ufs, regions, ufName }: { ufs: BlankNullRow[]; regions: BlankNullRow[]; ufName: (k: string) => string }) {
  if (!ufs.length) return <p className="text-[12.5px] text-fg-3">Ainda sem arquivos oficiais coletados.</p>;
  const tot = ufs.reduce((a, u) => ({ t: a.t + (u.turnout ?? 0), b: a.b + (u.blank ?? 0), n: a.n + (u.nul ?? 0) }), { t: 0, b: 0, n: 0 });
  return (
    <div data-testid="blank-null">
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5"><span className="size-2.5 rounded-[2px] bg-[#9a948a]" />Brancos <b className="tabular-nums">{fmtInt(tot.b)}</b> · {pct(share(tot.b, tot.t))}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5"><span className="size-2.5 rounded-[2px] bg-[#4f4b45]" />Nulos <b className="tabular-nums">{fmtInt(tot.n)}</b> · {pct(share(tot.n, tot.t))}</span>
        <span className="self-center text-[11px] text-fg-3">% sobre o comparecimento apurado · barra ampliada 5×</span>
      </div>
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        <section>
          <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Regiões</h3>
          <ul>{regions.map((r) => <Row key={r.key} r={r} />)}</ul>
        </section>
        <section className="mt-6 lg:mt-0">
          <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Estados e Exterior</h3>
          <ul>{[...ufs].sort((a, b) => ufName(a.key).localeCompare(ufName(b.key), "pt-BR")).map((r) => <Row key={r.key} r={{ ...r, name: ufName(r.key) }} />)}</ul>
        </section>
      </div>
    </div>
  );
}
