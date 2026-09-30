# Dados ao vivo — ingestão contínua (Fase 0.8)

## O que já funciona

- **Fluxo contínuo**: `npm run ingest -- --env production --watch 30` faz polling dos providers, grava só o que é novo (checkpoints + dedup por hash) e analisa só segmentos novos.
- **Leitura ao vivo**: o repositório PostgreSQL recarrega o recorte a cada `MONITORA_PG_TTL_MS` (padrão 10 s); a tela ao vivo continua consumindo `/api/debates/[id]/feed` em janelas incrementais.
- **Timestamps ausentes**: segmentos sem tempo são gravados com offsets `NULL` e `timestamp_precision` (`block`, `sequence`, `unknown`) — nada é inventado; análises temporais só usam segmentos com tempo.
- **Oradores**: `speaker` separa rótulo da fonte e candidato resolvido (`resolution_source`, `resolution_confidence`); não resolvido = `kind unknown`, nunca atribuído a um candidato.
- **Falhas**: retry com backoff por provider; falha de um provider não derruba os demais; tudo fica em `ingestion_run`/`ingestion_error` e aparece em `/sources`.
- **Separação requisição × execução**: `POST /api/ingest` e `--enqueue` só criam `ingestion_job`; o worker (`--drain`) executa.

## Fluxo (sem caminho especial)

```
/admin/debates (ou npm run debate)          debate_control: scheduled → preparing → connecting
        │
worker  npm run ingest -- --env <env> --live   (a cada --interval s, para cada debate em connecting/live)
        │   LiveTranscriptProvider.fetchSegments(cursor)  ← só o que a fonte liberou desde o checkpoint
        ▼
RAW (live.segment/v1) → normalização → análise (regras | LLM validado) → Neon
        │                                                            (RAW gravado por último; checkpoint depois do RAW)
        ▼
Repository.getLiveState(debate, afterSeq)  ← SQL incremental (debate_id, seq), sem recarregar o debate
        ▼
/ao-vivo/[id]  (polling de 2 s em /api/debates/[id]/live?after=<seq>)
```

## Contrato `LiveTranscriptProvider`

Estende `TranscriptProvider` (mesmo cursor/paginação) e declara `live: true`, `timed`, `speakerIdentification` e `sourceMode: "live" | "replay"`. Todo provider ao vivo emite o esquema genérico `live.segment/v1` (`normalization/schemas/live.ts`): `event_id`, `seq`, `speaker {label, name, confidence, source}`, `text`, `start/end_offset_s` (nuláveis), `timing_precision`, `source_mode`, `source_time`, `asr_confidence`, `replay_of`. `externalId` + `collectedAt` do RawRecord completam o contrato. Nada de fonte específica entra no domínio: legendas oficiais, STT externo/streaming ou fixture são só novos providers + um `provider_id` em `buildControlProviders` (registry).

## Fonte usada nesta fase: REPLAY (não é ao vivo)

Não havia fonte real contínua disponível e autorizada: a transmissão da TV Globo é streaming protegido, sem legenda pública nem API; baixar ou contornar a proteção está fora de questão. Foi implementado o `ReplayLiveTranscriptProvider`:

- reproduz uma transcrição **já importada e autorizada** (dataset `validation-rj-2026-09-29`) como fluxo incremental, pelo mesmo pipeline;
- cria um debate **próprio** (id do controle) e um dataset `replay-<origem>` — o dataset de validação nunca é alterado;
- horários **sintéticos** (`timestamp_precision = synthetic`, `source_mode = replay`): duração = palavras ÷ 2,5 palavras/s + 1 s, comprimida pela velocidade (1×, 2×, 5×, 10×); a origem do segmento fica em `replay_of`;
- relógio do replay = `debate_control.started_at` (no banco): reiniciar o worker não muda nada; pausar/retomar desloca o relógio pelo tempo pausado;
- UI: selo **REPLAY n×**, nota explícita e "horário sintético" em cada fala; nunca "AO VIVO" (inclusive no topo e na lista de debates).

## Latência

Instantes gravados: `source_time` (fonte), `collected_at` (provider), `ingested_at` (banco), `analysis.processed_at` (análise). Medianas dos últimos 20 segmentos (`domain/live.ts`): captura, ingestão, análise, processamento (coleta → análise) e ponta a ponta. Captura e ponta a ponta só existem para fonte realmente ao vivo com horário; no replay são "—". Ausência = "—", nunca 0.

Observado (replay 10×, polling 1 s, Neon sa-east-1 via HTTP): processamento **≈ 1,6–3,6 s** (mediana típica ≈ 2,3 s); ciclo ocioso do worker ≈ 0,6 s; ciclo com segmento novo ≈ 1,2–2,4 s.

## Resiliência

| Situação | Comportamento | Teste |
|---|---|---|
| Worker reiniciado | checkpoints + hashes no banco; retoma sem duplicar | `live.db.test.ts` (100 de 120 falas → kill → restart), E2E `e2e:live` (SIGINT real) |
| Queda no meio da gravação | RAW é o último passo; sem RAW a próxima execução reprocessa (upserts idempotentes) | `live.db.test.ts` |
| Banco indisponível | RAW recebidos vão para `.monitora/spool/*.jsonl` (gitignored), erro em log; checkpoint não avança; spool removido só quando tudo está no banco | `live.db.test.ts` |
| Provider indisponível | retry com backoff exponencial (pipeline) + backoff por debate no worker; execução `failed` + `ingestion_error`; `last_error` no controle; após 5 falhas → `error` | `live.db.test.ts`, E2E |
| Segmento inválido | `ingestion_error` ligado ao RAW; demais segmentos seguem | `live.db.test.ts` |
| Análise inválida (LLM) | rejeitada por esquema/domínio → `ingestion_error`; nada é gravado como análise | `llm.test.ts` |
| Encerramento | SIGINT/SIGTERM: termina após o ciclo atual (nunca no meio de uma gravação) | E2E |

## Orador

`identified` (confiança alta) · `uncertain` (média/baixa, ex.: atribuição da imprensa) · `unknown` ("Orador não identificado"). Vem só do que a fonte declara (`speaker.source`: provider_label, manual_map, press_attribution, diarization futura). Nunca adivinhado.

## Bloqueadores para o primeiro debate presidencial real

1. **Fonte contínua autorizada com texto** — legenda/closed caption oficial em tempo real da emissora ou acordo de acesso ao áudio para STT. É o próximo bloqueador: sem isso só há replay.
2. **STT/diarização** (se a fonte for áudio): provider `LiveTranscriptProvider` com `speaker.source = diarization`.
3. **Cliente LLM** configurado (contrato pronto em `ai/llm.ts`; chave só no servidor) e revisão humana amostral.
4. **Worker hospedado** (processo contínuo ou fila gerenciada) com alertas sobre `last_error` / conexão "sem sinal".
5. Migrations 0003/0004 em **produção** (aguardam confirmação explícita).

## Operação no dia do debate

1. `npm run db:status -- production`; branch de backup no Neon.
2. Cadastrar em `/admin/debates` (ou `npm run debate -- --env production …`) e mover para `preparing` → `connecting`.
3. Worker: `npm run ingest -- --env production --live --interval 1`.
4. App com `DATA_MODE=live`, `DATABASE_URL`, `ADMIN_TOKEN`; acompanhar `/ao-vivo/<id>` e `/sources`.
