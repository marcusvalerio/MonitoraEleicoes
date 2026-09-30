-- MONITORA ELEIÇÕES · 0001 · schema inicial persistente
-- Regras: proveniência completa (source → source_record → raw_record → domínio → analysis);
-- ausência ≠ zero (value_status); timestamps nunca inventados (NULL + precisão); datasets isolados.
-- Cada instrução termina em ";" seguido de quebra de linha (o runner divide por isso).

-- ───────── Ambiente e datasets ─────────
create table if not exists monitora_env (
  id boolean primary key default true check (id),
  env text not null check (env in ('development', 'test', 'production')),
  created_at timestamptz not null default now()
);

create table if not exists dataset (
  id text primary key,
  kind text not null check (kind in ('demo', 'fixture', 'validation', 'production')),
  description text not null,
  created_at timestamptz not null default now()
);

do $$ begin create type value_status as enum ('value', 'unknown', 'not_collected', 'not_available', 'not_applicable'); exception when duplicate_object then null; end $$;

-- ───────── Fontes e proveniência ─────────
create table if not exists source (
  id text primary key,
  dataset_id text not null references dataset(id),
  name text not null,
  type text not null check (type in ('official', 'social', 'media', 'transcript', 'ai_analysis')),
  provider text not null,
  provider_id text,
  provider_kind text,
  url text,
  status text not null check (status in ('connected', 'degraded', 'offline', 'not_configured', 'demo')),
  description text not null default '',
  license text,
  updated_at timestamptz not null default now()
);

create table if not exists ingestion_run (
  id uuid primary key,
  dataset_id text not null references dataset(id),
  provider_id text not null,
  source_id text,
  kind text not null,
  request_id text,
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  received_count integer not null default 0,
  normalized_count integer not null default 0,
  rejected_count integer not null default 0,
  unchanged_count integer not null default 0,
  error_count integer not null default 0,
  message text
);
create index if not exists ingestion_run_provider_started_idx on ingestion_run (provider_id, started_at desc);

-- Metadados do item na origem (um por provider + external_id)
create table if not exists source_record (
  id text primary key,
  dataset_id text not null references dataset(id),
  source_id text not null,
  provider_id text not null,
  external_id text not null,
  schema text not null,
  content_type text not null default 'application/json',
  source_url text,
  author text,
  language text,
  etag text,
  last_modified text,
  published_at timestamptz,
  collected_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  content_hash text not null,
  unique (provider_id, external_id)
);
create index if not exists source_record_source_idx on source_record (source_id);

-- Payload bruto (versionado por hash: conteúdo alterado na origem = nova versão)
create table if not exists raw_record (
  id bigserial primary key,
  source_record_id text not null references source_record(id) on delete cascade,
  ingestion_run_id uuid references ingestion_run(id),
  schema_version text not null,
  provider_version text not null,
  payload jsonb not null,
  hash text not null,
  received_at timestamptz not null default now(),
  unique (source_record_id, hash)
);

create table if not exists ingestion_error (
  id bigserial primary key,
  ingestion_run_id uuid not null references ingestion_run(id) on delete cascade,
  raw_record_id bigint references raw_record(id),
  external_id text,
  field text,
  code text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists ingestion_error_run_idx on ingestion_error (ingestion_run_id);

-- Checkpoint de ingestão incremental por fluxo (provider + stream)
create table if not exists ingestion_checkpoint (
  provider_id text not null,
  stream text not null,
  cursor text,
  updated_at timestamptz not null default now(),
  primary key (provider_id, stream)
);

-- ───────── Entidades eleitorais ─────────
create table if not exists party (
  id text primary key,
  dataset_id text not null references dataset(id),
  acronym text not null,
  name text not null,
  number integer,
  source_record_id text references source_record(id)
);

create table if not exists party_visual_identity (
  party_id text not null references party(id) on delete cascade,
  acronym text not null,
  color char(7) not null,
  valid_from date not null,
  valid_to date,
  source text not null,
  primary key (party_id, valid_from)
);

create table if not exists candidate (
  id text primary key,
  dataset_id text not null references dataset(id),
  name text not null,
  ballot_name text not null,
  party_id text not null references party(id),
  office_id text not null,
  initials text not null,
  source_record_id text references source_record(id)
);

-- Identificadores externos (TSE, redes, transcrição) com vigência
create table if not exists entity_identifier (
  entity_type text not null check (entity_type in ('candidate', 'party', 'debate', 'speaker')),
  entity_id text not null,
  provider text not null,
  external_id text not null,
  valid_from date,
  valid_to date,
  source_record_id text references source_record(id),
  primary key (provider, entity_type, external_id)
);
create index if not exists entity_identifier_entity_idx on entity_identifier (entity_type, entity_id);

-- ───────── Debate ─────────
create table if not exists debate (
  id text primary key,
  dataset_id text not null references dataset(id),
  title text not null,
  broadcaster text not null,
  jurisdiction text,
  office_label text not null,
  election_year integer not null,
  round smallint not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null check (status in ('scheduled', 'live', 'ended')),
  source_record_id text references source_record(id),
  updated_at timestamptz not null default now()
);

create table if not exists debate_block (
  debate_id text not null references debate(id) on delete cascade,
  id text not null,
  label text not null,
  ord integer not null,
  start_offset_s numeric,
  end_offset_s numeric,
  primary key (debate_id, id)
);

create table if not exists debate_participant (
  debate_id text not null references debate(id) on delete cascade,
  candidate_id text not null references candidate(id),
  podium integer not null,
  primary key (debate_id, candidate_id)
);

-- Orador ≠ candidato: moderador, jornalista, convidado, público, desconhecido
create table if not exists speaker (
  id text primary key,
  debate_id text not null references debate(id) on delete cascade,
  label text,
  kind text not null check (kind in ('candidate', 'moderator', 'journalist', 'commentator', 'guest', 'audience', 'unknown')),
  candidate_id text references candidate(id),
  resolution_source text not null check (resolution_source in ('source_label', 'manual_map', 'press_attribution', 'unresolved', 'demo')),
  resolution_confidence text not null check (resolution_confidence in ('high', 'medium', 'low', 'unknown'))
);
create index if not exists speaker_debate_idx on speaker (debate_id);

create table if not exists transcript_segment (
  id text primary key,
  dataset_id text not null references dataset(id),
  debate_id text not null references debate(id) on delete cascade,
  external_id text not null,
  seq integer not null,
  speaker_id text not null references speaker(id),
  speaker_label text,
  -- offsets (s desde o início) e instantes absolutos: NULL quando a fonte não informa
  start_offset_s numeric,
  end_offset_s numeric,
  started_at timestamptz,
  ended_at timestamptz,
  timestamp_precision text not null check (timestamp_precision in ('exact', 'approximate', 'block', 'sequence', 'unknown')),
  block_id text,
  addressed_to_candidate_id text references candidate(id),
  text text not null,
  word_count integer not null,
  source_record_id text references source_record(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((start_offset_s is null) = (started_at is null)),
  check (end_offset_s is null or start_offset_s is null or end_offset_s > start_offset_s)
);
create index if not exists transcript_segment_debate_time_idx on transcript_segment (debate_id, start_offset_s);
create index if not exists transcript_segment_debate_seq_idx on transcript_segment (debate_id, seq);
create index if not exists transcript_segment_speaker_idx on transcript_segment (speaker_id);

-- ───────── Análise (versionada; nunca sobrescreve o RAW nem análises anteriores) ─────────
create table if not exists topic (id text primary key, label text not null);

create table if not exists analysis (
  id bigserial primary key,
  segment_id text not null references transcript_segment(id) on delete cascade,
  method text not null check (method in ('demo', 'rules', 'llm', 'human')),
  model text not null,
  model_version text not null,
  prompt_version text not null,
  topic text not null references topic(id),
  subtopic text,
  speech_type text not null,
  tone text not null,
  target_candidate_id text,
  mentions text[] not null default '{}',
  fact_check text not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  confidence_level text not null check (confidence_level in ('high', 'medium', 'low', 'unknown')),
  relevance_score numeric(4, 2) not null,
  relevance_level text not null check (relevance_level in ('baixa', 'media', 'alta')),
  relevance_method text not null,
  relevance_method_version text not null,
  relevance_features jsonb not null,
  raw_output jsonb,
  human_reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (segment_id, model, model_version, prompt_version, relevance_method_version)
);
create index if not exists analysis_segment_idx on analysis (segment_id, created_at desc);

create table if not exists segment_topic (
  analysis_id bigint not null references analysis(id) on delete cascade,
  topic text not null references topic(id),
  subtopic text,
  weight numeric(4, 3) not null default 1,
  primary key (analysis_id, topic)
);

-- ───────── Redes sociais ─────────
create table if not exists social_post (
  id text primary key,
  dataset_id text not null references dataset(id),
  debate_id text references debate(id) on delete cascade,
  platform text not null,
  external_id text not null,
  author text,
  published_at timestamptz,
  collected_at timestamptz not null,
  offset_s numeric,
  text text,
  url text,
  language text,
  source_record_id text references source_record(id),
  unique (platform, external_id)
);
create index if not exists social_post_platform_published_idx on social_post (platform, published_at);

create table if not exists social_mention (
  id bigserial primary key,
  post_id text not null references social_post(id) on delete cascade,
  kind text not null check (kind in ('candidate', 'party', 'topic')),
  candidate_id text references candidate(id),
  party_id text references party(id),
  topic text references topic(id),
  method text not null,
  confidence text not null,
  unique (post_id, kind, candidate_id, party_id, topic)
);

create table if not exists social_metric (
  dataset_id text not null references dataset(id),
  debate_id text not null references debate(id) on delete cascade,
  platform text not null,
  bucket_start_s numeric not null,
  bucket_size_s numeric not null,
  posts integer not null check (posts >= 0),
  mentions_by_candidate jsonb not null default '{}',
  by_topic jsonb not null default '{}',
  source_id text not null,
  source_record_id text references source_record(id),
  primary key (debate_id, platform, bucket_start_s, bucket_size_s)
);

-- ───────── Geografia (observações ≠ geometria) ─────────
create table if not exists geo_entity (
  key text primary key,
  level text not null check (level in ('pais', 'regiao', 'uf', 'municipio', 'zona', 'local', 'secao')),
  name text not null,
  parent_key text references geo_entity(key),
  ibge_code integer,
  tse_code integer
);

create table if not exists geo_observation (
  dataset_id text not null references dataset(id),
  debate_id text not null references debate(id) on delete cascade,
  region_key text not null references geo_entity(key),
  bucket_start_s numeric not null,
  bucket_size_s numeric not null,
  posts integer not null check (posts >= 0),
  mentions_by_candidate jsonb not null default '{}',
  by_topic jsonb not null default '{}',
  geo_precision text not null check (geo_precision in ('country', 'state', 'municipality', 'unknown')),
  geo_source text not null check (geo_source in ('geotag', 'profile', 'text_mention', 'platform_region', 'none')),
  geo_confidence text not null check (geo_confidence in ('high', 'medium', 'low', 'unknown')),
  source_id text not null,
  source_record_id text references source_record(id),
  primary key (debate_id, region_key, bucket_start_s, bucket_size_s)
);

-- ───────── Mídia ─────────
create table if not exists media_asset (
  id text primary key,
  dataset_id text not null references dataset(id),
  kind text not null check (kind in ('article', 'video', 'audio')),
  outlet text not null,
  title text not null,
  url text,
  published_at timestamptz,
  debate_id text references debate(id) on delete cascade,
  document_sha256 text,
  source_record_id text references source_record(id)
);

-- ───────── Qualidade ─────────
create table if not exists data_quality_report (
  id bigserial primary key,
  debate_id text not null references debate(id) on delete cascade,
  ingestion_run_id uuid references ingestion_run(id),
  report jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists data_quality_report_debate_idx on data_quality_report (debate_id, created_at desc);

-- ───────── Resultados eleitorais (preparado para o TSE; ausência explícita) ─────────
create table if not exists electoral_result (
  dataset_id text not null references dataset(id),
  election_year integer not null,
  round smallint not null,
  office_code integer not null,
  region_key text not null,
  eligible_voters bigint,
  eligible_voters_status value_status not null,
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
  source_record_id text references source_record(id),
  primary key (election_year, round, office_code, region_key),
  check ((eligible_voters is null) = (eligible_voters_status <> 'value')),
  check ((turnout is null) = (turnout_status <> 'value')),
  check ((abstention is null) = (abstention_status <> 'value')),
  check ((valid_votes is null) = (valid_votes_status <> 'value')),
  check ((blank_votes is null) = (blank_votes_status <> 'value')),
  check ((null_votes is null) = (null_votes_status <> 'value'))
);
