import type { Readable } from "node:stream";
import type { Sql } from "@/persistence/db";
import { log } from "@/infrastructure/log";
import { tseNull, tseRows } from "@/elections/tse/csv";
import { bulk, finishBatch, sourceRecord, startBatch } from "@/elections/tse/importer";

/**
 * PESQUISAS ELEITORAIS registradas no TSE (PesqEle · dadosabertos.tse.jus.br, pacote pesquisas-eleitorais-<ano>).
 * Fonte traz o REGISTRO (instituto, contratante, período, amostra, custo, metodologia) — não os percentuais.
 * results_status permanece 'not_available'. CPF de contratante pessoa física é descartado na leitura.
 */
export const pollsUrl = (year: number, kind: "pesquisa_eleitoral" | "pesquisa_contratante" = "pesquisa_eleitoral") => `https://cdn.tse.jus.br/estatistica/sead/odsele/pesquisa_eleitoral/${kind}_${year}.zip`;

const OFFICE_BY_NAME: Record<string, number> = { presidente: 1, governador: 3, senador: 5, "deputado federal": 6, "deputado estadual": 7, "deputado distrital": 8, prefeito: 11, vereador: 13 };
export function parseOffices(raw: string | null): number[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((x) => OFFICE_BY_NAME[x.trim().toLowerCase()]).filter((x): x is number => !!x))].sort((a, b) => a - b);
}
const date = (v: string | undefined) => {
  const s = tseNull(v);
  const m = s && /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
/** "2026-08-25 21:18:23" (horário de Brasília) → ISO */
const stamp = (v: string | undefined) => {
  const s = tseNull(v);
  const m = s && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(s);
  return m ? new Date(`${m[1]}T${m[2]}-03:00`).toISOString() : null;
};
const money = (v: string | undefined) => {
  const s = tseNull(v);
  return s && /^\d+(,\d+)?$/.test(s) ? Number(s.replace(",", ".")) : null;
};
const int = (v: string | undefined) => {
  const s = tseNull(v);
  return s && /^\d+$/.test(s) ? Number(s) : null;
};
const yn = (v: string | undefined) => (v === "S" ? true : v === "N" ? false : null);

export interface PollImportOptions {
  datasetId?: string;
  datasetKind?: "production" | "fixture";
  url?: string;
  sha256?: string | null;
}

export async function importPolls(sql: Sql, year: number, polls: Readable, contractors: Readable | null, o: PollImportOptions = {}) {
  const url = o.url ?? pollsUrl(year);
  const batch = await startBatch(sql, year, "polls", url, o.sha256 ?? null);
  const srId = await sourceRecord(sql, { datasetId: o.datasetId ?? "tse-oficial", datasetKind: o.datasetKind ?? "production", kind: "pesquisa_eleitoral", year, url, sha256: o.sha256 ?? null });
  let read = 0;
  let rejected = 0;
  const rows = new Map<string, Record<string, unknown>>();
  try {
    for await (const r of tseRows(polls)) {
      read++;
      const protocol = tseNull(r.NR_PROTOCOLO_REGISTRO);
      if (!protocol || Number(r.AA_ELEICAO) !== year || !tseNull(r.NM_EMPRESA)) {
        rejected++;
        continue;
      }
      rows.set(protocol, {
        protocol,
        year,
        election_code: int(r.CD_ELEICAO),
        election_name: tseNull(r.NM_ELEICAO),
        uf: r.SG_UF,
        ue_code: tseNull(r.SG_UE),
        ue_name: tseNull(r.NM_UE),
        offices_raw: tseNull(r.DS_CARGO),
        office_ids: `{${parseOffices(tseNull(r.DS_CARGO)).join(",")}}`,
        registered_at: stamp(r.DT_REGISTRO),
        own_poll: yn(r.ST_PESQUISA_PROPRIA),
        company_cnpj: tseNull(r.NR_CNPJ_EMPRESA),
        company_name: r.NM_EMPRESA,
        company_trade_name: tseNull(r.NM_EMPRESA_FANTASIA),
        field_start: date(r.DT_INICIO_PESQUISA),
        field_end: date(r.DT_FIM_PESQUISA),
        release_date: date(r.DT_DIVULGACAO),
        sample_size: int(r.QT_ENTREVISTADO),
        statistician: tseNull(r.NM_ESTATISTICO_RESP),
        statistician_conre: tseNull(r.CD_CONRE),
        cost_brl: money(r.VR_PESQUISA),
        methodology: tseNull(r.DS_METODOLOGIA_PESQUISA),
        sample_plan: tseNull(r.DS_PLANO_AMOSTRAL),
        control_system: tseNull(r.DS_SISTEMA_CONTROLE),
        municipality_detail: tseNull(r.DS_DADO_MUNICIPIO),
        source_record_id: srId,
        import_batch_id: batch,
      });
    }
    const cols: [string, string][] = [["protocol", "text"], ["year", "smallint"], ["election_code", "int"], ["election_name", "text"], ["uf", "text"], ["ue_code", "text"], ["ue_name", "text"], ["offices_raw", "text"], ["office_ids", "smallint[]"], ["registered_at", "timestamptz"], ["own_poll", "boolean"], ["company_cnpj", "text"], ["company_name", "text"], ["company_trade_name", "text"], ["field_start", "date"], ["field_end", "date"], ["release_date", "date"], ["sample_size", "int"], ["statistician", "text"], ["statistician_conre", "text"], ["cost_brl", "numeric"], ["methodology", "text"], ["sample_plan", "text"], ["control_system", "text"], ["municipality_detail", "text"], ["source_record_id", "text"], ["import_batch_id", "uuid"]];
    const upd = cols.filter(([c]) => c !== "protocol").map(([c]) => `${c} = excluded.${c}`).join(", ");
    await bulk(sql, "poll", cols, [...rows.values()], `on conflict (protocol) do update set ${upd}, updated_at = now()`, "", 500);
    let contractorRows = 0;
    if (contractors) {
      const cs: Record<string, unknown>[] = [];
      for await (const r of tseRows(contractors)) {
        const protocol = tseNull(r.NR_PROTOCOLO_REGISTRO);
        const code = int(r.CD_CONTRATANTE);
        if (!protocol || code === null || !rows.has(protocol)) continue;
        const doc = (tseNull(r.NR_CPF_CNPJ_CONTRATANTE) ?? "").replace(/\D/g, "");
        const kind = doc.length === 14 ? "pessoa_juridica" : doc.length === 11 ? "pessoa_fisica" : "desconhecido";
        cs.push({ protocol, contractor_code: code, kind, cnpj: kind === "pessoa_juridica" ? doc : null, name: tseNull(r.NM_CONTRATANTE), amount_paid: money(r.VR_PAGO_CONTRATANTE), is_payer: yn(r.ST_CONTRATANTE_PAGANTE), funding_origin: tseNull(r.DS_ORIGEM_RECURSO) });
      }
      await bulk(sql, "poll_contractor", [["protocol", "text"], ["contractor_code", "bigint"], ["kind", "text"], ["cnpj", "text"], ["name", "text"], ["amount_paid", "numeric"], ["is_payer", "boolean"], ["funding_origin", "text"]], cs, "on conflict (protocol, contractor_code) do update set kind = excluded.kind, cnpj = excluded.cnpj, name = excluded.name, amount_paid = excluded.amount_paid, is_payer = excluded.is_payer, funding_origin = excluded.funding_origin", "", 1000);
      contractorRows = cs.length;
    }
    await finishBatch(sql, batch, { read, written: rows.size, rejected });
    log("info", "tse.polls.imported", { year, read, written: rows.size, rejected, contractors: contractorRows });
    return { read, written: rows.size, rejected, contractors: contractorRows, batch };
  } catch (e) {
    await finishBatch(sql, batch, { read, written: 0, rejected, error: (e as Error).message.slice(0, 500) });
    throw e;
  }
}
