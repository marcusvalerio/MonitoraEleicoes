-- 0011 — Autenticação real (Better Auth), campanhas, RBAC e área "Avaliação" (investimentos registrados).
-- Identidade: tabelas auth_* do provedor (senha só como hash em auth_account). A aplicação guarda apenas o vínculo
-- usuário ↔ campanha. Dados eleitorais oficiais continuam GLOBAIS; somente dados privados de campanha têm RLS.
-- RLS: as consultas de campanha rodam com SET LOCAL ROLE monitora_app (sem privilégios de dono) e com o token da
-- sessão em monitora.session_token; o PRÓPRIO BANCO valida a sessão (monitora_uid) — a API não consegue "escolher" usuário.

create table if not exists "auth_user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "role" text, "banned" boolean, "banReason" text, "banExpires" timestamptz, "mustChangePassword" boolean not null default false);
create table if not exists "auth_session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth_user" ("id") on delete cascade, "impersonatedBy" text);
create table if not exists "auth_account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth_user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
create table if not exists "auth_verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create index if not exists "auth_session_userId_idx" on "auth_session" ("userId");
create index if not exists "auth_account_userId_idx" on "auth_account" ("userId");
create index if not exists "auth_verification_identifier_idx" on "auth_verification" ("identifier");

-- Campanhas (criadas somente pelo ADMIN). Vínculo opcional à candidatura OFICIAL (TSE) para o cruzamento.
create table if not exists campaign (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  candidacy_id integer references candidacy(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_member (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign(id) on delete cascade,
  user_id text not null references "auth_user" ("id") on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);
create index if not exists campaign_member_user_idx on campaign_member (user_id);

-- Investimento registrado = UMA regra (recorrente ou única). Ocorrências são DERIVADAS da regra (não persistidas).
create table if not exists campaign_investment (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  category text not null check (length(trim(category)) between 2 and 60),
  amount_cents bigint not null check (amount_cents > 0),
  frequency text not null check (frequency in ('once', 'daily', 'weekly', 'biweekly', 'monthly')),
  start_date date not null,
  end_date date not null,
  territory_id integer not null references territory(id),
  notes text check (notes is null or length(notes) <= 2000),
  created_by text references "auth_user" ("id") on delete set null,
  updated_by text references "auth_user" ("id") on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists campaign_investment_campaign_idx on campaign_investment (campaign_id, start_date);

create or replace function monitora_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists campaign_touch on campaign;
create trigger campaign_touch before update on campaign for each row execute function monitora_touch();
drop trigger if exists campaign_member_touch on campaign_member;
create trigger campaign_member_touch before update on campaign_member for each row execute function monitora_touch();
drop trigger if exists campaign_investment_touch on campaign_investment;
create trigger campaign_investment_touch before update on campaign_investment for each row execute function monitora_touch();

-- Papel sem privilégios usado nas consultas de campanha (não faz login; o dono da conexão assume via SET LOCAL ROLE).
do $$ begin if not exists (select 1 from pg_roles where rolname = 'monitora_app') then create role monitora_app nologin; end if; end $$;
grant monitora_app to current_user;
grant usage on schema public to monitora_app;
grant select, insert, update, delete on campaign, campaign_member, campaign_investment to monitora_app;
grant select on territory to monitora_app;

-- Identidade verificada PELO BANCO: sessão válida (token do cookie), não expirada, usuário não bloqueado.
create or replace function monitora_uid() returns text language sql stable security definer set search_path = public as $$ select s."userId" from "auth_session" s join "auth_user" u on u.id = s."userId" where s.token = nullif(current_setting('monitora.session_token', true), '') and s."expiresAt" > now() and coalesce(u.banned, false) = false limit 1 $$;
create or replace function monitora_is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from "auth_user" where id = monitora_uid() and role = 'admin') $$;
create or replace function monitora_campaign_role(cid uuid) returns text language sql stable security definer set search_path = public as $$ select m.role from campaign_member m join campaign c on c.id = m.campaign_id where m.campaign_id = cid and m.user_id = monitora_uid() and c.status = 'active' $$;
revoke all on function monitora_uid(), monitora_is_admin(), monitora_campaign_role(uuid) from public;
grant execute on function monitora_uid(), monitora_is_admin(), monitora_campaign_role(uuid) to monitora_app;

-- RLS vale para monitora_app (papel de TODA consulta da aplicação a dados de campanha). Sem FORCE: as funções
-- security definer (dono) leem campaign_member para avaliar as próprias políticas; o dono só é usado por migrations.
alter table campaign enable row level security;
alter table campaign_member enable row level security;
alter table campaign_investment enable row level security;

drop policy if exists campaign_read on campaign;
create policy campaign_read on campaign for select to monitora_app using (monitora_is_admin() or monitora_campaign_role(id) is not null);
drop policy if exists campaign_admin_write on campaign;
create policy campaign_admin_write on campaign for all to monitora_app using (monitora_is_admin()) with check (monitora_is_admin());

drop policy if exists member_read on campaign_member;
create policy member_read on campaign_member for select to monitora_app using (monitora_is_admin() or user_id = monitora_uid() or monitora_campaign_role(campaign_id) = 'owner');
drop policy if exists member_admin_write on campaign_member;
create policy member_admin_write on campaign_member for all to monitora_app using (monitora_is_admin()) with check (monitora_is_admin());

-- Investimentos: leitura por membros e pelo ADMIN (somente leitura); escrita só por owner/editor da própria campanha.
drop policy if exists investment_read on campaign_investment;
create policy investment_read on campaign_investment for select to monitora_app using (monitora_is_admin() or monitora_campaign_role(campaign_id) is not null);
drop policy if exists investment_insert on campaign_investment;
create policy investment_insert on campaign_investment for insert to monitora_app with check (monitora_campaign_role(campaign_id) in ('owner', 'editor') and created_by = monitora_uid());
drop policy if exists investment_update on campaign_investment;
create policy investment_update on campaign_investment for update to monitora_app using (monitora_campaign_role(campaign_id) in ('owner', 'editor')) with check (monitora_campaign_role(campaign_id) in ('owner', 'editor') and updated_by = monitora_uid());
drop policy if exists investment_delete on campaign_investment;
create policy investment_delete on campaign_investment for delete to monitora_app using (monitora_campaign_role(campaign_id) in ('owner', 'editor'))
