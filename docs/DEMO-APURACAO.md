# Demonstração controlada da apuração ao vivo (2026-10-01, 16:56–17:10 BRT)

**Somente ambiente de teste** (banco `test`, servidor local). Produção não foi tocada. Nenhum número inventado: o replay
reconstrói a apuração presidencial de **2022 (1º turno)** com totais **oficiais** do TSE — votos por candidatura/UF
(`votacao_candidato_munzona_2022`) e eleitorado/seções/comparecimento/brancos/nulos (`detalhe_votacao_munzona_2022`).
Conferência: votos nominais = votos válidos = 118.229.719; final Lula 57.259.504 (48,43%), Bolsonaro 51.072.345 (43,20%).

Limitação honesta: o TSE não serve mais os arquivos parciais de 2022, então cada UF passa de "não iniciada" ao seu total
final oficial; o BR é a soma oficial das UFs liberadas. A ordem/horário de chegada é da demonstração (eleitorado crescente).
Todo arquivo e a página carregam a marca **DEMONSTRAÇÃO**.

## Como reproduzir
```
node scripts/demo/build-replay-2022.mjs                          # lê dev + .monitora/tse (oficial)
node scripts/demo/tse-replay-server.mjs --port 4600 --step-seconds 40 --per-step 3
MONITORA_ALLOW_SYNTHETIC=1 DATABASE_URL=$DATABASE_URL_TEST npx next start -p 3010
MONITORA_ALLOW_SYNTHETIC=1 MONITORA_TSE_BASE=http://127.0.0.1:4600/oficial \
  node scripts/ingest.mjs --env test --apuracao --year 2022 --offices 1 --interval 30 --kind fixture
node scripts/demo/measure.mjs --minutes 10                       # .monitora/demo/timeline.jsonl
```
`MONITORA_TSE_BASE` só é aceito com dados sintéticos permitidos, em loopback e nunca em produção (testado).

## Resultados
| Item | Medido |
|---|---|
| 1ª atualização no banco | 19:56:33 UTC (7 s após iniciar; estado "Não iniciada", 0,00%, eleitorado 156.454.011) |
| Intervalo entre passadas | 30 s (configurado) + 5–6 s de passada (28 arquivos) |
| TSE (servido) → banco | ≤ 1 passada (≤ ~36 s); página server-side lê o banco na hora (0 s na amostragem de 5 s) |
| Banco → navegador aberto | ≤ 15 s (LiveRefresh) |
| Progressão | 0% → 1,11 → 4,08 → 8,30 → 19,26 → 29,68 → 42,97 → 61,14 → 99,56 → 100% ("Totalizada") |
| Arquivos por passada | 28 (BR + 27 UFs); 274 retratos e 3.014 linhas de candidatura na rodada 1 |
| Erros | 0 em todas as passadas |
| "0 votos" na página | nunca; antes dos dados: "Não coletado" |
| Banner DEMONSTRAÇÃO | 79/79 amostras com dados |
| Heartbeat | atualizado a cada passada (sucesso, duração 5–6 s, lidos/alterados/rejeitados) |
| Checkpoints | 28 (um por arquivo) |

### Rodada 2 — idempotência e reinício
| Passada | Situação | Novos | Sem alteração | 404 |
|---|---|---|---|---|
| 1 | não iniciada | 28 | 0 | 0 |
| 2 | 9 UFs; RR ainda 404 | 9 | 18 | 1 (não vira zero) |
| 3 | +9 UFs; RR publicada | 11 | 17 | 0 |
| — | worker morto (SIGTERM) e reiniciado 40 s depois | | | |
| 4 | +9 UFs | 10 (nada duplicado) | 18 | 0 |
| 5 | etapa sem mudança | 0 | 28 | 0 |
| 6 | encerramento (BR totalizado) | 1 | 27 | 0 |
| 7 | mesmo conteúdo | 0 | 28 | 0 |

Falhas injetadas: **timeout** (20 s > 15 s) → retentativa ok, passada 20 s, 0 erros; **HTTP 503** → retentativa ok, 0 erros;
**404** → `não publicado`. Falha persistente coberta em teste de banco (estado "Parcial", último retrato preservado).

### Problema encontrado e corrigido
O servidor de replay gerava `dt/ht` (horário de totalização) a cada requisição ⇒ conteúdo "mudava" e o worker gravava
retratos repetidos. Era defeito do **servidor de demonstração** (o TSE publica `dt` fixo); corrigido. O worker agiu corretamente
(o horário de totalização faz parte do conteúdo oficial).

## Conclusão
APURAÇÃO AO VIVO: **OK** — ingestão OK · persistência OK · atualização OK · frontend OK · checkpoint OK · heartbeat OK ·
recuperação após erro OK.
