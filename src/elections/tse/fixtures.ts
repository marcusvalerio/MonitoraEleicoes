import { Readable } from "node:stream";

/**
 * FIXTURES no FORMATO dos arquivos oficiais do TSE (colunas reais), com candidatos e partidos FICTÍCIOS.
 * Codificação latin1 e separador ";" como no original. Somente testes.
 */
const CAND_COLS = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_CARGO", "DS_CARGO", "SQ_CANDIDATO", "NR_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO", "NR_CPF_CANDIDATO", "DS_SITUACAO_CANDIDATURA", "NR_PARTIDO", "SG_PARTIDO", "NM_PARTIDO", "NM_FEDERACAO", "NM_COLIGACAO", "NR_TITULO_ELEITORAL_CANDIDATO", "DS_SIT_TOT_TURNO"];
const VOTE_COLS = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO", "NR_ZONA", "CD_CARGO", "SQ_CANDIDATO", "QT_VOTOS_NOMINAIS_VALIDOS"];

export interface FxCand {
  year: number;
  round?: number;
  uf: string;
  office: number;
  sq: string;
  number: number;
  name: string;
  ballot: string;
  party: [number, string, string];
  title: string;
  cpf: string;
  status: string;
}
export interface FxVote {
  year: number;
  round: number;
  uf: string;
  mun: number;
  munName: string;
  zone: number;
  office: number;
  sq: string;
  votes: number;
}

const line = (cells: (string | number)[]) => cells.map((c) => `"${String(c)}"`).join(";");
const toStream = (text: string) => Readable.from([Buffer.from(text, "latin1")]);

export function candCsv(rows: FxCand[]) {
  return toStream([line(CAND_COLS), ...rows.map((r) => line([r.year, r.round ?? 1, r.uf, r.office, r.office === 1 ? "PRESIDENTE" : r.office === 3 ? "GOVERNADOR" : "DEPUTADO FEDERAL", r.sq, r.number, r.name, r.ballot, r.cpf, "APTO", r.party[0], r.party[1], r.party[2], "#NULO#", "PARTIDO ISOLADO", r.title, r.status]))].join("\r\n"));
}
export function voteCsv(rows: FxVote[]) {
  return toStream([line(VOTE_COLS), ...rows.map((r) => line([r.year, r.round, r.uf, r.mun, r.munName, r.zone, r.office, r.sq, r.votes]))].join("\r\n"));
}

const P = { A: [91, "PFA", "PARTIDO FICTÍCIO A"] as [number, string, string], B: [92, "PFB", "PARTIDO FICTÍCIO B"] as [number, string, string] };

/** Helena Duarte disputa 2014 (Dep. Federal SP), 2018 e 2022 (Governadora RJ) e 2026 (Presidente) — mesmo título. */
export const FX_CANDIDACIES: FxCand[] = [
  { year: 2014, uf: "SP", office: 6, sq: "250000000001", number: 9101, name: "HELENA DUARTE", ballot: "HELENA DUARTE", party: P.A, title: "000000000191", cpf: "11111111111", status: "ELEITO POR QP" },
  { year: 2018, uf: "RJ", office: 3, sq: "190000000001", number: 91, name: "HELENA DUARTE", ballot: "HELENA", party: P.A, title: "000000000191", cpf: "-4", status: "NÃO ELEITO" },
  { year: 2022, uf: "RJ", office: 3, sq: "190000000101", number: 91, name: "HELENA DUARTE", ballot: "HELENA", party: P.A, title: "000000000191", cpf: "11111111111", status: "2º TURNO" },
  { year: 2022, round: 2, uf: "RJ", office: 3, sq: "190000000101", number: 91, name: "HELENA DUARTE", ballot: "HELENA", party: P.A, title: "000000000191", cpf: "11111111111", status: "ELEITO" },
  { year: 2026, uf: "BR", office: 1, sq: "280000000001", number: 91, name: "HELENA DUARTE", ballot: "HELENA DUARTE", party: P.A, title: "000000000191", cpf: "11111111111", status: "#NULO" },
  // Homônimos: mesmo nome, títulos diferentes ⇒ pessoas diferentes
  { year: 2018, uf: "RJ", office: 3, sq: "190000000002", number: 92, name: "JOSE SILVA", ballot: "ZE SILVA", party: P.B, title: "000000000292", cpf: "22222222222", status: "NÃO ELEITO" },
  { year: 2022, uf: "RJ", office: 3, sq: "190000000102", number: 92, name: "JOSE SILVA", ballot: "ZE SILVA", party: P.B, title: "000000000393", cpf: "33333333333", status: "2º TURNO" },
  { year: 2022, round: 2, uf: "RJ", office: 3, sq: "190000000102", number: 92, name: "JOSE SILVA", ballot: "ZE SILVA", party: P.B, title: "000000000393", cpf: "33333333333", status: "NÃO ELEITO" },
  // Dados de identificação não divulgáveis ⇒ unresolved (nunca associado por nome)
  { year: 2026, uf: "BR", office: 1, sq: "280000000002", number: 92, name: "JOSE SILVA", ballot: "ZE SILVA", party: P.B, title: "-4", cpf: "-4", status: "#NULO" },
  // Cargo fora do escopo (vice) é ignorado
  { year: 2022, uf: "RJ", office: 4, sq: "190000000199", number: 91, name: "VICE FICTICIO", ballot: "VICE", party: P.A, title: "000000000999", cpf: "99999999999", status: "ELEITO" },
];

export const FX_VOTES: FxVote[] = [
  // 2022 · Governador RJ · 1º turno · duas zonas no mesmo município (somadas) + outro município
  { year: 2022, round: 1, uf: "RJ", mun: 60011, munName: "RIO DE JANEIRO", zone: 4, office: 3, sq: "190000000101", votes: 1000 },
  { year: 2022, round: 1, uf: "RJ", mun: 60011, munName: "RIO DE JANEIRO", zone: 5, office: 3, sq: "190000000101", votes: 500 },
  { year: 2022, round: 1, uf: "RJ", mun: 58190, munName: "NITERÓI", zone: 71, office: 3, sq: "190000000101", votes: 200 },
  { year: 2022, round: 1, uf: "RJ", mun: 60011, munName: "RIO DE JANEIRO", zone: 4, office: 3, sq: "190000000102", votes: 800 },
  { year: 2022, round: 1, uf: "RJ", mun: 58190, munName: "NITERÓI", zone: 71, office: 3, sq: "190000000102", votes: 0 },
  { year: 2022, round: 2, uf: "RJ", mun: 60011, munName: "RIO DE JANEIRO", zone: 4, office: 3, sq: "190000000101", votes: 1700 },
  { year: 2022, round: 2, uf: "RJ", mun: 60011, munName: "RIO DE JANEIRO", zone: 4, office: 3, sq: "190000000102", votes: 900 },
  // 2014 · Deputado Federal SP · agregado por UF
  { year: 2014, round: 1, uf: "SP", mun: 71072, munName: "SÃO PAULO", zone: 1, office: 6, sq: "250000000001", votes: 300 },
  { year: 2014, round: 1, uf: "SP", mun: 62910, munName: "CAMPINAS", zone: 33, office: 6, sq: "250000000001", votes: 120 },
  // candidatura inexistente no arquivo de candidatos ⇒ rejeitada, nunca criada
  { year: 2022, round: 1, uf: "RJ", mun: 60011, munName: "RIO DE JANEIRO", zone: 4, office: 3, sq: "190000009999", votes: 10 },
];
