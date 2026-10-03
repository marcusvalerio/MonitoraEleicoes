-- 0009 — Pesquisas eleitorais registradas no TSE (PesqEle, Portal de Dados Abertos).
-- A fonte oficial traz o REGISTRO da pesquisa (instituto, contratante, período, amostra, metodologia), mas NÃO os
-- percentuais por candidato: results_status = 'not_available' até existir provider separado e confiável de resultados.
-- CPF de contratante pessoa física nunca é armazenado (apenas o tipo e o nome publicado).
create table if not exists poll (
  protocol text primary key,
  year smallint not null,
  election_code integer,
  election_name text,
  uf text not null,
  ue_code text,
  ue_name text,
  offices_raw text,
  office_ids smallint[] not null default '{}',
  registered_at timestamptz,
  own_poll boolean,
  company_cnpj text,
  company_name text not null,
  company_trade_name text,
  field_start date,
  field_end date,
  release_date date,
  sample_size integer,
  statistician text,
  statistician_conre text,
  cost_brl numeric(14, 2),
  methodology text,
  sample_plan text,
  control_system text,
  municipality_detail text,
  results_status value_status not null default 'not_available',
  source_record_id text references source_record(id),
  import_batch_id uuid references import_batch(id),
  updated_at timestamptz not null default now()
);
create index if not exists poll_year_release_idx on poll (year, release_date desc nulls last);
create index if not exists poll_uf_idx on poll (year, uf);
create index if not exists poll_offices_idx on poll using gin (office_ids);
create index if not exists poll_company_idx on poll (company_cnpj);

create table if not exists poll_contractor (
  protocol text not null references poll(protocol) on delete cascade,
  contractor_code bigint not null,
  kind text not null check (kind in ('pessoa_juridica', 'pessoa_fisica', 'desconhecido')),
  cnpj text,
  name text,
  amount_paid numeric(14, 2),
  is_payer boolean,
  funding_origin text,
  check (kind = 'pessoa_juridica' or cnpj is null),
  primary key (protocol, contractor_code)
);
