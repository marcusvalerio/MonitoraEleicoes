# Metodologia (resumo técnico)

A versão pública está em `/methodology`. Este documento resume o que o código garante.

- **Princípio**: nenhum ranking, "vencedor", score político, previsão ou recomendação de voto. Guardas: `domain/guards.ts` e `domain/statements.ts` (testados).
- **Transcrição**: segmento = turno contínuo de um orador; publicado só quando termina. Texto original imutável.
- **Classificação**: tema, subtema, tipo, tom, alvo, menções, fact-check, confiança — com modelo/versão/prompt. Saída validada; inválida é rejeitada e reportada.
- **Classificador por regras v2** (`rule-based-classifier` 0.2.1, `keywords-v2`): temas por pontuação ponderada — termos fortes valem 2, fracos (ex.: "família", "bolso") valem 1; um tema exige pontuação ≥ 2 **e** ao menos um termo forte, senão `outros`. Tipos de fala por regras ordenadas (moderação → pergunta → defesa → ataque → comparação → crítica → proposta com verbo de ação → resposta → informação). Confiança = f(pontuação, margem), máx. 0,88; sem tema = 0,35. É baseline auditável, não classificador de produção.
- **Relevância** (`criteria-sum` v2): soma de critérios objetivos (afirmação verificável, medida concreta, menção, resposta direta, variação social), faixas alta ≥ 0,60 / média ≥ 0,35. "Afirmação verificável" v2 ignora números de urna ("vote 30"), anos e datas; exige quantidade com unidade (%, mil, milhões, reais, anos, obras…) ou número com 3+ dígitos.
- **Classificador LLM (contrato, `ai/llm.ts`)**: saída estruturada (JSON Schema com enums fechados) → validação de esquema → validação de domínio (não troca orador, não menciona ids desconhecidos, sem juízo político nem linguagem causal) → pipeline → banco. O LLM nunca escreve no banco. Fallback para regras registra o modelo que efetivamente respondeu. Sem cliente configurado, usa-se o classificador por regras.
- **Latência ao vivo** (`domain/live.ts`): medianas de captura, ingestão, análise, processamento e ponta a ponta; ausente = "—".
- **Versionamento**: cada análise guarda método, modelo, versão, prompt e versão da metodologia de relevância; reanálises coexistem com as anteriores.
- **Eventos**: derivados de dados existentes; cada evento separa fato, medição e interpretação. Interpretações só expressam associação temporal.
- **Repercussão**: volume e comportamento da conversa; plataformas têm acessos distintos (não comparáveis como amostra da população). Menções ≠ apoio.
- **Mapa**: ver `docs/GEO.md` (cobertura sempre informada).
- **Dados oficiais**: TSE é a única fonte de resultados; nada é estimado. Ausência = `not_collected`.
- **Dados ausentes**: `DataValue` (ver `docs/PROVENANCE.md`).
