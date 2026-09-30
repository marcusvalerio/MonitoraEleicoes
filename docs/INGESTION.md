# Ingestão

```
requisição (API/CLI) ─► ingestion_job (fila)
                              │
worker ─► poll providers ─► RawRecord ─► normalização ─► domínio ─► análise ─► persistência (PostgreSQL)
            (checkpoints)       │               │                      │
                             raw_record    ingestion_error         analysis (versionada)
```

## Componentes

| Peça | Arquivo | Papel |
|---|---|---|
| Pipeline | `src/ingestion/pipeline.ts` | provider → RAW → normalização → store → IA; retry/backoff; falha parcial; registra **todo** RAW (com hash) e **toda** rejeição |
| Gravador | `src/persistence/writer.ts` | store → PostgreSQL, idempotente |
| Worker | `src/ingestion/worker.ts` | estado incremental (checkpoints + análises existentes), execução, fila |
| CLI | `scripts/ingest.mjs` (`npm run ingest`) | executa, enfileira, drena fila ou faz polling |
| API | `POST /api/ingest` | **só enfileira** (Bearer `INGEST_TOKEN`); nunca executa ingestão no ciclo HTTP |

## Idempotência

| Nível | Chave | Efeito ao repetir |
|---|---|---|
| Item de origem | `source_record (provider_id, external_id)` | atualiza metadados de coleta |
| Conteúdo | `raw_record (source_record_id, hash)` | igual ⇒ nada (conta `unchanged`); diferente ⇒ nova versão |
| Domínio | ids determinísticos | upsert; texto só muda se a origem mudar |
| Análise | `(segment_id, model, model_version, prompt_version, relevance_method_version)` | igual ⇒ ignorada; nova versão ⇒ nova linha |

Reexecutar a mesma ingestão **não duplica nada** (coberto por `npm run test:db`).

## Incremental

- Providers paginados expõem `resumeCursor`; o pipeline guarda o cursor de cada fluxo (`providerId|stream`) e o worker salva em `ingestion_checkpoint`.
- Na próxima execução, cada fluxo retoma do cursor: só itens novos são buscados; segmentos já analisados pelo mesmo modelo/versão não são reclassificados.
- `--full` ignora os checkpoints (busca tudo); usado para **reanálise** após nova versão do classificador — as análises antigas permanecem.

## Execuções e erros

- Uma `ingestion_run` por etapa de provider (`election:parties`, `transcript:segments:<debate>`, `ai:classification`…) com `received/normalized/rejected/unchanged/error` e status `completed|partial|failed`.
- Toda rejeição de normalização vira `ingestion_error` ligada ao `raw_record` (o payload rejeitado fica preservado). Falha de provider vira run `failed` + erro sem raw; as demais etapas seguem (dados parciais).

## Uso

```bash
npm run ingest -- --env development                 # executa agora (perfil live, dataset validation-rj-2026-09-29)
npm run ingest -- --env development --full          # reanálise completa
npm run ingest -- --env development --watch 30      # polling a cada 30 s (ao vivo)
npm run ingest -- --env development --enqueue       # só enfileira
npm run ingest -- --env development --drain         # worker: consome a fila (SKIP LOCKED — vários workers seguros)
curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://…/api/ingest   # enfileira via API
```

Opções: `--profile demo|fixture|live`, `--dataset <id>`, `--kind demo|fixture|validation|production`.

## Logs

JSON por linha (`src/infrastructure/log.ts`) com `request_id`, `ingestion_run_id`, `provider`, contagens e duração. Nunca registram payloads, textos de usuários ou segredos. `MONITORA_LOG=silent` desliga.
