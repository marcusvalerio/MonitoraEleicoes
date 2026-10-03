@AGENTS.md

# Monitora Eleições — notas para agentes

- Rode `npm run check` (typecheck, lint, vitest, build) antes de commitar.
- Nunca produzir juízo político automático (ver `src/domain/guards.ts`); testes verificam isso.
- RAW (transcript_segment) nunca é alterado; classificações de IA são separadas e versionadas.
- Aplicação real = SOMENTE dados reais (perfil `live`, padrão). `demo`/`fixture` são fictícios e só existem para testes automatizados (`MONITORA_ALLOW_SYNTHETIC=1`), nunca em produção. Nunca inventar números eleitorais; ausência ≠ 0.
- Cores de candidatos são identidade (validadas p/ daltonismo); cores semânticas só para tom/estado.
- Fluxo: providers (RAW) → normalization → ingestion/store → repository → analytics → services → UI. Não importe `data/demo` fora de `providers/demo` e `providers/fixture`.
- Seleção de providers somente em `src/providers/registry.ts` (`DATA_MODE=demo|fixture|live`).
- Afirmações geradas não podem conter linguagem causal (`domain/statements.ts`).
- Dados reais ficam em `data/real/<evento>` e entram por `providers/files` (`DATA_MODE=live`). Nunca invente timestamps (`startOffset = null` + `timing.precision`) nem assuma orador (`orador-desconhecido`).
- Páginas são dinâmicas (layout `force-dynamic`): o perfil de dados é resolvido em tempo de execução, nunca no build.
- E2E: `npm run e2e` (demo/fixture via `BASE_URL`/`DEBATE_ID`) e `npm run e2e:real` (perfil live).
