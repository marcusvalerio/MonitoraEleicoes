@AGENTS.md

# Monitora Eleições — notas para agentes

- Rode `npm run check` (typecheck, lint, vitest, build) antes de commitar.
- Nunca produzir juízo político automático (ver `src/domain/guards.ts`); testes verificam isso.
- RAW (transcript_segment) nunca é alterado; classificações de IA são separadas e versionadas.
- Dados demo sempre com `provenance.mode = "demo"`; nunca inventar números eleitorais.
- Cores de candidatos são identidade (validadas p/ daltonismo); cores semânticas só para tom/estado.
- Fluxo: providers (RAW) → normalization → ingestion/store → repository → analytics → services → UI. Não importe `data/demo` fora de `providers/demo` e `providers/fixture`.
- Seleção de providers somente em `src/providers/registry.ts` (`DATA_MODE=demo|fixture|live`).
- Afirmações geradas não podem conter linguagem causal (`domain/statements.ts`).
