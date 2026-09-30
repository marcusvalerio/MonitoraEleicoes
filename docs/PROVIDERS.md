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
| `live` | `FileTranscriptProvider` (arquivos reais em `data/real`) | `UnconfiguredSocialProvider` (`not_configured`) | `FileRegistryElectionProvider` | `FilePressProvider` (matérias usadas como fonte) | `RuleBasedSpeechClassifier` |

Geometria: `SvgGeoProvider` (UFs e regiões). Futuros: `TopoJsonGeoProvider`, provider de vector tiles (MapLibre).

## Importar um debate real (arquivo)

Quando a fonte não oferece acesso automatizado ao texto (streaming protegido, sem legenda pública), o debate entra por **arquivo**, pelo mesmo pipeline:

```
data/real/<evento>/
  manifest.json      # debate (id, título, emissora, jurisdição, cargo, início, fim|null, status, participantes, blocos),
                     # fonte principal, fonte da transcrição (URL, publicação, coleta, SHA-256), precisão temporal,
                     # atribuição de orador e speakerMap (resolução manual rótulo → candidato)
  registry.json      # partidos, candidaturas, números de urna, tseId (null até a integração TSE), identidade visual
  <transcrição>      # .vtt | .srt | .txt | .json | .csv
```

Formatos (`src/ingestion/formats/transcript.ts`):

| Formato | Tempo | Orador |
|---|---|---|
| VTT / SRT | exato (cues) | `<v Nome>`, `[Nome]` ou `NOME:` |
| TXT | opcional `[hh:mm:ss]`; `## Bloco` define o bloco | `NOME:` (linhas sem orador continuam o turno) |
| JSON | `start`/`end` opcionais (s ou `hh:mm:ss`) | `speaker` |
| CSV | colunas `start`,`end` opcionais | coluna `speaker` |

Regras: nenhum horário é inventado (ausente ⇒ `startOffset = null` + `timing.precision`); orador não resolvido vira `orador-desconhecido` com `speakerConfidence = unknown` (não é rejeitado nem assumido); rótulos podem ser resolvidos manualmente via `speakerMap`. Rode `DATA_MODE=live`.

Exemplo real: `data/real/rj-governador-2026-09-29` (ver `docs/VALIDATION-RJ-2026-09-29.md`).

## Transcrição ao vivo

Providers contínuos implementam `LiveTranscriptProvider` (capacidades `live`, `timed`, `speakerIdentification`, `sourceMode`) e emitem `live.segment/v1`. Hoje: `ReplayLiveTranscriptProvider` (replay temporizado, horários sintéticos). Ver `docs/LIVE-DATA.md`.

## Persistência e incremental

No perfil `live` os dados vão para o PostgreSQL pelo worker (`docs/INGESTION.md`). Para ser incremental, o provider deve paginar com cursor estável (`Page.resumeCursor`): o worker salva o cursor por fluxo em `ingestion_checkpoint` e retoma dali. `externalId` deve ser estável — é a chave de deduplicação (`provider_id + external_id`).

## Como criar um provider

1. Defina o esquema RAW em `src/normalization/schemas/<origem>.ts` (versionado: `origem.tipo/v1`).
2. Implemente o contrato em `src/providers/<origem>/` devolvendo `RawRecord` com `externalId`, `sourceUrl`, `publishedAt`, `collectedAt`. Credenciais só via `process.env` no servidor; declare-as em `config.requiredEnv`.
3. Escreva o normalizador em `src/normalization/normalizers.ts` (registre no mapa `NORMALIZERS`). Valide tudo; lance `NormalizationError` com `field`.
4. Declare a fonte (`Source`) e registre o provider num perfil em `src/providers/registry.ts`.
5. Rode a suíte de contrato (`src/providers/providers.test.ts`) adicionando o novo conjunto.
