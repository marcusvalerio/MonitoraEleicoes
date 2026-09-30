-- Fase 0.9.2: cobertura EDITORIAL em tempo real (ex.: g1). Não é transcrição.

-- Fontes por debate, configuráveis por dados (URL/intervalo/ativação sem alterar código)
create table if not exists debate_source (
  id text primary key,
  debate_id text not null,
  provider_id text not null check (provider_id in ('g1-live-editorial')),
  source_url text,
  polling_interval_ms integer not null default 15000 check (polling_interval_ms between 5000 and 600000),
  enabled boolean not null default false,
  last_heartbeat_at timestamptz,
  last_collected_at timestamptz,
  last_update_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (debate_id, provider_id),
  check (source_url is null or source_url ~ '^https?://')
);

create sequence if not exists editorial_change_seq;

-- Fato da fonte: texto ORIGINAL publicado, horário informado pela fonte (NULL se ausente)
create table if not exists editorial_event (
  id text primary key,
  dataset_id text not null references dataset(id),
  debate_id text not null references debate(id) on delete cascade,
  source_id text not null,
  provider_id text not null,
  external_id text not null,
  source_record_id text references source_record(id),
  url text,
  headline text,
  original_text text not null,
  published_at timestamptz,
  modified_at timestamptz,
  time_precision text not null check (time_precision in ('exact', 'unknown')),
  content_hash text not null,
  version integer not null default 1,
  parser_version text not null,
  strategy text not null,
  collected_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  removed_at timestamptz,
  change_seq bigint not null default nextval('editorial_change_seq'),
  unique (provider_id, external_id),
  check ((published_at is null) = (time_precision = 'unknown'))
);
create index if not exists editorial_event_debate_change_idx on editorial_event (debate_id, change_seq);
create index if not exists editorial_event_debate_published_idx on editorial_event (debate_id, published_at);

-- Interpretação versionada (nunca altera o texto original); uma linha por versão de conteúdo × classificador × metodologia
create table if not exists editorial_analysis (
  id bigserial primary key,
  event_id text not null references editorial_event(id) on delete cascade,
  content_hash text not null,
  classifier text not null,
  classifier_version text not null,
  methodology_version text not null,
  event_type text not null check (event_type in ('abertura', 'pergunta', 'resposta', 'replica', 'treplica', 'ataque', 'defesa', 'proposta', 'critica', 'mudanca_tema', 'direito_resposta', 'intervalo', 'encerramento', 'consideracao_final', 'outro', 'unknown')),
  event_type_confidence text not null check (event_type_confidence in ('high', 'medium', 'low', 'unknown')),
  event_type_evidence text,
  actor_candidate_id text,
  target_candidate_id text,
  mentioned_candidate_ids text[] not null default '{}',
  mentioned_party_ids text[] not null default '{}',
  candidate_confidence text not null check (candidate_confidence in ('high', 'medium', 'low', 'unknown')),
  topic text not null,
  subtopic text,
  topic_confidence text not null check (topic_confidence in ('high', 'medium', 'low', 'unknown')),
  topic_evidence text[] not null default '{}',
  block_signal text,
  relevance_level text not null check (relevance_level in ('baixa', 'media', 'alta')),
  relevance_score numeric(4, 2) not null,
  relevance_criteria jsonb not null,
  relevance_version text not null,
  processed_at timestamptz not null default now(),
  unique (event_id, content_hash, classifier_version, methodology_version)
);
create index if not exists editorial_analysis_event_idx on editorial_analysis (event_id, processed_at desc);
