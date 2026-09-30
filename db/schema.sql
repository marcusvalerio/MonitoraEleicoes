-- MONITORA ELEIÇÕES · schema PostgreSQL (Supabase)
-- Princípios: RAW separado de AI ANALYSIS; toda linha com fonte; demo nunca misturado com real.

create type data_mode as enum ('demo', 'live');
create type data_nature as enum ('official', 'collected', 'ai', 'analysis');
create type source_type as enum ('official', 'social', 'media', 'transcript', 'ai_analysis');
create type source_status as enum ('active', 'degraded', 'unavailable', 'pending', 'demo');

create table source (
  id text primary key,
  name text not null,
  type source_type not null,
  provider text not null,
  url text,
  reference_at timestamptz not null,
  collected_at timestamptz,
  status source_status not null,
  mode data_mode not null,
  description text
);

-- ───────── Eleitoral (TSE é a autoridade) ─────────
create table election (id text primary key, year int not null, label text not null, source_id text not null references source(id));
create table election_round (id text primary key, election_id text not null references election(id), round smallint not null check (round in (1,2)), date date not null);
create table office (id text primary key, tse_code int unique not null, name text not null);
create table party (id text primary key, number int not null, acronym text not null, name text not null, mode data_mode not null);
create table candidate (
  id text primary key, election_id text references election(id), office_id text references office(id),
  party_id text references party(id), name text not null, ballot_name text not null, tse_seq text, mode data_mode not null
);
create table region (id text primary key, name text not null);
create table state (uf char(2) primary key, name text not null, region_id text not null references region(id));
create table municipality (tse_code int primary key, ibge_code int, name text not null, uf char(2) not null references state(uf));
create table electoral_zone (uf char(2) not null references state(uf), number int not null, municipality_code int not null references municipality(tse_code), primary key (uf, number));
create table polling_place (id text primary key, uf char(2) not null, zone int not null, number int not null, name text not null, address text,
  foreign key (uf, zone) references electoral_zone(uf, number), unique (uf, zone, number));
create table polling_section (uf char(2) not null, zone int not null, number int not null, polling_place_id text not null references polling_place(id),
  primary key (uf, zone, number));

create table import_batch (
  id text primary key, election_id text not null references election(id), file_name text not null, file_version text not null,
  checksum_sha256 text not null, imported_at timestamptz not null default now(), rows int not null,
  status text not null check (status in ('validated','normalized','loaded','failed')), error text,
  unique (file_name, checksum_sha256)
);

-- Nível de seção (menor granularidade oficial); níveis superiores são agregações materializadas.
create table electoral_result_section (
  round_id text not null references election_round(id), office_id text not null references office(id),
  uf char(2) not null, zone int not null, section int not null,
  eligible_voters int, turnout int, abstention int, valid_votes int, blank_votes int, null_votes int,
  import_batch_id text not null references import_batch(id),
  primary key (round_id, office_id, uf, zone, section)
);
create table electoral_votes_section (
  round_id text not null, office_id text not null, uf char(2) not null, zone int not null, section int not null,
  candidate_id text not null references candidate(id), votes int not null check (votes >= 0),
  primary key (round_id, office_id, uf, zone, section, candidate_id),
  foreign key (round_id, office_id, uf, zone, section) references electoral_result_section
);
create index on electoral_result_section (round_id, office_id, uf, zone);
create index on electoral_votes_section (round_id, office_id, candidate_id);

-- ───────── Debate ─────────
create table debate (
  id text primary key, title text not null, broadcaster text not null, office_id text references office(id),
  election_year int not null, round smallint not null, starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null check (status in ('scheduled','live','ended')), mode data_mode not null
);
create table debate_participant (debate_id text references debate(id), candidate_id text references candidate(id), podium int, primary key (debate_id, candidate_id));
create table debate_block (id text, debate_id text references debate(id), label text not null, start_offset int not null, end_offset int not null, primary key (debate_id, id));
create table transcript (id text primary key, debate_id text not null references debate(id), source_id text not null references source(id), version int not null default 1);

-- RAW: nunca atualizado por IA. Correções humanas criam nova versão do transcript.
create table transcript_segment (
  id text primary key, transcript_id text not null references transcript(id), debate_id text not null references debate(id),
  seq int not null, speaker_id text not null, start_offset numeric not null, end_offset numeric not null,
  text text not null, block_id text, addressed_to_id text, mode data_mode not null,
  unique (transcript_id, seq)
);
create index on transcript_segment (debate_id, end_offset);
create index transcript_segment_fts on transcript_segment using gin (to_tsvector('portuguese', text));

create table topic (id text primary key, label text not null);
create table subtopic (id text primary key, topic_id text not null references topic(id), label text not null);

-- AI ANALYSIS: append-only; a vigente é a mais recente por segmento.
create table speech_classification (
  id bigserial primary key, segment_id text not null references transcript_segment(id),
  topic_id text not null references topic(id), subtopic text, speech_type text not null, tone text not null,
  target_id text, mentions text[] not null default '{}', relevance text not null, relevance_score numeric(4,2) not null,
  relevance_features jsonb not null, fact_check text not null, confidence numeric(4,3) not null check (confidence between 0 and 1),
  model text not null, model_version text not null, prompt_version text not null, raw_output jsonb,
  classified_at timestamptz not null, human_reviewed boolean not null default false, reviewed_by uuid, reviewed_at timestamptz
);
create index on speech_classification (segment_id, classified_at desc);

create table debate_event (
  id text primary key, debate_id text not null references debate(id), code text not null, kind text not null,
  start_offset numeric not null, title text not null, description text not null, topic_id text references topic(id), subtopic text,
  segment_ids text[] not null, candidate_ids text[] not null, social_post_ids text[] not null default '{}',
  metrics jsonb not null default '[]', source_ids text[] not null, engine_version text not null
);
create index on debate_event (debate_id, start_offset);

-- ───────── Social ─────────
create table social_platform (id text primary key, name text not null, access text not null, notes text);
create table social_post (
  id text primary key, platform_id text not null references social_platform(id), debate_id text references debate(id),
  posted_at timestamptz not null, text text, author_handle text, url text, mentions_candidate_ids text[] default '{}',
  topic_id text references topic(id), terms text[] default '{}', source_id text not null references source(id), mode data_mode not null
);
create index on social_post (debate_id, posted_at);
create table social_metric (
  platform_id text not null references social_platform(id), debate_id text not null references debate(id),
  bucket_start timestamptz not null, bucket_seconds int not null, posts int not null,
  mentions_by_candidate jsonb not null default '{}', by_topic jsonb not null default '{}', source_id text not null references source(id),
  primary key (platform_id, debate_id, bucket_start)
);

create table analysis (id text primary key, title text not null, body text not null, based_on text[] not null, created_at timestamptz not null default now());

-- Leitura pública; escrita apenas pelo service role (ingestão no servidor).
alter table transcript_segment enable row level security;
create policy public_read on transcript_segment for select using (true);
alter table speech_classification enable row level security;
create policy public_read on speech_classification for select using (true);

-- ───────── Geoespacial (independente da tecnologia de mapa) ─────────
create table geo_region (
  key text primary key,                -- 'BR' · 'R:SE' · 'UF:RJ' · 'M:RJ:niteroi'
  level text not null check (level in ('pais','regiao','uf','municipio','zona','local','secao')),
  name text not null,
  parent_key text references geo_region(key),
  ibge_code int, tse_code int
);
create index on geo_region (parent_key);
-- Geometria servida simplificada por nível (TopoJSON/GeoJSON); nunca enviada inteira ao browser.
create table geo_boundary (region_key text primary key references geo_region(key), level text not null, geom_simplified jsonb not null, source_id text not null references source(id));
-- Métricas na granularidade mais fina; níveis superiores são agregados (materialized views).
create table geo_metric (
  region_key text not null references geo_region(key), debate_id text not null references debate(id),
  bucket_start timestamptz not null, bucket_seconds int not null, posts int not null,
  mentions_by_candidate jsonb not null default '{}', by_topic jsonb not null default '{}', source_id text not null references source(id),
  primary key (debate_id, region_key, bucket_start)
);
create index on geo_metric (debate_id, bucket_start);
