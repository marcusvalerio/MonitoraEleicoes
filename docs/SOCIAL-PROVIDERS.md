# Provedores sociais — matriz de acesso

Verificado em 2026-09 por requisição sem credencial (coluna “Sonda”). Nada de scraping, endpoints privados,
contorno de autenticação/CAPTCHA/rate limit ou credenciais falsas. Sem API adequada ⇒ `unsupported` /
`requires_authorization` / `limited`, documentado — a fonte não pode ser ativada.

| Plataforma | API oficial | Autenticação | Custo | Sonda | Estado no Monitora |
|---|---|---|---|---|---|
| YouTube | Data API v3 (`search`, `videos`, `commentThreads`) | API key | gratuito na cota (10 000 un./dia; search = 100, videos/comments = 1) | 403 sem chave | **implementado**; `configured` com `YOUTUBE_API_KEY` |
| Bluesky | AT Protocol `searchPosts` | conta + app password | gratuito | 403 no AppView público | `requires_authorization` (não implementado) |
| Reddit | Data API OAuth | app OAuth | gratuito não comercial | 403 | `requires_authorization` |
| X | API v2 search/recent | bearer de plano pago | pago | 401 | `requires_authorization` |
| Instagram | Graph API / Meta Content Library | app revisado / pesquisador | — | 400 | `requires_authorization` |
| Facebook | Graph API (Page Public Content Access) / MCL | revisão Meta | — | 400 | `requires_authorization` |
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
