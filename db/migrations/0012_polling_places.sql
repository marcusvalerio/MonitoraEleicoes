-- Locais de votação (escolas) e votação agregada por local — TSE · Dados Abertos (votacao_secao + eleitorado_local_votacao).
-- Zona e município são somas dos locais (sem tabelas redundantes). Somente dado oficial; ausência ≠ zero.

create table if not exists polling_place (
  year smallint not null,
  uf char(2) not null,
  municipality_tse integer not null,
  zone integer not null,
  place integer not null,
  name text not null,
  address text,
  neighborhood text,
  lat numeric(9, 6),
  lon numeric(9, 6),
  electorate integer,
  primary key (year, municipality_tse, zone, place),
  check ((lat is null) = (lon is null))
);
create index if not exists polling_place_uf_idx on polling_place (year, uf, municipality_tse);

-- votes: {"<NR_VOTAVEL>": votos}. 95 = branco, 96 = nulo (códigos do TSE); demais = número do candidato.
create table if not exists place_result (
  year smallint not null,
  round smallint not null check (round in (1, 2)),
  office_id smallint not null references office(id),
  municipality_tse integer not null,
  zone integer not null,
  place integer not null,
  sections integer not null,
  votes jsonb not null,
  source_record_id text references source_record(id),
  primary key (year, round, office_id, municipality_tse, zone, place)
);
create index if not exists place_result_mun_idx on place_result (year, round, office_id, municipality_tse, zone);
