-- Seção eleitoral → local de votação (escola), do cadastro oficial do TSE (eleitorado_local_votacao).
-- Usado para somar os boletins de urna (um por seção) por escola.
create table if not exists section_place (
  year smallint not null,
  municipality_tse integer not null,
  zone integer not null,
  section integer not null,
  place integer not null,
  primary key (year, municipality_tse, zone, section)
);
