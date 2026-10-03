# Apuração oficial 2026 (sistema de divulgação do TSE)

Fonte: arquivos públicos de `https://resultados.tse.jus.br/oficial` (somente GET, sem autenticação).
Código: `src/elections/apuracao/` · leitura: `src/analytics/apuracao.ts` · UI: `/eleicoes?ano=2026`.

## Descoberta (nada de URL de eleição fixa)

`comum/config/ele-c.json` → pleito do ciclo `ele2026` → eleições (`cd`, `cdt2` para o 2º turno) e cargos (`abr[].cp[]`, tipo 1 majoritário / 2 proporcional)
→ `ele2026/<código>/dados/<uf>/<abrangência>-c<cargo:4>-e<código:6>-u.json`.
Em 2026-10-01: Federal = 6257 (Presidente; 2º turno 6258), Estadual = 6259 (Governador, Senador, Dep. Federal/Estadual/Distrital; 2º turno 6260).

Validado com arquivos reais (`src/elections/apuracao/fixtures/`, sem edição): Presidente BR e Governador AC de 2026 (pré-eleição)
e Prefeito São Paulo 2024 (totalizado). Em 2024 o resultado final está no próprio `-u.json` (não há `-r.json`); `-ab.json` e `-r.json`
retornam 404 em 2026.

**Anti-SSRF**: `assertAllowedUrl` aceita só `https://resultados.tse.jus.br/oficial/…` (sem credenciais, porta 443); redirecionamentos recusados.

## Ausência ≠ zero

| Situação no arquivo | Monitora |
|---|---|
| arquivo 404 (não publicado) | estado **Dado indisponível**; nenhum número |
| `s.st` (seções totalizadas) = 0 | fase `not_started` → **Não iniciada**; comparecimento, votos e % = `not_collected` (o TSE publica "0", que não é 0 voto) |
| `st` > 0, `tf` ≠ "s" | `partial` → **Em apuração** (coleta em dia) ou **Parcial** (coleta atrasada/falhando, > 15 min) |
| `tf` = "s" | `final` → **Totalizada** |
| campo ilegível | `not_available` |
| nada coletado | **Não coletada** |

Eleitorado (`e.te`) e total de seções (`s.ts`) são cadastrais e valem antes da apuração. Zero publicado após o início da totalização é valor real.

## Worker

```
NODE_USE_ENV_PROXY=1 node scripts/ingest.mjs --env development --apuracao [--year 2026] [--round 1] \
  [--interval 60] [--once] [--offices 1,3,5,6,7,8] [--ufs SP,RJ] [--municipios] [--proporcionais-a-cada 5]
```
Produção exige `--confirm-production` **e** a migration 0008 aplicada com confirmação.

- **Idempotente**: checkpoint por arquivo (`ingestion_checkpoint`, stream `apuracao:<ano>:<turno>:<cargo>:<abrangência>`), cursor = hash do conteúdo
  apurado (ignora `dg/hg/idg`, que mudam em republicações sem alterar números). Retrato único por `(ano, turno, cargo, território, hash)`.
- **Proveniência**: `source_record` por arquivo (URL, ETag, Last-Modified, data de geração, horário de coleta, sha256 do corpo); `raw_record` imutável;
  cada retrato aponta para fonte, RAW e execução (`ingestion_run`, kind `election:count`). Falhas em `ingestion_error`; estado da última tentativa em `<stream>:status`.
- **Tolerância**: falha de um arquivo não interrompe os demais; último retrato válido é preservado; retentativa com backoff (5xx/rede).
- **Reprocessamento**: apagar checkpoints e rodar de novo não duplica nada (testado).
- `sqcand` do arquivo = `SQ_CANDIDATO` ⇒ vínculo com `candidacy` e, por ela, com a identidade histórica.

## Granularidade e armazenamento (Neon 512 MB)

| Cargo | Abrangência coletada | Histórico |
|---|---|---|
| Presidente | BR + 27 UFs (+ municípios com `--municipios`) | todos os retratos e RAW |
| Governador, Senador | 27 UFs (+ municípios com `--municipios`) | todos os retratos e RAW |
| Dep. Federal/Estadual/Distrital | UF | cabeçalho de todos os retratos; votação por candidatura só no mais recente; RAW nos marcos (1º arquivo, mudança de fase, final, ≤ 1 a cada 30 min) |

Medido no dev (pré-eleição): uma passada majoritária BR+UF ≈ 0,3 MB de RAW; proporcional por UF ≈ 4 MB (1,2 MB de RAW comprimido).
Zona eleitoral **não** é coletada (o armazenamento atual não comporta).

## Migration 0008 — reconstrução

`0008_official_count.sql` foi aplicada em dev/test (2026-10-01 00:19–00:23 UTC) por uma sessão anterior cujo arquivo não chegou ao Git.
O arquivo foi reconstruído a partir do catálogo do banco e verificado aplicando-o num schema temporário: **75/75** colunas, restrições e
índices idênticos. O checksum registrado em `schema_migrations` (dev e test) foi atualizado de `a596a1f0…e9a` para o do arquivo reconstruído
(`4de7b3e1…bdc7`). Produção não tem 0008.

Os 82 retratos pré-eleição gravados pela sessão anterior no dev usam outro critério de hash (corpo do arquivo); foram mantidos. A leitura usa
sempre o retrato mais recente.
