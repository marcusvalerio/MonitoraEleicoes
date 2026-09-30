# MONITORA ELEIÇÕES

> O que foi dito. O que repercutiu. O que os dados mostram.

Plataforma de inteligência eleitoral e acompanhamento de debates — data journalism / civic tech.
**Não** diz ao usuário em quem votar: sem rankings, "vencedor do debate", notas ou previsões.

## Rodando

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + testes + build
npm run test:db      # testes de persistência (branch Neon 'test'; requer DATABASE_URL_TEST)
```

Banco (perfil `live`): PostgreSQL no Neon — `npm run db:migrate`, `npm run ingest -- --env development`. Setup completo em [`docs/DATABASE.md`](docs/DATABASE.md).

Perfis de dados (`DATA_MODE`, resolvido em tempo de execução; o indicador global do shell informa o perfil):

| Perfil | Dados |
|---|---|
| `demo` (padrão) | fictícios, sem nenhuma API externa |
| `fixture` | fictícios, providers alternativos (formatos de origem diferentes) — prova de desacoplamento |
| `live` | **reais**, persistidos no PostgreSQL (Neon) pelo worker de ingestão a partir de `data/real` (hoje: debate para o Governo do RJ, TV Globo, 29/09/2026 — considerações finais, dataset `validation`) |

```bash
npm run e2e                                                    # perfil demo
BASE_URL=http://localhost:3002 DEBATE_ID=fx-show-0001 npm run e2e  # perfil fixture
BASE_URL=http://localhost:3004 npm run e2e:real:pg             # perfil live (debate real lido do PostgreSQL)
```

Documentação: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/PROVIDERS.md`](docs/PROVIDERS.md) · [`docs/PROVENANCE.md`](docs/PROVENANCE.md) · [`docs/GEO.md`](docs/GEO.md) · [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) · [`docs/VALIDATION-RJ-2026-09-29.md`](docs/VALIDATION-RJ-2026-09-29.md) · [`docs/DATABASE.md`](docs/DATABASE.md) · [`docs/INGESTION.md`](docs/INGESTION.md) · [`docs/LIVE-DATA.md`](docs/LIVE-DATA.md)

## Arquitetura

```
src/
  domain/      entidades, rótulos, regra de relevância, guardas editoriais (sem React)
  ai/          contrato do classificador, validação de saída, relevância por segmento
  analytics/   agregações puras, Event Engine, momentum de temas, narrativa descritiva
  geo/         camada geoespacial: hierarquia, agregação, tipos (independente do mapa)
  providers/   interfaces (Transcript, Social, TSE, FactCheck) + mocks + registry (server-only)
  data/demo/   dataset determinístico (4 candidatos fictícios, 101 falas, 12 temas)
  persistence/ cliente Neon, gravador idempotente, proteções de ambiente
  repository/  interface Repository + implementações memory/postgres
  services/    orquestração para server components
  components/  ui · shell · charts (SVG próprio) · debate
  app/         rotas (App Router) + API (/api/debates/[id]/feed, /api/search)
db/migrations/ schema PostgreSQL versionado (RAW × análise, proveniência, ingestão)
scripts/       db-migrate.mjs, ingest.mjs (worker)
```

- Regras de negócio ficam fora dos componentes; UI recebe dados prontos dos services.
- A tela ao vivo ingere janelas incrementais via `/api/debates/[id]/feed?from&to` (filtragem no servidor; substituível por SSE/Realtime).
- Eventos e métricas ao vivo nunca usam dados posteriores ao instante atual.
- Chaves de API só no servidor (`providers/registry.ts` é `server-only`).

## Rotas

`/` · `/overview` · `/debates` · `/debates/[id]` · `/debates/[id]/live` · `/debates/[id]/analytics` · `/social` (prévia P1) · `/social/events/[id]` · `/elections/[...]` (P1, sem números até importação TSE) · `/analyses` (P2) · `/sources` · `/methodology`

## Roadmap

- **P0 (entregue):** shell, design system, overview, ao vivo, transcrição, classificação mock, analytics, timeline de eventos, demo mode, fontes, metodologia.
- **Redesign editorial (v2):** Overview como central de comando, gráfico protagonista com temas e eventos, small multiples, mapa de repercussão (camadas, drill-down, controle temporal), indicador DEMO único no shell.
- **P1:** providers sociais reais, importação TSE, explorador eleitoral hierárquico, geometria municipal.
- **P2:** histórico/comparação, mapas, fact-checking, debate × eleição, busca semântica, alertas.
