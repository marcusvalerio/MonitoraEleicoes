-- Histórico eleitoral oficial (TSE): ciclos gerais 2014/2018/2022/2026. Chaves inteiras compactas (plano Neon 512 MB).
-- Ausência nunca é 0: votos com value_status; resultados de ciclo não publicado = sem linhas + status do ciclo.

create table if not exists election (
  year smallint primary key,
  name text not null,
  election_type text not null check (election_type in ('geral', 'municipal')),
  status text not null check (status in ('scheduled', 'candidacies_only', 'results_partial', 'results_official')),
  source text not null,
  imported_at timestamptz
);

create table if not exists election_round (
  year smallint not null references election(year),
  round smallint not null check (round in (1, 2)),
  election_date date,
  primary key (year, round)
);

-- Cargo: id = CD_CARGO do TSE
create table if not exists office (
  id smallint primary key,
  slug text not null unique,
  name text not null,
  scope text not null check (scope in ('BR', 'UF'))
);

-- Território: 0 = Brasil; 1–5 = regiões (código IBGE); 11–53 = UF (código IBGE); 100000 + código TSE = município
create table if not exists territory (
  id integer primary key,
  level text not null check (level in ('pais', 'regiao', 'uf', 'municipio')),
  name text not null,
  uf char(2),
  parent_id integer references territory(id),
  tse_code integer,
  ibge_code integer
);
create index if not exists territory_parent_idx on territory (parent_id);
create index if not exists territory_uf_idx on territory (uf, level);

create table if not exists party_registration (
  year smallint not null references election(year),
  number smallint not null,
  acronym text not null,
  name text not null,
  federation text,
  primary key (year, number)
);

-- Candidatura (uma por eleição). CPF e título NUNCA são armazenados: só HMAC com segredo do servidor, para vincular ciclos.
create table if not exists candidacy (
  id integer generated always as identity primary key,
  year smallint not null references election(year),
  sq_candidato bigint not null,
  office_id smallint not null references office(id),
  territory_id integer not null references territory(id),
  ballot_number integer,
  name text not null,
  ballot_name text not null,
  normalized_name text not null,
  party_number smallint,
  party_acronym text,
  coalition text,
  federation text,
  situation text,
  status_round1 text,
  status_round2 text,
  title_hmac text,
  cpf_hmac text,
  source_record_id text references source_record(id),
  unique (year, sq_candidato)
);
create index if not exists candidacy_filter_idx on candidacy (year, office_id, territory_id);
create index if not exists candidacy_party_idx on candidacy (year, party_acronym);
create index if not exists candidacy_name_idx on candidacy (normalized_name);
create index if not exists candidacy_title_idx on candidacy (title_hmac) where title_hmac is not null;

-- Identidade histórica: nunca associação silenciosa. Sem evidência forte ⇒ unresolved.
create table if not exists person (
  id integer generated always as identity primary key,
  canonical_name text not null,
  created_at timestamptz not null default now()
);
create table if not exists identity_link (
  candidacy_id integer primary key references candidacy(id) on delete cascade,
  person_id integer references person(id),
  status text not null check (status in ('resolved', 'unresolved', 'manual', 'rejected')),
  method text not null check (method in ('title_hmac', 'cpf_hmac', 'manual', 'none')),
  confidence text not null check (confidence in ('high', 'medium', 'low', 'unknown')),
  note text,
  reviewed_at timestamptz,
  check ((status in ('resolved', 'manual')) = (person_id is not null))
);
create index if not exists identity_link_person_idx on identity_link (person_id);

-- Resultado por candidatura × território × turno (município para majoritários; UF para proporcionais; BR/UF totais)
create table if not exists result_candidacy (
  year smallint not null,
  round smallint not null,
  office_id smallint not null,
  candidacy_id integer not null references candidacy(id) on delete cascade,
  territory_id integer not null references territory(id),
  votes integer,
  votes_status value_status not null,
  primary key (year, round, candidacy_id, territory_id),
  check ((votes is null) = (votes_status <> 'value'))
);
create index if not exists result_filter_idx on result_candidacy (year, round, office_id, territory_id);

-- Lote de importação (proveniência por arquivo oficial: URL, sha256, contagens)
create table if not exists import_batch (
  id uuid primary key,
  year smallint not null,
  kind text not null,
  source_url text not null,
  file_sha256 text,
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  rows_rejected integer not null default 0,
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);
