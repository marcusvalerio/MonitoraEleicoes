# Dados ao vivo — prontidão

## O que já funciona

- **Fluxo contínuo**: `npm run ingest -- --env production --watch 30` faz polling dos providers, grava só o que é novo (checkpoints + dedup por hash) e analisa só segmentos novos.
- **Leitura ao vivo**: o repositório PostgreSQL recarrega o recorte a cada `MONITORA_PG_TTL_MS` (padrão 10 s); a tela ao vivo continua consumindo `/api/debates/[id]/feed` em janelas incrementais.
- **Timestamps ausentes**: segmentos sem tempo são gravados com offsets `NULL` e `timestamp_precision` (`block`, `sequence`, `unknown`) — nada é inventado; análises temporais só usam segmentos com tempo.
- **Oradores**: `speaker` separa rótulo da fonte e candidato resolvido (`resolution_source`, `resolution_confidence`); não resolvido = `kind unknown`, nunca atribuído a um candidato.
- **Falhas**: retry com backoff por provider; falha de um provider não derruba os demais; tudo fica em `ingestion_run`/`ingestion_error` e aparece em `/sources`.
- **Separação requisição × execução**: `POST /api/ingest` e `--enqueue` só criam `ingestion_job`; o worker (`--drain`) executa.

## Bloqueadores para um debate ao vivo real

1. **Fonte de texto com tempo em tempo real** (legenda da emissora ou ASR sobre o áudio). Hoje só há importação de arquivo.
2. **Diarização** automática de orador.
3. **Classificador de produção** (LLM com saída estruturada validada; contrato pronto em `ai/classifier.ts`). O classificador por regras é baseline auditável, não é adequado para produção (ver `docs/VALIDATION-RJ-2026-09-29.md`).
4. **Provider social real** (X/YouTube/…) com credenciais e termos de uso aceitos.
5. **Worker hospedado** (cron/fila gerenciada) — hoje é um processo CLI.

## Checklist de operação no dia do debate

1. `npm run db:status -- production` (migrations em dia) e branch de backup criado.
2. Provider do debate configurado em `providers/registry.ts` (perfil `live`) + fontes em `providers/files/sources.ts`.
3. Worker: `npm run ingest -- --env production --watch 15`.
4. App com `DATA_MODE=live` e `DATABASE_URL` de produção.
5. Acompanhar `/sources` (execuções, rejeições) e os logs JSON (`ingestion_run.finished`).
