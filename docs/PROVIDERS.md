# Providers

Contratos em `src/providers/contracts.ts`. Todos expõem `info` (`id`, `name`, `kind`, `mode`, `capabilities`, `config`, `rateLimit`, `retry`, `sourceId`) e `health()`.

| Contrato | Métodos | Capabilities |
|---|---|---|
| `TranscriptProvider` | `listEvents`, `fetchSegments(eventId)` | realtime, historical, replay, diarization, blocks |
| `SocialProvider` | `platforms`, `fetchPosts`, `fetchCounts`, `fetchRegionalCounts` | realtime, historical, posts, aggregatedCounts, engagement, candidates, topics, geolocation (`none`/`aggregated`/`per_post`) |
| `ElectionProvider` / `TSEElectionProvider` | `fetchParties`, `fetchCandidates`, `fetchPartyIdentities`, `fetchResults` (+ `listFiles` no TSE) | historical, candidates, parties, partyIdentity, results, resultsGranularity |
| `MediaProvider` | `fetchArticles` | articles, fullText, realtime |
| `GeoProvider` | `boundaries(level)` | levels, format (`svg-path`/`topojson`/`geojson`/`vector-tiles`) |

Nunca assuma paridade: o pipeline consulta um método apenas se a capability correspondente existir.

## Paginação

`PageRequest { cursor?, limit? }` → `Page<T> { items, nextCursor, hasMore }`. `collectAll()` é usado **somente** na ingestão; APIs públicas expõem cursor (ex.: `/api/debates/:id/transcript?cursor=&limit=`).

## Erros e limites

`ProviderUnavailable`, `AuthenticationRequired`, `RateLimited(retryAfter)`, `InvalidResponse`, `NormalizationError(recordId, field)`, `DataUnavailable`. `withRetry` aplica backoff exponencial com jitter e respeita `Retry-After`; só retenta erros `retryable`. `uiStateFor(error)` traduz para estados de UI.

## Implementações

| Perfil | Transcrição | Social | Eleições | Mídia | IA |
|---|---|---|---|---|---|
| `demo` | `DemoTranscriptProvider` | `DemoSocialProvider` | `DemoElectionProvider` | `DemoMediaProvider` | `DemoSpeechClassifier` |
| `fixture` | `FixtureTranscriptProvider` (cues em ms, orador por nome) | `FixtureSocialProvider` (sem posts; contagens por nome/rótulo; 3 registros inválidos) | `FixtureElectionProvider` (códigos próprios, cores embutidas) | `FixtureMediaProvider` (não configurado) | `RuleBasedSpeechClassifier` |
| `live` | — | — | — | — | — |

Geometria: `SvgGeoProvider` (UFs e regiões). Futuros: `TopoJsonGeoProvider`, provider de vector tiles (MapLibre).

## Como criar um provider

1. Defina o esquema RAW em `src/normalization/schemas/<origem>.ts` (versionado: `origem.tipo/v1`).
2. Implemente o contrato em `src/providers/<origem>/` devolvendo `RawRecord` com `externalId`, `sourceUrl`, `publishedAt`, `collectedAt`. Credenciais só via `process.env` no servidor; declare-as em `config.requiredEnv`.
3. Escreva o normalizador em `src/normalization/normalizers.ts` (registre no mapa `NORMALIZERS`). Valide tudo; lance `NormalizationError` com `field`.
4. Declare a fonte (`Source`) e registre o provider num perfil em `src/providers/registry.ts`.
5. Rode a suíte de contrato (`src/providers/providers.test.ts`) adicionando o novo conjunto.
