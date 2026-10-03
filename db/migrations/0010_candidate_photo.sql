-- 0010 — Fotos OFICIAIS de candidatura (TSE · Dados Abertos, foto_cand<ano>_<UF>_div.zip).
-- Uma imagem por (ano, SQ_CANDIDATO), com proveniência (arquivo de origem e hashes). Nenhuma imagem de outra fonte.
create table if not exists candidate_photo (
  year smallint not null,
  sq_candidato bigint not null,
  mime text not null check (mime in ('image/jpeg', 'image/png')),
  bytes bytea not null,
  sha256 text not null,
  source_url text not null,
  source_member text not null,
  source_zip_sha256 text,
  collected_at timestamptz not null default now(),
  primary key (year, sq_candidato)
);
