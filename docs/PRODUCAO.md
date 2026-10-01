# Produção — roteiro (exige confirmação explícita a cada passo)

Estado em 2026-10-01: produção (Vercel, `main@f1986dd`) serve o perfil **demo** (dados fictícios) porque `DATA_MODE`
não está definido e o código antigo usava `demo` como padrão. O código de `feat/p0-mvp` corrige isso (padrão `live`;
sintético recusado em produção). Banco `main` do Neon: migrations 0001–0002.

1. **Snapshot** do branch `main` no Neon (ponto de retorno).
2. **Migrations** 0003–0009: `node scripts/db-migrate.mjs --env production` (exige `DATABASE_URL_PRODUCTION`).
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
