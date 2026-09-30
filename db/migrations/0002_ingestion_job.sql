-- Fila de ingestão: a requisição (API/CLI) apenas enfileira; o worker executa.
create table if not exists ingestion_job (
  id uuid primary key,
  profile text not null check (profile in ('demo', 'fixture', 'live')),
  dataset_id text not null,
  dataset_kind text not null check (dataset_kind in ('demo', 'fixture', 'validation', 'production')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  request_id text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  error text,
  result jsonb
);
create index if not exists ingestion_job_queue_idx on ingestion_job (status, requested_at);
