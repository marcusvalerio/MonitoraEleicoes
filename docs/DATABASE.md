# Banco de dados (PostgreSQL · Neon)

## Decisões

- **PostgreSQL 17 no Neon**, driver `@neondatabase/serverless` (HTTP/fetch): funciona em Node, Edge e serverless, sem pool TCP (e atravessa redes que só liberam HTTPS).
- **Sem ORM**: SQL explícito em `src/persistence/writer.ts` (gravação) e `src/repository/postgres.ts` (leitura), com mapeadores tipados para o domínio. Escritas em lote via `jsonb_to_recordset` (1 ida ao banco a cada 500 linhas).
- **Conexão só por variável de ambiente** (`DATABASE_URL`). Nenhuma credencial no código ou no Git (`.env*.local` está no `.gitignore`).

## Ambientes (branches Neon)

| Ambiente | Branch Neon | Variável | Uso |
|---|---|---|---|
| production | `main` | `DATABASE_URL_PRODUCTION` (no servidor de produção: `DATABASE_URL`) | app em produção |
| development | `dev` | `DATABASE_URL` | `npm run dev`, E2E REAL+POSTGRES |
| test | `test` | `DATABASE_URL_TEST` | `npm run test:db` (trunca tabelas) |

Cada banco tem um **marcador de ambiente** (`monitora_env`), gravado na primeira migration:

- o runner de migrations aborta (código 3) se a URL apontar para um banco de outro ambiente;
- `assertTestDatabase` impede que testes destrutivos rodem fora de um banco `test`;
- o gravador recusa datasets `demo`/`fixture` em um banco `production` (DEMO nunca contamina produção).

## Modelo

```
dataset ─┬─ source ─── source_record (provider_id + external_id, único) ─── raw_record (versão por hash; payload jsonb imutável)
         │                    │                                                   │
         │              ingestion_run ──── ingestion_error (toda rejeição)   ingestion_checkpoint (cursor por fluxo)
         ├─ party ─ party_visual_identity           entity_identifier (provider/TSE → entidade)
         ├─ candidate
         ├─ debate ─┬─ debate_block, debate_participant
         │          ├─ speaker (orador ≠ candidato: kind, candidate_id?, resolution_source, resolution_confidence)
         │          └─ transcript_segment (offsets e horários NULLABLE + timestamp_precision)
         │                     └─ analysis (versionada: method, model, model_version, prompt_version,
         │                                  relevance_method, relevance_method_version) ─ segment_topic
         ├─ social_post ─ social_mention      social_metric (buckets)
         ├─ geo_entity (geometria/hierarquia) ≠ geo_observation (observações, com precisão/fonte/confiança)
         ├─ media_asset, data_quality_report
         └─ electoral_result (cada medida: valor + *_status value_status; CHECK valor NULL ⇔ status ≠ 'value')
ingestion_job (fila: requisição ≠ execução)
debate_control ─ debate_control_event (cadastro e ciclo de vida por dados; batimento/erro do worker)
```

- `value_status`: `value | unknown | not_collected | not_available | not_applicable`. Ausência nunca é 0.
- `analysis` é única por (segmento, modelo, versão do modelo, versão do prompt, versão da metodologia de relevância): reanálises **acrescentam** linhas; a leitura usa a mais recente (`distinct on … order by created_at desc`).
- `transcript_segment.text` é RAW: só é atualizado se a origem mudar (o que também gera nova versão em `raw_record`).

Migrations: `0001_init`, `0002_ingestion_job`, `0003_live_ingestion` (precisão `synthetic`, `source_mode`, `source_time`, `collected_at`, `ingested_at`, `asr_confidence`, `analysis.processed_at`, `debate_control`), `0004_worker_heartbeat`, `0005_editorial_sources` (`debate_source`, `editorial_event`, `editorial_analysis`, sequência `editorial_change_seq`).

Índices (padrões reais de acesso): `transcript_segment(debate_id, start_offset_s)`, `(debate_id, seq)`, `(speaker_id)`; `analysis(segment_id, created_at desc)`; `social_post(platform, published_at)`; `ingestion_run(provider_id, started_at desc)`; `entity_identifier(entity_type, entity_id)`; `data_quality_report(debate_id, created_at desc)`; `source_record(source_id)`; `ingestion_job(status, requested_at)`; `transcript_segment(debate_id, ingested_at)`; `debate_control(status, scheduled_start)`. A tela ao vivo usa `(debate_id, seq)` para buscar só segmentos novos.

## Setup (DATABASE_SETUP)

1. **Projeto Neon**: crie um projeto (região `aws-sa-east-1`), banco `monitora`. O branch `main` é produção. Crie os branches `dev` e `test` a partir de `main`.
2. **Variáveis** em `.env.local` (nunca commitar; veja `.env.example`):
   ```
   DATABASE_URL=postgresql://…dev…?sslmode=require
   DATABASE_URL_TEST=postgresql://…test…?sslmode=require
   DATABASE_URL_PRODUCTION=postgresql://…main…?sslmode=require   # só na máquina que opera produção
   ```
   Em hospedagem (Vercel etc.), defina `DATABASE_URL` do ambiente e `DATA_MODE=live`.
3. **Migrations** (`db/migrations/NNNN_nome.sql`, cada arquivo numa transação, checksum verificado):
   ```
   npm run db:migrate            # development
   npm run db:migrate:test       # test
   npm run db:migrate:prod       # production (exige --confirm-production, já incluso no script)
   npm run db:status -- development
   ```
   Migration aplicada **não pode ser editada** (código 4): crie uma nova. Produção só muda por migration.
4. **Seed** (dataset de validação RJ, `dataset.kind = validation`):
   ```
   npm run ingest -- --env development
   npm run ingest -- --env production
   ```
5. **Rodar**: `DATA_MODE=live npm run dev` — o repositório passa a ler do PostgreSQL.
6. **Testes de persistência**: `npm run test:db` (usa `DATABASE_URL_TEST`; recusa bancos não marcados `test`; é pulado se a variável não existir).

## Local × produção

- `demo` e `fixture` **não usam banco** (ingestão em memória) — não há como gravarem em produção pelo app.
- `live` lê do banco definido em `DATABASE_URL`. A escrita é feita apenas pelo worker (`npm run ingest`), nunca por requisição de página.

## Rollback

- **Schema**: migrations são forward-only. Para desfazer, escreva uma migration compensatória (`000N_revert_x.sql`).
- **Dados**: use o *restore* por ponto no tempo do Neon (branch `main` → Restore → timestamp anterior) ou crie um branch a partir de um instante anterior e troque a URL. Antes de migrations em produção, crie um branch de backup (`main` → New branch "backup-AAAAMMDD").
- **Dataset errado**: todas as linhas carregam `dataset_id`; remova por dataset numa migration/script revisado (nunca à mão em produção).

## Backup / restore

- Neon mantém histórico (PITR) conforme o plano; branches são cópias instantâneas (copy-on-write) — o jeito mais barato de "fotografar" antes de uma operação.
- Backup lógico: `pg_dump "$DATABASE_URL_PRODUCTION" -Fc -f monitora.dump` (exige acesso TCP 5432); restore em um branch novo: `pg_restore -d "$URL_DO_BRANCH" monitora.dump`.

## Troubleshooting

| Sintoma | Causa / solução |
|---|---|
| `DATABASE_URL não definida` | Falta `.env.local` ou variável no ambiente de hospedagem. |
| `ABORTADO: o banco está marcado como 'test', não 'production'` | URL trocada. Confira a variável; o marcador protege exatamente esse erro. |
| `foi alterada após aplicada` | Uma migration aplicada foi editada. Reverta a edição e crie uma nova migration. |
| `banco sem marcador de ambiente` | Rode as migrations nesse banco antes de ingerir. |
| `recusado: dataset 'demo' não pode ir para produção` | Proteção intencional. Use `--env development`. |
| `psql` com timeout | Rede sem TCP 5432; o app usa HTTPS (driver Neon), não depende de TCP. |
| Página live sem dados | Banco vazio: rode `npm run ingest -- --env <env>`. O repositório recarrega a cada `MONITORA_PG_TTL_MS` (padrão 10 s). |
