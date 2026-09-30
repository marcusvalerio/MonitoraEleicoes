import type { Metadata } from "next";
import { getRepository } from "@/repository";
import { RELEVANCE_THRESHOLDS, RELEVANCE_WEIGHTS } from "@/domain/relevance";
import { FACT_CHECK_LABEL, SPEECH_TYPE_LABEL, TONE_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { FACT_CHECK, SPEECH_TYPES, TONES, TOPICS } from "@/domain/types";
import { DemoBadge, PageHeader, Tag } from "@/components/ui/primitives";
import { NatureLegend } from "@/components/debate/NatureLegend";

export const metadata: Metadata = { title: "Metodologia" };

const SECTIONS = [
  ["principios", "Princípios"],
  ["natureza", "Natureza dos dados"],
  ["transcricao", "Transcrição"],
  ["segmentacao", "Segmentação"],
  ["classificacao", "Classificação"],
  ["relevancia", "Relevância"],
  ["tom", "Tom"],
  ["eventos", "Eventos"],
  ["redes", "Redes sociais"],
  ["mapa", "Mapa de repercussão"],
  ["oficiais", "Dados oficiais"],
  ["humana", "Análise humana"],
  ["limitacoes", "Limitações"],
  ["configuracao", "Modo de dados"],
] as const;

function S({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-7 first:border-0 first:pt-0">
      <h2 className="font-display text-[20px] font-semibold tracking-tight text-fg">{title}</h2>
      <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-fg-2 [&_strong]:font-medium [&_strong]:text-fg">{children}</div>
    </section>
  );
}

export default async function MethodologyPage() {
  const repo = await getRepository();
  const mode = repo.mode;
  const ai = (await repo.getReports()).find((r) => r.kind === "ai:classification");
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6">
      <PageHeader eyebrow="Metodologia · v1" title="Como o Monitora Eleições funciona" description="Não dizemos ao usuário o que pensar. Explicamos como cada dado foi obtido, transformado e classificado — e onde estão os limites." />
      <div className="mt-8 grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Seções" className="hidden lg:block">
          <ol className="sticky top-20 space-y-1 text-[12.5px]">
            {SECTIONS.map(([id, l]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-[var(--radius-sm)] px-2 py-1 text-fg-3 hover:bg-surface hover:text-fg">{l}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-[720px]">
          <S id="principios" title="Princípios">
            <p>O Monitora Eleições é uma ferramenta de <strong>data journalism e tecnologia cívica</strong>, não de campanha. A plataforma nunca produz: ranking de candidatos, “quem ganhou o debate”, notas de competência ou caráter, previsões de vitória ou recomendações de voto.</p>
            <p>Apresentamos fatos, transcrições, classificações transparentes, métricas e contexto. <strong>A interpretação é do usuário.</strong> Proximidade temporal entre eventos e volume de publicações nunca é apresentada como causalidade.</p>
          </S>
          <S id="natureza" title="Natureza dos dados">
            <p>Toda informação é marcada com uma de quatro naturezas, visíveis em cada painel:</p>
            <NatureLegend />
          </S>
          <S id="transcricao" title="Como a transcrição é produzida">
            <p>Em produção, o áudio oficial da transmissão passa por reconhecimento automático de fala (ASR) com diarização (identificação de quem fala). Um segmento só é publicado quando a fala termina. Enquanto isso, a interface mostra apenas “transcrevendo fala de…”.</p>
            <p>O texto transcrito é armazenado como <strong>RAW</strong> e nunca é alterado por etapas posteriores. Correções humanas geram nova versão, preservando a original.</p>
          </S>
          <S id="segmentacao" title="Como as falas são segmentadas">
            <p>Um segmento corresponde a um turno contínuo de um mesmo orador (candidato ou moderação), delimitado pela troca de orador ou pelas regras da emissora (pergunta, resposta, réplica, tréplica). Cada segmento guarda início, fim, orador, bloco do debate e, quando houver, o destinatário da pergunta.</p>
          </S>
          <S id="classificacao" title="Como os temas e tipos de fala são identificados">
            <p>Cada segmento é classificado por um modelo de linguagem com saída estruturada e validada. A classificação é armazenada separada do texto original, com <strong>modelo, versão, versão do prompt, horário e confiança</strong>. Saídas inválidas são descartadas, nunca “corrigidas” silenciosamente.</p>
            <p>Uma fala recebe múltiplas dimensões — nunca apenas “positivo/negativo”:</p>
            <dl className="space-y-2.5">
              {[
                ["Tema", TOPICS.map((t) => TOPIC_LABEL[t])],
                ["Tipo de fala", SPEECH_TYPES.map((t) => SPEECH_TYPE_LABEL[t])],
                ["Tom", TONES.map((t) => TONE_LABEL[t])],
                ["Fact-check", FACT_CHECK.map((t) => FACT_CHECK_LABEL[t])],
              ].map(([k, vs]) => (
                <div key={k as string}>
                  <dt className="eyebrow mb-1">{k as string}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {(vs as string[]).map((v) => <Tag key={v}>{v}</Tag>)}
                  </dd>
                </div>
              ))}
            </dl>
            <p>“Verificado” significa que a checagem foi concluída — <strong>não</strong> que a afirmação é verdadeira. O resultado da checagem deve ser consultado na fonte de fact-checking.</p>
          </S>
          <S id="relevancia" title="Como a relevância é calculada">
            <p>Relevância mede o <strong>potencial informativo</strong> de uma fala — não sua qualidade, veracidade ou mérito político. Nenhum critério depende de quem fala ou da posição ideológica. A pontuação é a soma de critérios objetivos:</p>
            <table className="w-full font-[family-name:var(--font-data)] text-[12.5px]">
              <tbody>
                {[
                  ["Contém afirmação verificável (números, valores, datas)", RELEVANCE_WEIGHTS.verifiableClaim],
                  ["Descreve medida concreta (proposta/promessa)", RELEVANCE_WEIGHTS.concreteProposal],
                  ["Menciona nominalmente outro participante", RELEVANCE_WEIGHTS.mentionsOther],
                  ["Gerou resposta direta no debate", RELEVANCE_WEIGHTS.triggersReply],
                  ["Variação do volume social nos 3 min seguintes (0–100%)", RELEVANCE_WEIGHTS.socialLift],
                ].map(([k, w]) => (
                  <tr key={k as string} className="border-b border-border">
                    <td className="py-2 text-fg-2">{k}</td>
                    <td className="py-2 text-right text-fg tnum">até +{(w as number).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Faixas: <strong>alta</strong> ≥ {RELEVANCE_THRESHOLDS.alta.toFixed(2)} · <strong>média</strong> ≥ {RELEVANCE_THRESHOLDS.media.toFixed(2)} · <strong>baixa</strong> abaixo disso. O detalhamento de cada fala aparece no painel “Por que esta relevância?”.</p>
          </S>
          <S id="tom" title="Como o tom é classificado">
            <p>Tom descreve a forma retórica (propositivo, crítico, defensivo, confrontativo, neutro, informativo), não a correção do conteúdo. Cores semânticas discretas ajudam a leitura: verde para propositivo, vermelho para crítico/confrontativo, âmbar para defensivo. <strong>Candidatos nunca recebem cores semânticas</strong>; suas cores de identificação são neutras e testadas para daltonismo.</p>
          </S>
          <S id="eventos" title="Como os eventos são detectados">
            <p>Eventos são derivados automaticamente de dados já existentes: pergunta e resposta entre candidatos (com ou sem menção nominal), primeira aparição de um tema, volume de publicações acima de média + 1,5 desvio-padrão e falas de alta relevância com checagem sugerida. Eventos ao vivo usam apenas dados disponíveis até o instante — variações só são calculadas quando a janela de 5 minutos está completa.</p>
          </S>
          <S id="redes" title="Como as redes são coletadas">
            <p>Cada plataforma tem um adapter próprio (X, YouTube, TikTok, Instagram, Facebook, Threads, Telegram). Os níveis de acesso às APIs são diferentes: algumas oferecem amostras, outras apenas conteúdo público via programas de pesquisa, outras nenhum acesso. Por isso, <strong>volumes não são comparáveis entre plataformas</strong> e não representam a opinião da população.</p>
            <p>Mostramos volume e comportamento da conversa. Não mostramos “candidato mais popular” nem “quem está ganhando nas redes”.</p>
          </S>
          <S id="mapa" title="Mapa de repercussão">
            <p>O mapa mostra onde está a <strong>conversa pública</strong> — não votos, apoio ou intenção de voto. Considera apenas publicações com localização inferida (perfil, geotag ou menção a local), uma fração do total, informada no próprio mapa.</p>
            <p><strong>Camadas:</strong> Volume (publicações), Partido e Candidato (quem é mais mencionado — a cor identifica a entidade e a intensidade indica sua participação nas menções), Tema (publicações sobre o tema escolhido) e Tendência (últimos 15 min vs. 15 min anteriores; exige ao menos 20 publicações na base).</p>
            <p><strong>Drill-down:</strong> Brasil → Região → Estado → Município. Zona, local e seção existem apenas nos dados oficiais do TSE; redes sociais não oferecem essa precisão. Todos os níveis são somas do nível mais fino, garantindo consistência.</p>
            <p>Valores absolutos acompanham o tamanho da população. Picos marcados no controle de tempo são <em>temporalmente associados</em> a eventos, sem relação causal estabelecida.</p>
          </S>
          <S id="oficiais" title="Dados oficiais">
            <p>O Tribunal Superior Eleitoral (TSE) é a autoridade para resultados eleitorais. Arquivos oficiais passam por: arquivo bruto → validação → normalização → banco → agregação → painel, com registro de eleição, arquivo, versão, data de importação e checksum. Nenhum número eleitoral é digitado manualmente ou estimado. Dados ausentes aparecem como ausentes.</p>
          </S>
          <S id="humana" title="Análise humana">
            <p>Classificações automáticas podem ser revisadas por pessoas. A revisão é registrada (quem, quando, o que mudou) e a classificação original permanece no histórico. Cada fala informa se passou por revisão humana.</p>
          </S>
          <S id="limitacoes" title="Limitações e margem de erro">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>ASR erra nomes próprios, números e falas sobrepostas; o áudio original é a referência.</li>
              <li>Classificadores de linguagem podem errar tema e tipo, especialmente em falas curtas ou irônicas. A confiança é exibida; abaixo de 0,70, a interface alerta.</li>
              <li>Tempo de fala depende das regras da emissora e não mede desempenho.</li>
              <li>Volume social reflete o que as APIs permitem ver, não o total real de publicações.</li>
              <li>Correlação temporal entre debate e repercussão não é causalidade.</li>
            </ul>
          </S>
          <S id="configuracao" title="Modo de dados">
            <p className="flex flex-wrap items-center gap-2">
              Modo atual: {mode === "demo" ? <DemoBadge /> : <Tag tone="pos">LIVE</Tag>}
            </p>
            <p>No modo demonstração, todos os dados são fictícios e gerados de forma determinística: 4 participantes, cerca de 100 falas, 12 temas, eventos e repercussão social simulada. Classificador em uso: <span className="font-mono text-[12px]">{ai?.providerId.replace("ai:", "") ?? "—"}</span>. Dados demo e reais nunca são misturados: a troca é feita no servidor pela variável <span className="font-mono text-[12px]">DATA_MODE</span>.</p>
          </S>
        </article>
      </div>
    </div>
  );
}
