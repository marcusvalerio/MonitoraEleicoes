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
4. **Correção da heurística de "afirmação verificável"** (excluir números de urna/anos isolados) — mudança de metodologia a ser documentada.
5. **Ingestão incremental persistente** (workers + PostgreSQL) em vez do store em memória montado na primeira requisição.
6. **Identificadores oficiais** (TSE) para candidatos — próxima integração.
7. **Provider social real** para repercussão (hoje `not_configured`).
