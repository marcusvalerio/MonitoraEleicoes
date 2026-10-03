# Autenticação, RBAC, RLS e Avaliação

## Arquitetura
- **Provedor:** Better Auth 1.7 (open source; é o motor do Neon Auth, que segue em beta) sobre o PostgreSQL do Monitora.
  - Tabelas `auth_user`, `auth_session`, `auth_account` e `auth_verification`.
  - A senha existe **somente como hash** em `auth_account`. A aplicação não guarda senha.
- **Sessão:**
  - cookie `monitora.session_token`: httpOnly, SameSite=Lax, Secure em produção;
  - duração de 7 dias, renovada a cada 24 h;
  - nada vai para `localStorage`.
- **Cadastro público desativado.** Só o ADMIN cria contas, com senha temporária aleatória exibida uma vez e troca obrigatória no 1º acesso.
- **Limite de tentativas** do provedor em produção, por exemplo 3 logins a cada 10 s.

### Recuperação de senha
- Link válido por 1 h; as sessões são revogadas na redefinição.
- O e-mail é enviado via Resend (`RESEND_API_KEY` + `AUTH_EMAIL_FROM`).
- Sem provedor de e-mail, a produção recusa a recuperação, de forma explícita. Em dev/teste, o link vai para o log do servidor.

### Conexão com o banco
- Pool WebSocket do Neon (`src/persistence/pool.ts`), porta 443.
- No contêiner de desenvolvimento, a conexão passa pelo proxy HTTPS.

## RBAC
| Papel | Escopo | Pode |
|---|---|---|
| ADMIN | plataforma (`auth_user.role = 'admin'`) | `/admin`: criar/arquivar campanhas, criar/bloquear contas, vincular e alterar papéis. **Lê** todas as campanhas (não escreve investimentos) |
| owner | campanha | ler e escrever os dados da campanha |
| editor | campanha | ler e escrever os dados da campanha |
| viewer | campanha | somente leitura |

Helpers centrais em `src/auth/dal.ts`: `getAuthenticatedUser`, `requireAuth`, `requireAdmin` (→ 403), `requireCampaignAccess` e `requireRole`.

As mutações são *server actions*, que têm verificação de origem (CSRF) do Next.

## RLS (o banco decide)
- Toda consulta a dado de campanha roda em transação com:
  - `SET LOCAL ROLE monitora_app`, um papel sem privilégios;
  - `monitora.session_token` = token do cookie.
- A identidade é verificada **pelo banco**: `monitora_uid()` valida o token em `auth_session` (não expirado, conta não bloqueada).
- A API não consegue escolher o usuário nem a campanha: trocar `campaign_id` ou forjar `created_by` é recusado pelas políticas.
- Campanha arquivada: os membros perdem o acesso; o ADMIN continua lendo.
- O dono das tabelas (migrations) não usa FORCE RLS, porque as funções `security definer` precisam ler os vínculos. A aplicação **nunca** acessa dados de campanha fora de `withScope`.

## Avaliação (`/avaliacao`)
- **Investimento = uma regra:** valor por ocorrência + frequência (único, diário, semanal, quinzenal ou mensal) + período + território.
- **Ocorrências derivadas, não persistidas** (`src/evaluation/model.ts`):
  - geradas só dentro do período;
  - mensal usa o mesmo dia do mês, ajustado ao último dia.
- **Território:** a tabela `territory` existente (Brasil / UF / município).
  - Zona e seção não existem no modelo de resultados.
  - Incluí-las exige estender o importador oficial; ficou para uma etapa futura.
- **Resultado observado:**
  - somente leitura de `result_candidacy` (o pipeline TSE não foi alterado);
  - percentual = votos ÷ votos nominais do cargo no mesmo escopo;
  - estados explícitos: não vinculado, ainda não disponível, sem correspondência, fonte indisponível;
  - candidatura de dataset de teste (fixture) é marcada **DEMONSTRAÇÃO**.
- **Comparações descritivas**, sem causalidade:
  - base = outra candidatura oficial da mesma pessoa, com variação em p.p. só com ambas as participações;
  - períodos de investimento A vs B.
- **"Valor registrado por voto observado":** investimento em territórios com resultado ÷ votos, sem dupla contagem.

## Variáveis de ambiente
- `BETTER_AUTH_SECRET` (obrigatório, uma por ambiente)
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS` (ex.: URL de preview)
- `ADMIN_EMAIL` e `ADMIN_INITIAL_PASSWORD` (só para o bootstrap)
- `RESEND_API_KEY` e `AUTH_EMAIL_FROM`

## ADMIN_TOKEN (legado)
- Continua **apenas** nas APIs internas `/api/admin/debates` e `/api/admin/intelligence`, para scripts.
- As páginas `/admin/*` agora exigem sessão de ADMIN.
- Remoção futura: migrar essas duas APIs para `requireAdmin()` e apagar `src/control/access.ts#checkAdmin`.

## Ativar em produção (exige autorização explícita)
1. Snapshot do branch `main` (Neon).
2. `node scripts/db-migrate.mjs --env production` (migrations 0003–0011).
3. Na Vercel (Production):
   - `BETTER_AUTH_SECRET` novo;
   - `BETTER_AUTH_URL`;
   - `RESEND_API_KEY` e `AUTH_EMAIL_FROM`.
4. `ADMIN_EMAIL=… ADMIN_INITIAL_PASSWORD=… node scripts/auth-bootstrap.mjs --env production --confirm-production`.
5. Deploy; login do ADMIN → troca de senha → criar campanha → owner.

## Testes
- `npm run test` — unidade: recorrência, agregações, divisão por zero, variação, p.p., moeda, território.
- `npm run test:db` — `src/auth/rls.db.test.ts`:
  - login válido e inválido;
  - bootstrap;
  - isolamento A/B/ADMIN;
  - `campaign_id` trocado, autoria forjada;
  - viewer, ADMIN só leitura;
  - autopromoção;
  - campanha arquivada;
  - token inválido, logout, conta bloqueada.
- `npm run e2e:avaliacao` — fluxo completo no banco de teste, com servidor `DATABASE_URL=$DATABASE_URL_TEST`, `BETTER_AUTH_URL` e `BASE_URL`.
