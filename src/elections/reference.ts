/**
 * Referência territorial e de cargos (códigos oficiais). Território:
 *   0 = Brasil · 1–5 = regiões (código IBGE) · 11–53 = UF (código IBGE) · 99 = Exterior (TSE "ZZ")
 *   100000 + código TSE = município (o TSE usa código próprio; o IBGE fica NULL até importar a tabela de equivalência)
 */
export const BR = 0;
export const EXTERIOR = 99;
export const REGIONS = [
  { id: 1, slug: "norte", name: "Norte", ufs: ["RO", "AC", "AM", "RR", "PA", "AP", "TO"] },
  { id: 2, slug: "nordeste", name: "Nordeste", ufs: ["MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA"] },
  { id: 3, slug: "sudeste", name: "Sudeste", ufs: ["MG", "ES", "RJ", "SP"] },
  { id: 4, slug: "sul", name: "Sul", ufs: ["PR", "SC", "RS"] },
  { id: 5, slug: "centro-oeste", name: "Centro-Oeste", ufs: ["MS", "MT", "GO", "DF"] },
] as const;
export const UF_IBGE: Record<string, number> = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
export const UF_NAME: Record<string, string> = { RO: "Rondônia", AC: "Acre", AM: "Amazonas", RR: "Roraima", PA: "Pará", AP: "Amapá", TO: "Tocantins", MA: "Maranhão", PI: "Piauí", CE: "Ceará", RN: "Rio Grande do Norte", PB: "Paraíba", PE: "Pernambuco", AL: "Alagoas", SE: "Sergipe", BA: "Bahia", MG: "Minas Gerais", ES: "Espírito Santo", RJ: "Rio de Janeiro", SP: "São Paulo", PR: "Paraná", SC: "Santa Catarina", RS: "Rio Grande do Sul", MS: "Mato Grosso do Sul", MT: "Mato Grosso", GO: "Goiás", DF: "Distrito Federal" };
export const regionOfUf = (uf: string) => REGIONS.find((r) => (r.ufs as readonly string[]).includes(uf))?.id ?? null;
export const ufTerritory = (uf: string) => (uf === "BR" ? BR : uf === "ZZ" ? EXTERIOR : (UF_IBGE[uf] ?? null));
export const municipalityTerritory = (tseCode: number) => 100000 + tseCode;

/** Cargos importados (CD_CARGO do TSE). Vices e suplentes ficam fora desta fase. */
export const OFFICES = [
  { id: 1, slug: "presidente", name: "Presidente", scope: "BR", majoritarian: true },
  { id: 3, slug: "governador", name: "Governador", scope: "UF", majoritarian: true },
  { id: 5, slug: "senador", name: "Senador", scope: "UF", majoritarian: true },
  { id: 6, slug: "deputado-federal", name: "Deputado Federal", scope: "UF", majoritarian: false },
  { id: 7, slug: "deputado-estadual", name: "Deputado Estadual", scope: "UF", majoritarian: false },
  { id: 8, slug: "deputado-distrital", name: "Deputado Distrital", scope: "UF", majoritarian: false },
] as const;
export const OFFICE_IDS = new Set<number>(OFFICES.map((o) => o.id));
export const MAJORITARIAN = new Set<number>(OFFICES.filter((o) => o.majoritarian).map((o) => o.id));

export const GENERAL_ELECTIONS = [2014, 2018, 2022, 2026] as const;

export const normalizeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
