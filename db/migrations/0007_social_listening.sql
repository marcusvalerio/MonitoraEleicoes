-- Social listening: fontes conectadas (com estado de acesso honesto), monitores, conteúdos normalizados,
-- vínculos com entidades (menção ≠ apoio), análise versionada e janelas de coleta (0 menções ≠ não coletado).

create table if not exists social_source (
  id text primary key,
  platform text not null,
  name text not null,
  access_status text not null check (access_status in ('active', 'configured', 'requires_authorization', 'unsupported', 'limited', 'error', 'disabled')),
  enabled boolean not null default false,
  capabilities jsonb not null,
  notes text not null default '',
  docs_url text,
  quota jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists social_monitor (
  id text primary key,
  name text not null,
  election_year smallint references election(year),
  office_ids smallint[] not null default '{}',
  candidacy_ids integer[] not null default '{}',
  parties text[] not null default '{}',
  ufs text[] not null default '{}',
  terms text[] not null,
  platforms text[] not null default '{}',
  interval_s integer not null default 900 check (interval_s between 60 and 86400),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  debate_id text,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (array_length(terms, 1) >= 1)
);

-- Conteúdo normalizado. Autor: somente HMAC do id; nome exibido só para publicadores (vídeo/live/notícia), nunca de comentaristas.
create table if not exists social_record (
  id text primary key,
  dataset_id text not null references dataset(id),
  platform text not null,
  provider_id text not null,
  external_id text not null,
  monitor_id text references social_monitor(id) on delete set null,
  content_type text not null check (content_type in ('post', 'comment', 'reply', 'news', 'video', 'live')),
  parent_id text,
  root_id text,
  author_hash text,
  author_display_name text,
  published_at timestamptz,
  collected_at timestamptz not null,
  title text,
  text text not null,
  language text,
  permalink text,
  media_type text,
  metrics jsonb not null default '{}',
  metrics_at timestamptz,
  content_hash text not null,
  version integer not null default 1,
  source_record_id text references source_record(id),
  debate_id text,
  ingested_at timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists social_record_published_idx on social_record (published_at);
create index if not exists social_record_platform_idx on social_record (platform, published_at);
create index if not exists social_record_monitor_idx on social_record (monitor_id, published_at);
create index if not exists social_record_parent_idx on social_record (parent_id);

-- Vínculo conteúdo × entidade: tipo de menção e sentimento EM RELAÇÃO à entidade (separado do sentimento do conteúdo)
create table if not exists social_record_entity (
  record_id text not null references social_record(id) on delete cascade,
  entity_type text not null check (entity_type in ('candidacy', 'party')),
  entity_id text not null,
  analysis_version text not null,
  mention_type text not null check (mention_type in ('mencao', 'apoio_explicito', 'critica_explicita', 'comparacao', 'pergunta', 'noticia', 'ironia', 'neutro', 'unclear')),
  mention_confidence text not null check (mention_confidence in ('high', 'medium', 'low', 'unknown')),
  entity_sentiment text not null check (entity_sentiment in ('positivo', 'negativo', 'neutro', 'misto', 'incerto')),
  evidence text,
  primary key (record_id, entity_type, entity_id, analysis_version)
);
create index if not exists social_record_entity_entity_idx on social_record_entity (entity_type, entity_id);

create table if not exists social_analysis (
  record_id text not null references social_record(id) on delete cascade,
  analysis_version text not null,
  content_hash text not null,
  classifier text not null,
  content_sentiment text not null check (content_sentiment in ('positivo', 'negativo', 'neutro', 'misto', 'incerto')),
  sentiment_confidence text not null check (sentiment_confidence in ('high', 'medium', 'low', 'unknown')),
  topic text not null,
  topic_confidence text not null check (topic_confidence in ('high', 'medium', 'low', 'unknown')),
  topic_evidence text[] not null default '{}',
  relevant boolean not null,
  geo_uf char(2),
  geo_source text not null check (geo_source in ('declarada', 'mencao_explicita', 'institucional', 'estruturada', 'nenhuma')),
  geo_evidence text,
  processed_at timestamptz not null default now(),
  primary key (record_id, analysis_version, content_hash),
  check ((geo_uf is null) = (geo_source = 'nenhuma'))
);
create index if not exists social_analysis_topic_idx on social_analysis (topic);

-- Janela de coleta por fonte × monitor: é o que permite dizer "0 menções" (coletado, vazio) × "não coletado".
create table if not exists social_collection_window (
  source_id text not null references social_source(id),
  monitor_id text not null references social_monitor(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('collected', 'partial', 'failed', 'rate_limited', 'unsupported', 'requires_authorization')),
  items integer,
  quota_used integer,
  ingestion_run_id uuid,
  error text,
  collected_at timestamptz not null default now(),
  primary key (source_id, monitor_id, window_start),
  check (window_end > window_start),
  check ((status in ('collected', 'partial')) = (items is not null))
);
create index if not exists social_window_monitor_idx on social_collection_window (monitor_id, window_end desc);
