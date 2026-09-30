import type { GeoRegion } from "./types";

/**
 * Referência territorial. Nomes oficiais de regiões, UFs e municípios.
 * `weight` = participação populacional aproximada (%), usada somente para gerar dados DEMO.
 */
const REGIONS: [string, string][] = [
  ["N", "Norte"],
  ["NE", "Nordeste"],
  ["CO", "Centro-Oeste"],
  ["SE", "Sudeste"],
  ["S", "Sul"],
];

//            UF    Nome                   Região  peso  capital              outros municípios
const UFS: [string, string, string, number, string, string[]][] = [
  ["AC", "Acre", "N", 0.4, "Rio Branco", []],
  ["AP", "Amapá", "N", 0.4, "Macapá", []],
  ["AM", "Amazonas", "N", 1.9, "Manaus", []],
  ["PA", "Pará", "N", 4.0, "Belém", ["Ananindeua"]],
  ["RO", "Rondônia", "N", 0.8, "Porto Velho", []],
  ["RR", "Roraima", "N", 0.3, "Boa Vista", []],
  ["TO", "Tocantins", "N", 0.7, "Palmas", []],
  ["AL", "Alagoas", "NE", 1.5, "Maceió", []],
  ["BA", "Bahia", "NE", 6.9, "Salvador", ["Feira de Santana", "Vitória da Conquista"]],
  ["CE", "Ceará", "NE", 4.3, "Fortaleza", ["Caucaia", "Juazeiro do Norte"]],
  ["MA", "Maranhão", "NE", 3.3, "São Luís", ["Imperatriz"]],
  ["PB", "Paraíba", "NE", 2.0, "João Pessoa", ["Campina Grande"]],
  ["PE", "Pernambuco", "NE", 4.5, "Recife", ["Jaboatão dos Guararapes", "Caruaru"]],
  ["PI", "Piauí", "NE", 1.6, "Teresina", []],
  ["RN", "Rio Grande do Norte", "NE", 1.6, "Natal", ["Mossoró"]],
  ["SE", "Sergipe", "NE", 1.1, "Aracaju", []],
  ["DF", "Distrito Federal", "CO", 1.4, "Brasília", []],
  ["GO", "Goiás", "CO", 3.5, "Goiânia", ["Aparecida de Goiânia", "Anápolis"]],
  ["MT", "Mato Grosso", "CO", 1.8, "Cuiabá", ["Várzea Grande"]],
  ["MS", "Mato Grosso do Sul", "CO", 1.4, "Campo Grande", ["Dourados"]],
  ["ES", "Espírito Santo", "SE", 2.0, "Vitória", ["Vila Velha", "Serra"]],
  ["MG", "Minas Gerais", "SE", 10.0, "Belo Horizonte", ["Uberlândia", "Contagem", "Juiz de Fora"]],
  ["RJ", "Rio de Janeiro", "SE", 7.9, "Rio de Janeiro", ["São Gonçalo", "Duque de Caxias", "Niterói"]],
  ["SP", "São Paulo", "SE", 21.9, "São Paulo", ["Guarulhos", "Campinas", "São Bernardo do Campo", "Santos"]],
  ["PR", "Paraná", "S", 5.6, "Curitiba", ["Londrina", "Maringá"]],
  ["RS", "Rio Grande do Sul", "S", 5.3, "Porto Alegre", ["Caxias do Sul", "Pelotas"]],
  ["SC", "Santa Catarina", "S", 3.7, "Florianópolis", ["Joinville", "Blumenau"]],
];

export const OTHER_MUNICIPALITIES = "Demais municípios";

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function build(): GeoRegion[] {
  const out: GeoRegion[] = [{ key: "BR", level: "pais", name: "Brasil", shortName: "BR", parentKey: null, weight: 100 }];
  for (const [id, name] of REGIONS) {
    const w = UFS.filter((u) => u[2] === id).reduce((a, u) => a + u[3], 0);
    out.push({ key: `R:${id}`, level: "regiao", name, shortName: name, parentKey: "BR", weight: w });
  }
  for (const [uf, name, reg, w, capital, others] of UFS) {
    out.push({ key: `UF:${uf}`, level: "uf", name, shortName: uf, parentKey: `R:${reg}`, weight: w });
    const capShare = others.length ? 0.32 : 0.4;
    const otherShare = 0.07;
    const cities: [string, number][] = [[capital, capShare], ...others.map((o) => [o, otherShare] as [string, number])];
    const rest = 1 - cities.reduce((a, c) => a + c[1], 0);
    for (const [c, s] of [...cities, [OTHER_MUNICIPALITIES, rest] as [string, number]]) {
      out.push({ key: `M:${uf}:${slug(c)}`, level: "municipio", name: c, shortName: c, parentKey: `UF:${uf}`, weight: Math.round(w * s * 1000) / 1000 });
    }
  }
  return out;
}

export const GEO_REGIONS: GeoRegion[] = build();
const BY_KEY = new Map(GEO_REGIONS.map((r) => [r.key, r]));

export function getRegion(key: string): GeoRegion | null {
  return BY_KEY.get(key) ?? null;
}

export function childrenOf(key: string): GeoRegion[] {
  return GEO_REGIONS.filter((r) => r.parentKey === key);
}

/** Descendentes de `key` em um nível específico (ex.: BR → UFs, pulando regiões). */
export function descendantsAt(key: string, level: GeoRegion["level"]): GeoRegion[] {
  const out: GeoRegion[] = [];
  const walk = (k: string) => {
    for (const c of childrenOf(k)) {
      if (c.level === level) out.push(c);
      else walk(c.key);
    }
  };
  walk(key);
  return out;
}

export function ancestorsOf(key: string): GeoRegion[] {
  const out: GeoRegion[] = [];
  let r = getRegion(key);
  while (r) {
    out.unshift(r);
    r = r.parentKey ? getRegion(r.parentKey) : null;
  }
  return out;
}

/** Verdadeiro se `key` é `ancestor` ou descendente dele. */
export function isWithin(key: string, ancestor: string): boolean {
  let r = getRegion(key);
  while (r) {
    if (r.key === ancestor) return true;
    r = r.parentKey ? getRegion(r.parentKey) : null;
  }
  return false;
}

export const LEAF_REGIONS = GEO_REGIONS.filter((r) => r.level === "municipio");
