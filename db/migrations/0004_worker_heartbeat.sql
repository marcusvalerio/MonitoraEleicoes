-- Batimento do worker por debate: permite ao /ao-vivo distinguir "online" de "sem sinal" sem inventar estado.
alter table debate_control add column if not exists last_heartbeat_at timestamptz;
alter table debate_control add column if not exists last_error_at timestamptz;
alter table debate_control add column if not exists last_error text;
