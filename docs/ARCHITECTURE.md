# Arquitetura

```
EXTERNAL PROVIDERS ─► INGESTION ─► NORMALIZATION ─► DOMAIN (store) ─► ANALYTICS ─► SERVICES/API ─► UI
   RawRecord            pipeline      normalizers        repository         puras        server comps
```

## Camadas (`src/`)

| Diretório | Responsabilidade | Depende de |
|---|---|---|
| `domain/` | Entidades, rótulos, regras (relevância, guardas editoriais), proveniência, qualidade de dado (`DataValue`, `ConfidenceLevel`), fato × medição × interpretação, identidade visual | — |
| `providers/` | **Contratos** (`contracts.ts`), erros (`errors.ts`), retry/backoff (`resilience.ts`), implementações `demo/`, `fixture/`, `geo/` e o **registry** (único ponto de seleção) | domain |
| `normalization/` | Esquemas RAW versionados (`schemas/`) e normalizadores por esquema; contexto de resolução de entidades | domain, geo |
| `ingestion/` | Pipeline provider → RAW → `SourceRecord` → normalização → store → IA; relatórios de ingestão | providers, normalization, ai |
| `ai/` | Contrato do classificador, validação da saída, classificador por regras | domain |
| `repository/` | Consultas de domínio sobre o store (a **única** porta de leitura dos services) | ingestion, analytics |
| `analytics/` | Agregações puras: eventos, temporal (1/5/15/30 min/debate), menções, plataformas, momentum, cobertura | domain, geo |
| `geo/` | Hierarquia territorial, agregação geográfica, tipos (independente do componente de mapa) | domain |
| `services/` | Orquestração para páginas (server components) | repository, analytics |
| `app/api/` | API REST de domínio | repository |
| `components/`, `app/` | UI | services (via props) |
| `infrastructure/` | Cache com TTL | — |

## Regras

1. A UI **não conhece** providers, formatos de origem nem o modo de dados. Recebe entidades de domínio e resultados analíticos.
2. `providers/registry.ts` é o **único** lugar que escolhe providers (`DATA_MODE=demo|fixture|live`). Não há `if (demo)` fora dele. O relógio (replay × tempo real) é uma `ClockSpec` do perfil, não um teste de modo.
3. Providers devolvem **RawRecord** paginados. Nunca entidades de domínio.
4. Normalização lança `NormalizationError` para registros inválidos; o pipeline **conta e reporta**, nunca corrige silenciosamente.
5. Analytics são funções puras sobre o domínio, testáveis e reutilizáveis entre providers.
6. Falha de um provider gera relatório `failed` e dados parciais — as demais fontes continuam.

## Prova de desacoplamento

`DATA_MODE=fixture` troca **todos** os providers por implementações com formatos RAW, IDs, cores de partido e classificador diferentes (`src/providers/fixture`). Nenhum componente muda. Coberto por `src/ingestion/ingestion.test.ts` e pelo E2E (`BASE_URL=… DEBATE_ID=fx-show-0001 npm run e2e`).

## Ciclo de vida do store

Hoje: ingestão em memória na primeira requisição do processo (memoizada). Em produção: workers de ingestão gravam no PostgreSQL (`db/schema.sql`); o `Repository` passa a consultar o banco mantendo a mesma interface.
