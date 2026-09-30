# Camada geográfica

- `src/geo/types.ts` — `GeoRegion`, `GeoBoundary(Set)`, `GeoMetric`, `GeoAggregate`, `GeoResponse`.
- `src/geo/reference.ts` — hierarquia Brasil → Região → UF → Município (nomes oficiais).
- `src/geo/aggregate.ts` — agregação pura; todo nível é soma do nível mais fino (consistência no drill-down).
- `src/analytics/coverage.ts` — `GeoCoverage`: `totalRecords`, `geolocatedRecords`, `coveragePercentage` (`null` sem dados), `period`, `providers`, `platforms`, distribuição por precisão e confiança.
- `GeoProvider` (geometria) é separado das métricas (que vêm do `SocialProvider` via `fetchRegionalCounts`).

## APIs

- `/api/geo?debate&parent&level&from&to&topic` → **métricas + metadados** (linhas agregadas, cobertura, breadcrumb). Sem geometria.
- `/api/geo/boundaries?level=` → **somente geometria**, cacheável por 24 h.

## Localização de publicações

`GeoMetric.location = { precision, source, confidence }`:

- `precision`: `country` | `state` | `municipality` | `unknown`
- `source`: `geotag` | `profile` | `text_mention` | `platform_region` | `none`
- `confidence`: `high` | `medium` | `low` | `unknown`

Localização inferida nunca é apresentada como exata. Município fora da referência é agregado em "Demais municípios" da UF, mantendo a precisão declarada.

## Métricas do mapa

| Camada | Métrica | Definição |
|---|---|---|
| Volume | `volume` | publicações geolocalizadas no recorte |
| Tema | `topicVolume` | publicações classificadas no tema |
| Partido | `partyMentions` + `share` | partido com maior participação nas menções (via candidato); intensidade = participação |
| Candidato | `candidateMentions` + `share` | candidato mais mencionado; intensidade = participação |
| Tendência | `trend` | (últimos 15 min − 15 min anteriores) / anteriores; `unknown` se base < 20 |

Nenhuma camada representa intenção de voto, preferência, força eleitoral ou previsão.

## Limitações

- Redes sociais não chegam a zona/local/seção — esses níveis existem apenas nos dados oficiais do TSE.
- Geometria municipal ainda não carregada (municípios exibidos em grade).
- Contornos: `@svg-maps/brazil` (CC BY 4.0), simplificados — não é base cartográfica oficial.
