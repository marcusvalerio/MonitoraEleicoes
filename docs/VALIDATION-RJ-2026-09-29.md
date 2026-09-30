# Validação · Debate para o Governo do RJ · TV Globo · 29/09/2026

Objetivo: testar o motor com dados reais. **Não é uma análise política do debate.**

## 1. Fonte utilizada

| Prioridade | Fonte | Situação |
|---|---|---|
| Transcrição oficial | TV Globo / g1 | Não publicada. |
| Legenda da transmissão | g1 / Globoplay | Vídeo em streaming protegido; nenhum arquivo de legenda público. Extração seria frágil e fora do escopo. |
| Transcrição do vídeo (ASR) | — | Exigiria baixar o stream e um modelo de ASR (não disponível no ambiente). |
| **Fonte textual estruturada** | **Manchete Rio, 30/09/2026** | **Usada.** A matéria transcreve literalmente as considerações finais dos 5 candidatos. |

- URL: https://mancheterio.com.br/debate-no-rj-tem-ataques-a-paes-e-ruas-e-discussoes-sobre-aliancas-politicas-seguranca-educacao-e-transporte/
- Publicação: 30/09/2026 06:18:14 (fuso não informado; assumido −03:00)
- SHA-256 do documento coletado: `f00c4926530783faa1c65abc58ff8489ecf7fcb189e2d79cca8fef4fac376a7c`
- Extração reprodutível: `scripts/extract-press-final-statements.py` (sem reescrita; só junta parágrafos de cada fala e remove as aspas externas)
- Fontes auxiliares (horário, mediação, participantes): Diário do Rio, Exame.

## 2. Cobertura

- **1 de 5 blocos** (considerações finais). Blocos 1–4 **não** têm transcrição literal disponível — a matéria só os descreve em paráfrase jornalística, que **não** foi usada como fala.
- 5 segmentos · 764 palavras (contagem do domínio: sequências de letras/números) · 5/5 candidatos com fala.
- Timestamps: **0 de 5** (precisão `block`). Nenhum horário foi estimado.
- Ordem das falas = ordem da matéria (não necessariamente a da transmissão).

## 3. Oradores

- Resolvidos: 5/5 contra entidades `Candidate → Party` do registro (`data/real/rj-governador-2026-09-29/registry.json`).
- Método: `press_attribution` (o nome do orador vem do intertítulo da matéria) → `speakerConfidence = medium`.
- Não identificados: 0.
- Identificadores oficiais do TSE: **não coletados** (`tseId: null`).

## 4. Amostra — transcrição × classificação (classificador por regras, `rule-based-classifier 0.1.0`)

Amostra = 100% dos segmentos disponíveis (5).

| Orador | Tema | Tipo | Tom | Relevância | Conf. | Fact-check | Avaliação manual |
|---|---|---|---|---|---|---|---|
| André Marinho | Assistência social | Resposta | Informativo | baixa (0,30) | 0,80 | verificar | **Erro de tema**: "família" disparou assistência social; a fala é um apelo final genérico (mudança/esperança). **Tipo impreciso**: não é resposta. Fact-check disparado pelo número de urna "30" — falso positivo. |
| Douglas Ruas | Segurança | Crítica | Crítico | média (0,45) | 0,60 | verificar | Tema parcialmente defensável (cita "show na segurança"), mas a fala é sobretudo comparação política e apelo ao voto. Menções a Paes e Garotinho corretas. Fact-check por "13 anos"/números de urna — misto. |
| Eduardo Paes | Outros | Proposta | Propositivo | **alta (0,70)** | 0,40 | verificar | **Tipo incorreto**: "Nós vamos" disparou proposta, mas a fala é crítica ao grupo político adversário. Relevância alta inflada por anos (2018, 2022) contados como "afirmação verificável". Menção a Ruas correta. Confiança baixa corretamente sinalizada. |
| William Siri | Assistência social | Crítica | Crítico | média (0,45) | 0,80 | verificar | **Erro de tema** ("família"). Menção a Ruas correta. Número de urna "50" como afirmação verificável — falso positivo. |
| Anthony Garotinho | Segurança | Resposta | Informativo | baixa (0,30) | 0,80 | verificar | Tema defensável (Bope, segurança pública). **Tipo impreciso** (não é resposta; é autodefesa/apelo). |

## 5. Problemas encontrados (não mascarados)

1. **Classificador por palavras-chave é inadequado para fala real**: 2/5 temas errados, 3/5 tipos imprecisos; a confiança (0,80) é superestimada nesses erros.
2. **Afirmação verificável** trata números de urna e anos como dados checáveis → relevância e fact-check inflados.
3. **Taxonomia de tipo de fala** não tem categoria para "consideração final / apelo ao voto"; o classificador força "resposta" ou "proposta". Extensão sugerida (não aplicada): `apelo`.
4. Temas regionais recorrentes na cobertura (transporte, saneamento, dívida do estado) caem em `infraestrutura`/`economia` ou `outros` — a taxonomia é nacional. Comparação com a cobertura jornalística deve ser feita depois, sem ajustar o classificador a este debate.
5. Sem timestamps, não há replay por relógio, eventos temporais, heatmap nem série de volume de fala.

Nenhum ajuste foi feito no classificador para "acertar" estas 5 falas.

## 6. Fato × medição × interpretação (exemplos gerados)

- **Fato**: "Douglas Ruas mencionou Eduardo Paes e Anthony Garotinho nas considerações finais."
- **Medição**: "Segurança foi o tema atribuído a 2 dos 5 segmentos."
- **Interpretação** permitida: "Segurança concentrou mais segmentos na amostra disponível (considerações finais)." — nunca "foi o assunto mais importante para os eleitores".

## 7. Conclusão técnica

O fluxo **fonte real → RAW → normalização → segmentos → classificação → domínio → analytics → UI** funcionou sem caminho especial: o mesmo pipeline, os mesmos normalizadores genéricos de arquivo e as mesmas funções de analytics de DEMO/FIXTURE.

O motor **não está pronto** para debates reais ao vivo. Faltam:

1. **Fonte de texto com tempo**: provider de legenda/ASR ao vivo (stream de áudio → segmentos com `start/end`), ou acordo de acesso a legendas da emissora.
2. **Diarização**: identificar orador automaticamente (hoje depende de rótulo na fonte ou mapa manual).
3. **Classificador real**: LLM com saída estruturada validada (o contrato já existe); o de palavras-chave não serve para produção.
4. ~~Correção da heurística de "afirmação verificável"~~ — feita na v2 (ver §8).
5. ~~Ingestão incremental persistente~~ — feita na Fase 0.7 (`docs/INGESTION.md`).
6. **Identificadores oficiais** (TSE) para candidatos — próxima integração.
7. **Provider social real** para repercussão (hoje `not_configured`).

## 8. Reavaliação — classificador por regras v2 (Fase 0.7)

Mudanças **genéricas** (nenhuma regra citando estas falas): temas por pontuação ponderada com exigência de termo forte; "afirmação verificável" ignora números de urna, anos e datas; tipos de fala com regras de defesa/ataque/comparação e "proposta" exigindo verbo de ação. Versões: `rule-based-classifier 0.2.1 / keywords-v2`, relevância `criteria-sum v2`. O dataset está persistido no Neon (`dataset validation-rj-2026-09-29`, kind `validation`) em dev e produção; as análises v1/0.2.0 continuam no banco ao lado das 0.2.1.

| Fala | v1 (tema · tipo · relevância · fact-check) | v2 0.2.1 | Avaliação |
|---|---|---|---|
| André Marinho | Assist. social · resposta · baixa · verificar | Outros · resposta · baixa (0,00) · não necessário | Tema corrigido ("família", "dinheiro", "bolso" são fracos). Fact-check por "30" eliminado. Tipo ainda impreciso (é apelo final; taxonomia não tem `apelo`). |
| Douglas Ruas | Segurança · crítica · média · verificar | Educação · crítica · média (0,45) · verificar | Tema **discutível**: 1 termo forte ("educação") contra 1 fraco ("segurança"); a fala é sobretudo comparação política. Crítica correta. |
| Eduardo Paes | Outros · proposta · **alta** · verificar | Outros · ataque · baixa (0,15) · não necessário | "Proposta" e relevância inflada por anos corrigidas. "Ataque" vem de "enganar" + menção — defensável como crítica dura, mas o rótulo é forte. |
| William Siri | Assist. social · crítica · média · verificar | Outros · defesa · baixa (0,15) · não necessário | Tema corrigido. **Tipo errado**: "eu não fujo" disparou defesa; a fala critica Ruas. |
| Anthony Garotinho | Segurança · resposta · baixa · verificar | Segurança · defesa · baixa (0,00) · não necessário | Tema correto; "defesa" coerente com a autodefesa ("fui eu que fiz"). |

Resultado honesto: temas 4/5 aceitáveis (antes 3/5); falsos positivos de fact-check eliminados (0/5, antes 5/5 "verificar"); tipos continuam frágeis (2/5 discutíveis). Confirma a conclusão da §7: regras são baseline auditável; produção exige classificador com saída estruturada validada e revisão humana amostral. Nenhum ajuste foi feito para "acertar" estas falas — o caso Siri permanece errado de propósito como registro.
