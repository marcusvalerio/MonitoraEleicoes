# Camada de analytics

Toda agregação roda no PostgreSQL (índices, paginação por cursor); a UI só formata.

| Módulo | Funções | Observações |
|---|---|---|
| `analytics/elections.ts` | `electionsSummary`, `resultsTable`, `partyHistory`, `personHistory`, `searchCandidacies`, `resultsByTerritory` | % só em disputa única; ciclo sem resultados ⇒ nota, sem linhas |
| `analytics/social-listening.ts` | `coverage`, `kpis`, `funnel`, `series`, `candidateTable`, `byUf`, `feed` (cursor `published_at\|id`), `globalSearch` | `null` = não coletado; sem “score” geral |
| `analytics/debate-social.ts` | `debateSocial` | antes/durante/depois, janelas de mesma duração; associação temporal |
| `analytics/debate.ts` etc. | análises de debate (fases anteriores) | |

Linguagem proibida: ranking de mérito, “vencedor”, “mais popular”, causalidade (`domain/statements.ts`, `domain/guards.ts`).
Tabelas são ordenadas por volume/votos com aviso explícito de que não são rankings.

## Dashboards

`/monitoramento` (cobertura, KPIs, funil, série temporal com tooltip/tabela, temas, UFs, candidatos, feed),
`/elections`, `/candidatos/[pessoa]`, `/comparar?c=…`, painel social em `/ao-vivo/[id]`, admin em `/admin/inteligencia`.
Paleta categórica validada p/ daltonismo em superfície escura (`components/intel/palette.ts`), cor fixa por entidade.
