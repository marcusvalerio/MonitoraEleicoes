# Metodologia (resumo técnico)

A versão pública está em `/methodology`. Este documento resume o que o código garante.

- **Princípio**: nenhum ranking, "vencedor", score político, previsão ou recomendação de voto. Guardas: `domain/guards.ts` e `domain/statements.ts` (testados).
- **Transcrição**: segmento = turno contínuo de um orador; publicado só quando termina. Texto original imutável.
- **Classificação**: tema, subtema, tipo, tom, alvo, menções, fact-check, confiança — com modelo/versão/prompt. Saída validada; inválida é rejeitada e reportada.
- **Relevância**: soma de critérios objetivos (afirmação verificável, medida concreta, menção, resposta direta, variação social), faixas alta ≥ 0,60 / média ≥ 0,35.
- **Eventos**: derivados de dados existentes; cada evento separa fato, medição e interpretação. Interpretações só expressam associação temporal.
- **Repercussão**: volume e comportamento da conversa; plataformas têm acessos distintos (não comparáveis como amostra da população). Menções ≠ apoio.
- **Mapa**: ver `docs/GEO.md` (cobertura sempre informada).
- **Dados oficiais**: TSE é a única fonte de resultados; nada é estimado. Ausência = `not_collected`.
- **Dados ausentes**: `DataValue` (ver `docs/PROVENANCE.md`).
