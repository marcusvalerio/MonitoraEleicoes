# Provedores sociais — matriz de acesso

Verificado em 2026-09 por requisição sem credencial (coluna “Sonda”). Nada de scraping, endpoints privados,
contorno de autenticação/CAPTCHA/rate limit ou credenciais falsas. Sem API adequada ⇒ `unsupported` /
`requires_authorization` / `limited`, documentado — a fonte não pode ser ativada.

| Plataforma | API oficial | Autenticação | Custo | Sonda | Estado no Monitora |
|---|---|---|---|---|---|
| YouTube | Data API v3 (`search`, `videos`, `commentThreads`) | API key | gratuito na cota (10 000 un./dia; search = 100, videos/comments = 1) | 403 sem chave | **implementado**; `configured` com `YOUTUBE_API_KEY` |
| Bluesky | AT Protocol `searchPosts` | conta + app password | gratuito | 403 no AppView público | `requires_authorization` (não implementado) |
| Reddit | Data API OAuth | app OAuth | gratuito não comercial | 403 | `requires_authorization` |
| X | API v2 `tweets/search/recent` | bearer do app (`X_API_BEARER_TOKEN`) | pago (por post lido) | 401 | **implementado**; `configured` com token |
| Instagram | Graph API / Meta Content Library | app revisado / pesquisador | — | 400 | `requires_authorization` |
| Facebook | Graph API (Page Public Content Access) / Meta Content Library | revisão de app pela Meta ou pesquisador aprovado | — | 400 | `requires_authorization` — integrar só após aprovação |
| Threads | Threads API keyword search | revisão Meta | — | não testado | `requires_authorization` |
| TikTok | Research API | pesquisador acadêmico | — | 404 | `unsupported` |

Fonte de verdade: `src/providers/social/catalog.ts` (`PLATFORM_MATRIX`), sincronizada em `social_source`.

## YouTube (`src/providers/youtube`)

- Busca por termo (`order=date`, `regionCode=BR`, `relevanceLanguage=pt`) → estatísticas → comentários.
- Orçamento por execução `YOUTUBE_QUOTA_PER_RUN` (padrão 1500); esgotado ⇒ coleta `partial`.
- `quotaExceeded` ⇒ janela `rate_limited` e fonte `error` (sem retentativa); `rateLimitExceeded`/429 ⇒ retentativa com backoff;
  chave inválida ⇒ `requires_authorization`. Comentários desativados são ignorados.
- Métricas ausentes (ex.: likes ocultos) ficam ausentes, nunca 0.
- Validação real pendente: requer `YOUTUBE_API_KEY` no ambiente (neste container, `NODE_USE_ENV_PROXY=1`).

## X (`src/providers/x`)

- Prioridade 1 da conversação pública. `tweets/search/recent` (últimos 7 dias; `end_time` ≤ agora − 10 s).
- Termos do monitor agrupados em consultas OR de até 512 caracteres, com `lang:pt -is:retweet`.
- Orçamento `X_MAX_POSTS_PER_RUN` (padrão 500): esgotado ⇒ janela `partial`. Janela anterior a 7 dias ⇒ `partial`.
- 401/403 ⇒ `requires_authorization`; 429 ⇒ rate limited (usa `x-rate-limit-reset`); 402/créditos esgotados ⇒ não retentável; 5xx ⇒ indisponível.
- Autor só em HMAC (`IDENTITY_HASH_KEY`); sem @/nome. Métricas: `public_metrics` (impressões só quando a API devolve).
- RAW: `x.post/v1`, `x.post-metrics/v1`. Sem token: nenhum post, nenhuma simulação.

## Facebook

Coleta legítima de conteúdo público exige **Page Public Content Access** (revisão de app pela Meta) ou acesso de pesquisador à
**Meta Content Library**. Sem essa aprovação a fonte permanece `requires_authorization` e não exibe nada. Quando aprovada, entra como
novo `SocialListeningProvider` (mesmo contrato do X/YouTube).
