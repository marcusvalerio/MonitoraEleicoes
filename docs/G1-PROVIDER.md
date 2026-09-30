# G1LiveEditorialProvider — cobertura editorial ao vivo do g1

> O g1 é tratado como **fonte de cobertura editorial em tempo real**, não como transcrição do debate.
> Uma atualização "21h14 — X questiona Y sobre segurança" vira um **evento editorial** atribuído ao g1,
> nunca "X disse exatamente…".

## Como funciona

```
debate_source (URL, intervalo, ativa)          ← /admin/debates → Fontes  (sem alterar código)
        │  worker --live (a cada ciclo; respeita polling_interval_ms)
        ▼
G1LiveEditorialProvider.fetchUpdates()        ← GET da página pública (timeout 10 s, sem cookies/autenticação)
        │  parseG1LivePage: JSON-LD → microdata
        ▼
RAW  g1.live-post/v1  (source_record + raw_record versionado por hash; fragmento original ≤ 20 KB)
        ▼
normalização → EditorialUpdate (FATO: texto original, horário da fonte, URL, hash, parser)
        ▼
classifyEditorial (regras v1) → EditorialAnalysis (INTERPRETAÇÃO versionada, com confiança e evidência)
        ▼
Neon: editorial_event / editorial_analysis → Repository.getLiveState(…, eafter) → /ao-vivo · Overview · Fontes
```

Mesmo pipeline de todos os providers (`ingestion/pipeline.ts`): retry/backoff, isolamento de falhas, RAW gravado por último, dedup por hash.

## Fonte e estratégia de extração

Observado na página pública de cobertura ao vivo (`https://g1.globo.com/…/eleicoes/2026/ao-vivo/<slug>.ghtml`, set/2026):

| Prioridade | Estratégia | Onde | Uso |
|---|---|---|---|
| 1 | **JSON-LD** schema.org | `<script type="application/ld+json">` com `@type: LiveBlogPosting` → `liveBlogUpdate[]` de `BlogPosting` | `articleBody` (texto), `headline`, `datePublished`, `dateModified`, `url` com `?postId=<uuid>` (id estável) |
| 2 | **Microdata** | `itemprop="liveBlogUpdate"` + `itemprop="articleBody"` + `<time datetime>` / `itemprop="datePublished"` | alternativa se o JSON-LD sumir |
| — | `window.__PRELOADED_STATE__` | avaliado | contém só metadados da página (não os posts) — não usado |
| — | DOM/classes CSS (`post-view`, `cb-post…`) | avaliado | posts renderizados no cliente; seletores de layout são frágeis — não usados |

A página traz duas variantes do JSON-LD (canônica e AMP); os posts são unidos por `postId` (sem duplicar).
Página sem nenhuma das estruturas ⇒ `InvalidResponse` ("estrutura inesperada") — falha controlada, registrada em `ingestion_run`/`ingestion_error`; nunca "0 atualizações" silencioso.

Não fazemos: scraping de APIs internas, cookies, login, contorno de DRM, extração do Globoplay. `robots.txt` do g1 não bloqueia `/…/ao-vivo/`. User-Agent identificado (`MonitoraEleicoes/0.9`). Intervalo mínimo 5 s por fonte.

## Janela, edição e remoção

- O JSON-LD expõe as **~10 atualizações mais recentes**. Com polling de 5–15 s isso cobre o ritmo de um debate; se a fonte publicar mais que isso entre duas coletas, os excedentes não são vistos (limitação declarada).
- **Edição** na origem ⇒ novo hash ⇒ nova versão em `raw_record` e `editorial_event.version + 1`; a versão anterior do RAW e a análise anterior permanecem.
- **Remoção**: post ausente **mais novo** que o mais antigo visível ⇒ `removed_at` (nunca apagado). Post ausente **mais antigo** que a janela ⇒ apenas saiu da página (não é remoção). Reaparecimento desfaz a marcação.

## Proveniência

`editorial_event` guarda: `external_id` (`<debate>#<postId>`), `url`, `published_at` (NULL se a fonte não informar — `time_precision = unknown`), `modified_at`, `collected_at`, `ingested_at`, `content_hash`, `parser_version` (`g1-parse/1.0.0`), `strategy`, `source_record_id` → `raw_record` (payload + `ingestion_run_id`).

## Classificação (interpretação — nunca altera o texto)

`ai/editorial.ts` (`editorial-rules 1.0.0`, `editorial-methodology/1`):

- **Tipo de evento** (abertura, pergunta, resposta, réplica, tréplica, ataque, defesa, proposta, crítica, mudança de tema, direito de resposta, intervalo, encerramento, consideração final, outro) só por marcador explícito no texto; sem marcador ⇒ `unknown`. Confiança: marcadores estruturais (réplica, intervalo…) = alta; verbos (questiona, ataca…) = média.
- **Candidatos**: nome completo ou apelido do registro (≥ 4 letras, não ambíguo, limite de palavra). Ator/alvo só com padrão "X <verbo> Y"; senão apenas "citados". Sem resolução ⇒ `unknown` (o evento não é rejeitado).
- **Tema**: motor de temas existente (exige termo forte) + evidências (termos encontrados); sem evidência ⇒ `unknown`. Paráfrase editorial ⇒ confiança máxima "média".
- **Bloco**: sinal explícito ("segundo bloco", "intervalo", "considerações finais").
- **Relevância** (`editorial-criteria/1`): ator nomeado, alvo nomeado, tipo substantivo, tema conhecido — critérios gravados.

Fato (texto do g1) × medição (contagens, horários, frequência — `analytics/editorial.ts`) × interpretação (tipo, tema, relevância) ficam separados. "Mais mencionado" ≠ "mais apoiado" (aviso exibido na UI).

## Latência

`latência de coleta` = `collected_at − published_at` (mediana dos 20 mais recentes; inclui o intervalo de polling). Sem horário da fonte ⇒ "—". Exibida em Fontes.

## Condições de falha

| Situação | Resultado |
|---|---|
| Rede/timeout/HTTP 5xx | `provider_unavailable` (retentável, backoff) → run `failed` + `ingestion_error`; `debate_source.last_error` |
| HTTP 429 | `rate_limited` (respeita `Retry-After`) |
| HTTP 4xx | `invalid_response` (não retentável) |
| Estrutura inesperada | `invalid_response` "estrutura inesperada" |
| Post sem texto / debate desconhecido | `normalization_error` por post; demais seguem |
| g1 fora do ar | só a etapa g1 falha; eleição, transcrição, replay continuam |
| URL fora da allowlist | recusada no cadastro e na coleta (defesa contra SSRF) |

Allowlist: somente `https://g1.globo.com/…/ao-vivo/…`. `G1_ALLOWED_HOSTS` (variável de servidor) só acrescenta hosts de fixture de teste.

**Rede do ambiente**: o `fetch` do Node não lê `HTTPS_PROXY`. Em ambientes com proxy obrigatório (ex.: containers Claude Code), rode worker/CLI com `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21). Sem isso, o proxy de saída responde 403 — o provider registra a falha normalmente.

## Operação

```bash
npm run ingest:g1 -- --dry-run --url <URL>                 # coleta real, extrai e classifica; NÃO grava
npm run ingest:g1 -- --env development --url <URL>         # uma coleta gravada (ingestion_run)
npm run ingest:g1 -- --env production --confirm-production # produção exige confirmação
```

Debate presidencial 01/10/2026: `data/real/presidencial-2026-10-01/manifest.json` com `sourceUrl = "pending"`. **Falta**: (1) URL oficial da cobertura ao vivo do g1 (ainda não publicada); (2) lista oficial de participantes (sem ela, candidatos citados ficam "não identificado"); (3) horário e emissora confirmados. Quando a URL existir: `/admin/debates` → cadastrar `presidencial-2026-10-01` (provider `manifest-only`) → Fontes → URL → Testar conexão → Iniciar ingestão. Nenhuma mudança de código.

## Validação real (30/09/2026)

`--dry-run` contra uma cobertura pública existente (debate ao governo da Bahia): 10 atualizações via JSON-LD, horários exatos, tipos `unknown` quando o texto não é explícito, "considerações finais" reconhecida, candidatos "não identificado" (sem registro daquele debate). Limitação observada: um post sobre acidente citando hospital recebeu tema "saúde" (confiança baixa).

## Limitações

Cobertura editorial é paráfrase do veículo (não fala literal); janela de ~10 posts; ritmo depende da redação; classificação por regras é baseline (LLM com saída validada está preparado em `ai/llm.ts`); sem registro de candidatos, não há resolução de nomes.
