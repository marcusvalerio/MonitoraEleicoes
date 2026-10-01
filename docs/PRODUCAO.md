# Produção — roteiro (exige confirmação explícita a cada passo)

Estado em 2026-10-01: produção (Vercel, `main@f1986dd`) serve o perfil **demo** (dados fictícios) porque `DATA_MODE`
não está definido e o código antigo usava `demo` como padrão. O código de `feat/p0-mvp` corrige isso (padrão `live`;
sintético recusado em produção). Banco `main` do Neon: migrations 0001–0002.

1. **Snapshot** do branch `main` no Neon (ponto de retorno).
2. **Migrations** 0003–0010: `node scripts/db-migrate.mjs --env production` (exige `DATABASE_URL_PRODUCTION`).
3. **Importação TSE** (produção, `--confirm-production`): candidaturas+resultados 2014/2018/2022, candidaturas 2026,
   `--identity`; pesquisas 2026 (`--kind polls`). Requer `IDENTITY_HASH_KEY` (o mesmo valor guardado com segurança).
4. **Variáveis na Vercel** (Production): `DATABASE_URL` (Neon main), `DATA_MODE=live`, `IDENTITY_HASH_KEY`, `ADMIN_TOKEN`;
   opcionais `X_API_BEARER_TOKEN`, `YOUTUBE_API_KEY`. Nunca `MONITORA_ALLOW_SYNTHETIC`.
5. **Merge** de `feat/p0-mvp` em `main` (PR) → deploy.
6. **Workers** fora da Vercel (processos contínuos), com `MONITORA_ENV=production`:
   - apuração: `node scripts/ingest.mjs --env production --apuracao --confirm-production --interval 60`
   - social (se houver credenciais): `node scripts/ingest.mjs --env production --social`
   - pesquisas (diário): `npm run import:tse -- --env production --year 2026 --kind polls --refresh --confirm-production`
7. **Verificação**: `BASE_URL=<prod> npm run e2e:product`; quadro em `/fontes` (TSE apuração "Operacional").

Orçamento Neon (512 MB): dev ocupa ~182 MB com histórico completo + pesquisas 2022/2026; uma noite de apuração com
o padrão (proporcionais a cada 5 passadas, RAW proporcional nos marcos) estimada em < 100 MB.

## Worker da apuração — análise (2026-10-01, medido no dev contra o TSE real)

| Item | Comportamento |
|---|---|
| Frequência | `--interval 60` (mín. 30 s). Majoritários em toda passada; proporcionais a cada 5 (`--proporcionais-a-cada`). |
| Duração da passada | 82 arquivos majoritários ≈ 15 s; 54 proporcionais ≈ 10 s (`--concorrencia 8`; antes, sequencial: 60 s / 40 s). |
| Consumo | ~1 vCPU compartilhada, < 300 MB RAM; rede ≈ 0,7 MB/passada majoritária, ≈ 6 MB proporcional. Banco: < 100 MB/noite (ver acima). |
| Timeout / retry | 15 s por arquivo; 2 retentativas com backoff (0,5 s, 1 s) para rede/5xx; 404 não é erro. |
| Checkpoint | por arquivo (`ingestion_checkpoint`), cursor = hash do conteúdo apurado; idêntico ⇒ nada gravado. |
| Heartbeat | `heartbeat:apuracao` a cada passada (sucesso, erro, duração, lidos/alterados/erros) → `/fontes` e admin. |
| TSE sem arquivo | 404 ⇒ estado "Dado indisponível"; configuração inacessível ⇒ execução `failed`, nada gravado, próxima passada tenta de novo. |
| Durante a apuração | cada mudança de números ⇒ novo retrato + RAW; UI "Em apuração"; atraso > 15 min ⇒ "Parcial"; `tf = s` ⇒ "Totalizada". |
| Idempotência | retrato único por (ano, turno, cargo, território, hash); reprocessar sem checkpoint não duplica (teste de banco). |
| Reinício | SIGTERM/SIGINT ⇒ termina a passada e sai; ao reiniciar retoma pelos checkpoints. Supervisor deve reiniciar sempre. |

**Recomendação de hospedagem:** um contêiner pequeno sempre ligado, região **São Paulo (gru)**, com reinício automático —
Fly.io (máquina shared-cpu-1x, 512 MB) ou Railway, ~US$ 5/mês, usando `deploy/worker/Dockerfile`. Alternativa sem custo:
uma VM própria com `systemd` (`Restart=always`). **Não usar** GitHub Actions/Vercel Cron como principal (intervalo mínimo e
atraso de agendamento inadequados para noite de apuração). Rodar a partir de 03/10 para observar o estado "Não iniciada"
e confirmar o heartbeat antes das 17h de 04/10.

Variáveis do worker: `DATABASE_URL_PRODUCTION`, `IDENTITY_HASH_KEY`, `MONITORA_ENV=production`
(+ `NODE_USE_ENV_PROXY=1` somente se o ambiente exigir proxy).

## Rede de segurança da aplicação

Sem `DATABASE_URL`, banco inacessível ou schema < 0009, o perfil real lê **somente arquivos reais** (`data/real`) e as
páginas eleitorais mostram "Fonte indisponível" — testado: todas as rotas 200, nenhum dado fictício.
