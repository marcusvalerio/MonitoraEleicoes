-- 0008 — Apuração oficial (sistema de divulgação de resultados do TSE).
-- Arquivo RECONSTRUÍDO em 2026-10-01 a partir do schema aplicado em dev/test (o arquivo original foi perdido
-- antes do commit). Gera exatamente as mesmas tabelas, colunas, restrições e índices; ver docs/APURACAO.md.
--
-- count_snapshot: um retrato por (ano, turno, cargo, território, conteúdo). Novo conteúdo publicado = novo retrato;
-- conteúdo idêntico (mesmo hash) nunca duplica. Cada número carrega seu value_status: antes da totalização
-- começar, comparecimento/votos são 'not_collected' (o TSE publica 0, que NÃO significa 0 votos).
-- Percentuais em pontos percentuais (0–100), como publicados pelo TSE.
create table if not exists count_snapshot (
  id bigint generated always as identity primary key,
  year smallint not null references election(year),
  round smallint not null check (round in (1, 2)),
  office_id smallint not null references office(id),
  territory_id integer not null references territory(id),
  tse_election_code integer not null,
  phase text not null check (phase in ('not_started', 'partial', 'final')),
  source_generated_at timestamptz not null,
  source_totalized_at timestamptz,
  collected_at timestamptz not null,
  sections_total integer,
  sections_total_status value_status not null,
  sections_counted integer,
  sections_counted_status value_status not null,
  counted_pct numeric(7, 4),
  counted_pct_status value_status not null,
  electorate bigint,
  electorate_status value_status not null,
  turnout bigint,
  turnout_status value_status not null,
  abstention bigint,
  abstention_status value_status not null,
  valid_votes bigint,
  valid_votes_status value_status not null,
  blank_votes bigint,
  blank_votes_status value_status not null,
  null_votes bigint,
  null_votes_status value_status not null,
  content_hash text not null,
  source_record_id text references source_record(id),
  raw_record_id bigint references raw_record(id),
  ingestion_run_id uuid references ingestion_run(id),
  check ((sections_total is null) = (sections_total_status <> 'value')),
  check ((sections_counted is null) = (sections_counted_status <> 'value')),
  check ((counted_pct is null) = (counted_pct_status <> 'value')),
  check ((electorate is null) = (electorate_status <> 'value')),
  check ((turnout is null) = (turnout_status <> 'value')),
  check ((abstention is null) = (abstention_status <> 'value')),
  check ((valid_votes is null) = (valid_votes_status <> 'value')),
  check ((blank_votes is null) = (blank_votes_status <> 'value')),
  check ((null_votes is null) = (null_votes_status <> 'value')),
  check (phase <> 'not_started' or turnout_status = 'not_collected'),
  unique (year, round, office_id, territory_id, content_hash)
);
create index if not exists count_snapshot_latest_idx on count_snapshot (year, round, office_id, territory_id, source_generated_at desc);

-- count_candidate: votação de cada candidatura em um retrato. sq_candidato = sqcand do arquivo = SQ_CANDIDATO do TSE.
create table if not exists count_candidate (
  snapshot_id bigint not null references count_snapshot(id) on delete cascade,
  sq_candidato bigint not null,
  candidacy_id integer references candidacy(id),
  ballot_number integer,
  ballot_name text not null,
  party_acronym text,
  votes integer,
  votes_status value_status not null,
  pct numeric(9, 6),
  pct_status value_status not null,
  vote_destination text,
  situation text,
  elected boolean,
  check ((votes is null) = (votes_status <> 'value')),
  check ((pct is null) = (pct_status <> 'value')),
  primary key (snapshot_id, sq_candidato)
);
create index if not exists count_candidate_candidacy_idx on count_candidate (candidacy_id);
