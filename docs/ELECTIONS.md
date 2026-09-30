# Eleições — domínio e dados oficiais

Fonte única de candidaturas e resultados: **Portal de Dados Abertos do TSE** (`dadosabertos.tse.jus.br`, CKAN + CDN).
Nenhum número eleitoral é inventado; perfis `demo`/`fixture` não mostram resultados.

## Modelo (migração `0006_election_history.sql`)

| Tabela | Conteúdo |
|---|---|
| `election` | ciclo (`year`) e status: `scheduled` · `candidacies_only` · `results_partial` · `results_official` |
| `office` | cargo (id = `CD_CARGO` do TSE): 1 Presidente, 3 Governador, 5 Senador, 6 Dep. Federal, 7 Dep. Estadual, 8 Dep. Distrital |
| `territory` | Brasil (0) → Região (1–5, IBGE) → UF (código IBGE 11–53) → Município (100000 + código TSE); Exterior = 99 |
| `party_registration` | partido por ciclo (número, sigla, nome) — siglas mudam entre ciclos |
| `candidacy` | candidatura (`SQ_CANDIDATO` único por ano), nomes, partido, coligação/federação, situação por turno, `title_hmac`/`cpf_hmac` |
| `person`, `identity_link` | identidade histórica (ver ELECTION-HISTORY.md) |
| `result_candidacy` | votos nominais por candidatura × território (município e UF) × turno, com `votes_status` |
| `import_batch` | cada importação: URL, SHA-256, linhas lidas/gravadas/rejeitadas, notas |

## Ausência ≠ zero

`votes_status`: `value` (inclui zero real publicado pelo TSE) · `not_available` · `not_applicable` · `not_collected`.
Na UI: ciclo sem resultados publicados ⇒ “Resultados ainda não publicados pelo TSE”, nunca 0.
Percentual e colocação só existem quando o recorte é **uma única disputa** (Presidente em qualquer recorte;
cargo estadual com uma UF). Recortes que somam várias disputas ⇒ `n/a`.

## Escopo importado

Majoritários (Presidente, Governador, Senador) por município + deputados por UF — 2014, 2018, 2022; 2026 só candidaturas.

```
npm run import:tse -- --env development --year 2022            # candidaturas + resultados + identidade
npm run import:tse -- --env development --year 2026 --kind candidacies
npm run import:tse -- --env development --identity-only
```
Produção exige `--confirm-production`. Arquivos baixados ficam em `.monitora/tse` (gitignored).

## Filtros globais

`src/domain/filters.ts` — estado na URL: `ano, turno, cargo, candidatura, q, partido, regiao, uf, municipio, periodo (today|24h|7d|30d|custom), de, ate, plataforma, tipo, sentimento, tema`.
Combináveis; aplicados no SQL (`src/analytics/*`), nunca no navegador.
