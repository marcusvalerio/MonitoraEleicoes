-- Fase 0.8: ingestão ao vivo/replay, latência e controle de debate por dados.

-- Precisão 'synthetic' (horários gerados para replay; nunca fatos históricos)
alter table transcript_segment drop constraint if exists transcript_segment_timestamp_precision_check;
alter table transcript_segment add constraint transcript_segment_timestamp_precision_check check (timestamp_precision in ('exact', 'approximate', 'block', 'sequence', 'unknown', 'synthetic'));

-- Modo da fonte e instantes para latência (NULL quando desconhecidos)
alter table transcript_segment add column if not exists source_mode text not null default 'file' check (source_mode in ('live', 'replay', 'file'));
alter table transcript_segment add column if not exists source_time timestamptz;
alter table transcript_segment add column if not exists collected_at timestamptz;
alter table transcript_segment add column if not exists ingested_at timestamptz not null default now();
alter table transcript_segment add column if not exists asr_confidence numeric(4, 3) check (asr_confidence between 0 and 1);
create index if not exists transcript_segment_debate_ingested_idx on transcript_segment (debate_id, ingested_at);

alter table analysis add column if not exists processed_at timestamptz not null default now();

-- Origem da resolução de orador: rótulo do provider ao vivo e diarização futura
alter table speaker drop constraint if exists speaker_resolution_source_check;
alter table speaker add constraint speaker_resolution_source_check check (resolution_source in ('source_label', 'manual_map', 'press_attribution', 'unresolved', 'demo', 'provider_label', 'diarization'));

-- Controle de debate (cadastro sem alterar código)
create table if not exists debate_control (
  id text primary key,
  title text not null,
  office_label text not null,
  jurisdiction text,
  scheduled_start timestamptz not null,
  source_name text not null,
  source_url text,
  provider_id text not null,
  source_mode text not null check (source_mode in ('live', 'replay', 'file')),
  replay_of text,
  replay_speed numeric(5, 2) check (replay_speed in (1, 2, 5, 10)),
  candidates text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled', 'preparing', 'connecting', 'live', 'paused', 'finished', 'processing', 'archived', 'error')),
  started_at timestamptz,
  ended_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_mode <> 'replay' or (replay_of is not null and replay_speed is not null))
);
create index if not exists debate_control_status_idx on debate_control (status, scheduled_start);

create table if not exists debate_control_event (
  id bigserial primary key,
  control_id text not null references debate_control(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  at timestamptz not null default now()
);
create index if not exists debate_control_event_idx on debate_control_event (control_id, at);
