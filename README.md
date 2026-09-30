# MONITORA ELEIÇÕES

> O que foi dito. O que repercutiu. O que os dados mostram.

Plataforma de inteligência eleitoral e acompanhamento de debates — data journalism / civic tech.
**Não** diz ao usuário em quem votar: sem rankings, "vencedor do debate", notas ou previsões.

## Rodando

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + testes + build
```

Funciona sem nenhuma API externa: `DATA_MODE=demo` (padrão). `DATA_MODE=fixture` usa providers alternativos (formatos de origem diferentes) para provar o desacoplamento. Todos os dados são fictícios; o indicador global do shell informa o perfil.

Documentação: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/PROVIDERS.md`](docs/PROVIDERS.md) · [`docs/PROVENANCE.md`](docs/PROVENANCE.md) · [`docs/GEO.md`](docs/GEO.md) · [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md)

## Arquitetura

```
src/
  domain/      entidades, rótulos, regra de relevância, guardas editoriais (sem React)
  ai/          contrato do classificador, validação de saída, relevância por segmento
  analytics/   agregações puras, Event Engine, momentum de temas, narrativa descritiva
  geo/         camada geoespacial: hierarquia, agregação, tipos (independente do mapa)
  providers/   interfaces (Transcript, Social, TSE, FactCheck) + mocks + registry (server-only)
  data/demo/   dataset determinístico (4 candidatos fictícios, 101 falas, 12 temas)
  services/    orquestração para server components
  components/  ui · shell · charts (SVG próprio) · debate
  app/         rotas (App Router) + API (/api/debates/[id]/feed, /api/search)
db/schema.sql  schema PostgreSQL/Supabase (RAW × AI separados, pipeline TSE)
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
