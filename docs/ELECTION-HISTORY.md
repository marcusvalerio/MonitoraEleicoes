# Histórico eleitoral e identidade

## Ciclos importados (branch dev, dados reais do TSE)

| Ciclo | Candidaturas | Linhas de resultado | Observação |
|---|---|---|---|
| 2026 | 20 064 | — | resultados ainda não publicados (`candidacies_only`) |
| 2022 | 28 461 | 199 744 | `QT_VOTOS_NOMINAIS_VALIDOS` |
| 2018 | 28 164 | 227 928 | |
| 2014 | 25 556 | 168 846 | arquivo **não tem** `QT_VOTOS_NOMINAIS_VALIDOS`; usa `QT_VOTOS_NOMINAIS` (registrado em `import_batch.error` como “nota: …”) |

Resultados são agregados de zona → município e município → UF na importação; linhas com `SQ_CANDIDATO` fora das
candidaturas importadas são rejeitadas e contadas (nunca descartadas em silêncio).

## Identidade entre ciclos — nunca por nome

1. mesmo **título de eleitor** (HMAC) ⇒ mesma pessoa (`method = title_hmac`);
2. senão mesmo **CPF** (HMAC) ⇒ `cpf_hmac`;
3. senão ⇒ `unresolved` (ex.: dados “não divulgáveis”, `-4`). Homônimos com títulos diferentes são pessoas diferentes.
4. Revisão manual (`/admin/inteligencia`) grava `manual` ou `rejected` com justificativa; reimportações não sobrescrevem.

Resultado atual: 102 245 candidaturas, 102 150 resolvidas, 95 não resolvidas, 81 219 pessoas.

## Privacidade

CPF e título **nunca** são armazenados em claro: apenas HMAC-SHA256 com `IDENTITY_HASH_KEY` (variável de ambiente).
Não são expostos em API nem UI. Trocar a chave exige reimportar para recalcular vínculos.

## Onde aparece

`/elections` (resultados, votos por partido e ciclo), `/candidatos/[pessoa]` (trajetória somente por vínculo resolvido/manual),
`/comparar`. Consultas em `src/analytics/elections.ts`; testes em `src/elections/elections.db.test.ts`.
