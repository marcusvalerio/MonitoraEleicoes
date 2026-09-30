# Arquitetura

```
EXTERNAL PROVIDERS ─► INGESTION ─► NORMALIZATION ─► DOMAIN (store) ─► PERSISTENCE ─► REPOSITORY ─► ANALYTICS ─► SERVICES/API ─► UI
   RawRecord            pipeline      normalizers        DataStore       PostgreSQL     memory|pg       puras        server comps
```

## Camadas (`src/`)

| Diretório | Responsabilidade | Depende de |
|---|---|---|
| `domain/` | Entidades, rótulos, regras (relevância, guardas editoriais), proveniência, qualidade de dado (`DataValue`, `ConfidenceLevel`), fato × medição × interpretação, identidade visual | — |
| `providers/` | **Contratos** (`contracts.ts`), erros (`errors.ts`), retry/backoff (`resilience.ts`), implementações `demo/`, `fixture/`, `geo/` e o **registry** (único ponto de seleção) | domain |
| `normalization/` | Esquemas RAW versionados (`schemas/`) e normalizadores por esquema; contexto de resolução de entidades | domain, geo |
| `ingestion/` | Pipeline provider → RAW → `SourceRecord` → normalização → store → IA; relatórios de ingestão | providers, normalization, ai |
| `ai/` | Contrato do classificador, validação da saída, classificador por regras | domain |
| `persistence/` | Cliente Neon, marcador de ambiente, gravador idempotente store → PostgreSQL | ingestion, domain |
| `repository/` | Interface `Repository` (assíncrona, **única** porta de leitura dos services); `StoreQueries` (consultas de domínio); implementações `memory` e `postgres` | ingestion, analytics, persistence |
| `analytics/` | Agregações puras: eventos, temporal (1/5/15/30 min/debate), menções, plataformas, momentum, cobertura | domain, geo |
| `geo/` | Hierarquia territorial, agregação geográfica, tipos (independente do componente de mapa) | domain |
| `services/` | Orquestração para páginas (server components) | repository, analytics |
| `app/api/` | API REST de domínio | repository |
| `components/`, `app/` | UI | services (via props) |
| `infrastructure/` | Cache com TTL, log estruturado (JSON) | — |

## Regras

1. A UI **não conhece** providers, formatos de origem nem o modo de dados. Recebe entidades de domínio e resultados analíticos.
2. `providers/registry.ts` é o **único** lugar que escolhe providers (`DATA_MODE=demo|fixture|live`). Não há `if (demo)` fora dele. O relógio (replay × tempo real) é uma `ClockSpec` do perfil, não um teste de modo.
3. Providers devolvem **RawRecord** paginados. Nunca entidades de domínio.
4. Normalização lança `NormalizationError` para registros inválidos; o pipeline **conta e reporta**, nunca corrige silenciosamente.
5. Analytics são funções puras sobre o domínio, testáveis e reutilizáveis entre providers.
6. Falha de um provider gera relatório `failed` e dados parciais — as demais fontes continuam.

## Prova de desacoplamento

`DATA_MODE=fixture` troca **todos** os providers por implementações com formatos RAW, IDs, cores de partido e classificador diferentes (`src/providers/fixture`). Nenhum componente muda. Coberto por `src/ingestion/ingestion.test.ts` e pelo E2E (`BASE_URL=… DEBATE_ID=fx-show-0001 npm run e2e`).

## Múltiplas fontes, um domínio

```
        g1 (editorial)   legenda/CC   STT streaming   replay   redes sociais   TSE
              │               │             │            │           │          │
              └── LiveEditorialProvider  LiveTranscriptProvider ───── SocialProvider  ElectionProvider
                                    │  (mesmo pipeline: RAW → normalização → domínio → análise)
                                    ▼
                    EditorialUpdate/Analysis · TranscriptSegment/SpeechClassification · …
                                    ▼
                                  Neon → Repository → analytics → UI
```

Cobertura editorial e transcrição são entidades distintas (nunca misturadas): `editorial_event` ≠ `transcript_segment`.

## Persistência

| Perfil | Repositório | Escrita |
|---|---|---|
| `demo`, `fixture` | `MemoryRepository` (ingestão em memória na 1ª requisição) | nenhuma — nunca tocam o banco |
| `live` | `PostgresRepository` (Neon) | worker de ingestão (`npm run ingest`), fora do ciclo HTTP |

Os dois repositórios reutilizam exatamente as mesmas consultas (`StoreQueries`): o `PostgresRepository` hidrata um `DataStore` a partir de consultas indexadas (análise vigente = mais recente por segmento) e recarrega a cada TTL. Services, API e UI não sabem qual está em uso. Detalhes: `docs/DATABASE.md`, `docs/INGESTION.md`, `docs/LIVE-DATA.md`.
