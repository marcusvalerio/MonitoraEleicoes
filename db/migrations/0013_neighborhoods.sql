-- Bairros oficiais do IBGE (Censo 2022, malha de bairros), simplificados para desenho no navegador.
-- Somente geometria e nomes (dado público); a vitória por bairro é calculada a partir das escolas (place_result).
create table if not exists neighborhood (
  cd text primary key,
  mun_ibge integer not null,
  uf text not null,
  mun_key text not null,
  name text not null,
  rings jsonb not null
);
create index if not exists neighborhood_mun_idx on neighborhood (uf, mun_key);
