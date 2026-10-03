# Social listening

Monitoramento das **fontes conectadas e disponíveis** — não “toda a internet”. Só APIs oficiais e documentadas.

## Fluxo

`social_monitor` (admin) → `socialTick` (`src/ingestion/social-worker.ts`, `node scripts/ingest.mjs --env … --social`)
→ provider (`SocialListeningProvider`) → RAW (`raw_record`, imutável) → normalização (`social_record`, versão por hash)
→ análise por regras versionada (`src/ai/social.ts`, `social-rules/1.0.0`) → `social_analysis` + `social_record_entity`
→ janelas de coleta (`social_collection_window`) → analytics SQL (`src/analytics/social-listening.ts`) → `/monitoramento`.

## Regras

- **Menção ≠ apoio.** `mention_type`: `mencao`, `apoio_explicito`, `critica_explicita`, `comparacao`, `pergunta`, `noticia`, `ironia` (nunca atribuída por regras).
  Negações (“não voto no X”, “nunca vou votar no X”) são verificadas antes de apoio.
- Sentimento do **conteúdo** ≠ sentimento **em relação à entidade**. Sem evidência ⇒ `incerto`.
- Entidades só por nome completo/de urna não ambíguo (≥ 5 letras) ou sigla de partido em maiúsculas.
- Geografia só com evidência (`geo_source`: `declarada`, `mencao_explicita`, `institucional`, `estruturada`; senão `nenhuma`). Localização de pessoa nunca é inferida.
- Autores: apenas HMAC; nomes de comentaristas não são coletados.
- **Não coletado ≠ 0.** KPIs retornam `null` quando não há janela coletada no período; falhas geram janelas `rate_limited`, `requires_authorization`, `unsupported` ou `failed` (itens nulos).
- Variação vs período anterior só se o anterior também foi coletado.
- Debate × social: contagens antes/durante/depois (`src/analytics/debate-social.ts`) — “associado temporalmente ao evento”, nunca causal.

## Testes

`src/ingestion/social.db.test.ts` (fixture YouTube → Neon → analytics), `src/providers/youtube/youtube.test.ts` (inclui o classificador),
E2E `npm run e2e:intel`.
