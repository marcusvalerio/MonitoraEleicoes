# Proveniência

```
Source ─► Provider ─► RawRecord ─► SourceRecord ─► entidade de domínio (provenance.record)
```

- **Source**: fonte lógica ("X · posts sobre o debate"), com tipo (`official`, `social`, `media`, `transcript`, `ai_analysis`), status (`connected`, `degraded`, `offline`, `not_configured`, `demo`), licença e descrição.
- **SourceRecord**: um por item recebido — `id = providerId:externalId`, `schema`, `sourceUrl`, `publishedAt` (origem), `collectedAt` (provider), `ingestedAt` (Monitora), `payloadHash` (FNV-1a do payload, detecta alterações).
- **Provenance** (em cada entidade): `nature` (`official` | `collected` | `ai` | `analysis`), `sourceId`, `mode` (`demo`|`live`) e `record` (`recordId`, `externalId`, `providerId`).

## RAW × normalizado × análise

- O texto original (`TranscriptSegment.text`) **nunca** é alterado.
- Classificações de IA (`SpeechClassification`) ficam em estrutura separada, com `model`, `version`, `promptVersion`, `confidence`, `confidenceLevel`, `classifiedAt`, `humanReviewed`.
- Relevância não vem do modelo: é calculada por critérios objetivos (`domain/relevance.ts`) e os critérios ficam gravados (`relevanceFeatures`).

## Fato × medição × interpretação

Todo `DebateEvent` traz `statements[]`:

| Tipo | Exemplo |
|---|---|
| `fact` | "Helena Duarte dirigiu pergunta sobre economia a Rafael Monteiro às 21:06:39." |
| `measurement` | "Volume de publicações +18% nos 5 minutos seguintes, comparado aos 5 anteriores." |
| `interpretation` | "A variação de volume foi temporalmente associado ao período … Proximidade temporal não indica causalidade." |

`domain/statements.ts` bloqueia linguagem causal (`gerou`, `causou`, `provocou`, `por causa de`…); testes verificam todas as afirmações geradas.

## Dados ausentes

`DataValue<T>` distingue `value` (inclusive 0), `unknown`, `not_available`, `not_collected`, `not_applicable` — com `reason`. A UI mostra "—" com o motivo, nunca 0. Resultados eleitorais sem importação retornam `status: not_collected`.

## Confiança

`high | medium | low | unknown` para localização, classificação, entidade e tópico (`confidenceLevel(score)`: ≥ 0,85 alta; ≥ 0,65 média).
