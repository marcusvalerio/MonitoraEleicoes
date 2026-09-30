import type { TopicId } from "@/domain/types";

/**
 * Banco de textos FICTÍCIOS para o DEMO. Frases genéricas, sem citações reais.
 * {alvo} é substituído pelo nome do candidato mencionado.
 */
export interface TopicBank {
  subtopics: [string, string];
  question: string;
  proposal: string;
  proposal2: string;
  critique: string;
  defense: string;
  info: string;
}

export const TEXT_BANK: Partial<Record<TopicId, TopicBank>> = {
  economia: {
    subtopics: ["Inflação", "Crescimento"],
    question: "{alvo}, como o seu governo pretende controlar a inflação sem frear o crescimento da economia?",
    proposal: "Nossa proposta é criar uma regra fiscal com meta de gasto plurianual e revisão a cada 2 anos, com transparência total das contas públicas.",
    proposal2: "Vamos priorizar crédito para pequenas empresas, com uma linha de 50 bilhões de reais em quatro anos, e simplificar o acesso a microcrédito.",
    critique: "O plano apresentado por {alvo} não explica de onde virão os recursos. Promessa sem fonte de financiamento não fecha a conta.",
    defense: "Eu apresentei a fonte, sim: revisão de renúncias fiscais e combate à sonegação. Está no nosso programa registrado.",
    info: "Hoje a inflação acumulada em 12 meses está em torno de 4,5 por cento, segundo o dado que usamos no programa.",
  },
  emprego: {
    subtopics: ["Qualificação", "Informalidade"],
    question: "{alvo}, o que o senhor fará pelos trabalhadores informais que não têm proteção nenhuma?",
    proposal: "Vamos criar um programa de qualificação profissional com 2 milhões de vagas por ano, em parceria com escolas técnicas.",
    proposal2: "Propomos um regime simplificado para o trabalhador por aplicativo, com contribuição proporcional e acesso à previdência.",
    critique: "{alvo} fala em emprego, mas não apresentou nenhuma meta concreta de redução da informalidade.",
    defense: "A meta está clara: reduzir a informalidade em 5 pontos percentuais até o fim do mandato. Eu repito aqui.",
    info: "Cerca de 38 por cento da população ocupada está na informalidade, segundo levantamentos do IBGE citados no plano.",
  },
  seguranca: {
    subtopics: ["Crime organizado", "Policiamento"],
    question: "{alvo}, qual é o seu plano para enfrentar o crime organizado nas fronteiras?",
    proposal: "Vamos integrar as bases de dados das polícias estaduais e federal em um sistema único, com 100 por cento das delegacias conectadas em três anos.",
    proposal2: "Propomos ampliar a presença da Polícia Federal nas fronteiras e criar forças-tarefa permanentes contra lavagem de dinheiro.",
    critique: "{alvo} teve responsabilidade sobre essa área no passado e os resultados não aparecem nos números apresentados.",
    defense: "Os números que eu apresentei são públicos. Houve redução em vários indicadores no período, e isso pode ser verificado.",
    info: "O país registrou mais de 40 mil mortes violentas intencionais no último ano, conforme o anuário citado no debate.",
  },
  saude: {
    subtopics: ["Atenção básica", "Filas"],
    question: "{alvo}, como reduzir as filas para cirurgias e exames especializados no SUS?",
    proposal: "Vamos criar um mutirão nacional permanente para zerar as filas de cirurgias eletivas em 24 meses.",
    proposal2: "Propomos ampliar as equipes de saúde da família para cobrir 80 por cento da população.",
    critique: "A proposta de {alvo} repete promessas antigas e não diz quantos profissionais serão contratados.",
    defense: "Nós detalhamos o número de profissionais no programa, e o financiamento vem do orçamento já previsto para a saúde.",
    info: "Hoje mais de 1 milhão de pessoas aguardam cirurgias eletivas, segundo estimativas mencionadas pelo candidato.",
  },
  educacao: {
    subtopics: ["Ensino médio", "Alfabetização"],
    question: "{alvo}, qual será sua prioridade na educação básica?",
    proposal: "Vamos garantir escola em tempo integral para 50 por cento dos alunos do ensino médio até o fim do mandato.",
    proposal2: "Propomos um programa nacional de alfabetização na idade certa com avaliação anual e apoio aos municípios.",
    critique: "{alvo} não explicou como vai pagar a expansão do tempo integral sem retirar recursos de outras áreas.",
    defense: "A expansão é gradual e usa recursos do fundo da educação básica. Não há corte em outras áreas.",
    info: "Segundo o dado citado, cerca de 44 por cento das crianças não estão plenamente alfabetizadas ao fim do 2º ano.",
  },
  infraestrutura: {
    subtopics: ["Rodovias", "Saneamento"],
    question: "{alvo}, como destravar obras paradas de infraestrutura?",
    proposal: "Vamos criar um cadastro público de obras paradas, com prazo de 180 dias para retomada ou encerramento de cada contrato.",
    proposal2: "Propomos universalizar o saneamento com parcerias e metas regionais acompanhadas publicamente.",
    critique: "{alvo} promete obras, mas os projetos apresentados não têm licença nem orçamento definido.",
    defense: "Os projetos estão em fase de estudo e o cronograma foi divulgado. Não prometi nada sem estudo técnico.",
    info: "Existem mais de 8 mil obras paralisadas no país, segundo o levantamento citado pela candidata.",
  },
  meio_ambiente: {
    subtopics: ["Desmatamento", "Transição energética"],
    question: "{alvo}, qual é o seu compromisso com a redução do desmatamento?",
    proposal: "Vamos zerar o desmatamento ilegal até 2030 com monitoramento por satélite e fiscalização integrada.",
    proposal2: "Propomos um programa de transição energética com incentivo a energia solar em residências de baixa renda.",
    critique: "O discurso ambiental de {alvo} não combina com as alianças que sustentam sua candidatura.",
    defense: "Nossas alianças não mudam o programa. O compromisso ambiental está registrado e é público.",
    info: "A área desmatada caiu no último levantamento anual, segundo os números oficiais mencionados.",
  },
  impostos: {
    subtopics: ["Reforma tributária", "Imposto de renda"],
    question: "{alvo}, o senhor vai aumentar ou reduzir a carga tributária?",
    proposal: "Vamos ampliar a faixa de isenção do imposto de renda para quem ganha até 5 mil reais por mês.",
    proposal2: "Propomos simplificar a regulamentação da reforma tributária com transição acompanhada por um comitê público.",
    critique: "{alvo} promete reduzir impostos e aumentar gastos ao mesmo tempo. As duas coisas não cabem no mesmo orçamento.",
    defense: "A compensação vem da tributação de rendas hoje isentas. Está no programa, com estimativa de impacto.",
    info: "A carga tributária bruta está em torno de 33 por cento do PIB, conforme o número citado no debate.",
  },
  previdencia: {
    subtopics: ["Regime geral", "Servidores"],
    question: "{alvo}, o seu governo pretende fazer nova reforma da previdência?",
    proposal: "Não propomos nova reforma. Vamos focar em reduzir a fila de benefícios do INSS para no máximo 45 dias.",
    proposal2: "Propomos digitalizar integralmente os pedidos de benefício e ampliar o atendimento em cidades pequenas.",
    critique: "{alvo} evita responder se haverá mudança nas regras de aposentadoria.",
    defense: "Eu respondi: não haverá mudança de idade mínima no nosso governo. Isso está claro.",
    info: "A fila de pedidos no INSS chegou a mais de 1 milhão de requerimentos, segundo o número apresentado.",
  },
  corrupcao: {
    subtopics: ["Transparência", "Controle"],
    question: "{alvo}, que medidas concretas o senhor adotará contra a corrupção?",
    proposal: "Vamos publicar em tempo real todos os contratos federais e criar uma plataforma aberta de rastreamento de emendas.",
    proposal2: "Propomos fortalecer os órgãos de controle com autonomia orçamentária e mandatos fixos.",
    critique: "{alvo} fala em transparência, mas integrantes do seu grupo político respondem a investigações.",
    defense: "Ninguém do meu grupo foi condenado. Investigação não é condenação, e defendemos que tudo seja apurado.",
    info: "As emendas parlamentares somaram mais de 40 bilhões de reais no último orçamento, conforme citado.",
  },
  tecnologia: {
    subtopics: ["Inteligência artificial", "Conectividade"],
    question: "{alvo}, como o país deve regular a inteligência artificial?",
    proposal: "Vamos levar internet de alta velocidade a 100 por cento das escolas públicas em dois anos.",
    proposal2: "Propomos uma regulação de IA baseada em risco, com proteção de dados e transparência dos algoritmos públicos.",
    critique: "A proposta de {alvo} para tecnologia é genérica e não diz quem vai fiscalizar.",
    defense: "A fiscalização ficaria com uma autoridade independente já prevista em lei. Detalhamos isso no plano.",
    info: "Cerca de 20 por cento das escolas públicas ainda não têm conexão adequada, segundo o dado citado.",
  },
  assistencia_social: {
    subtopics: ["Transferência de renda", "Primeira infância"],
    question: "{alvo}, o programa de transferência de renda será mantido?",
    proposal: "Vamos manter o programa e criar um adicional de 150 reais por criança de até 6 anos.",
    proposal2: "Propomos integrar o cadastro social com saúde e educação para acompanhar as famílias atendidas.",
    critique: "{alvo} já defendeu cortes nesse programa no passado e agora promete ampliá-lo.",
    defense: "Eu defendi revisão de cadastro, não corte. São coisas diferentes e isso pode ser verificado.",
    info: "O programa atende cerca de 20 milhões de famílias, segundo o número mencionado.",
  },
};

export const OPENING_LINES = [
  "Boa noite. Estou aqui para apresentar propostas concretas e responder com clareza a cada pergunta.",
  "Boa noite a todos. Nosso programa tem metas públicas e vamos detalhá-las ao longo deste debate.",
  "Boa noite. Quero falar de emprego, saúde e segurança com números e prazos definidos.",
  "Boa noite. Vim para discutir o país com responsabilidade fiscal e respeito ao eleitor.",
];

export const CLOSING_LINES = [
  "Agradeço a atenção. Nosso programa completo está publicado e pode ser consultado por qualquer pessoa.",
  "Obrigado. Vou continuar apresentando metas verificáveis até o dia da eleição.",
  "Muito obrigada. Peço que cada eleitor compare os programas e decida com informação.",
  "Agradeço à emissora e aos colegas. Nosso compromisso está registrado no plano de governo.",
];

export const MODERATOR_LINES = {
  b0: "Boa noite. Começa agora o debate entre os candidatos à Presidência. Cada candidato terá 1 minuto e 30 segundos para a apresentação inicial.",
  b1: "Iniciamos o primeiro bloco, com tema livre. Cada candidato pergunta a um adversário de sua escolha.",
  b2: "Segundo bloco. Os temas foram sorteados e cada pergunta segue o tema indicado.",
  b3: "Terceiro bloco, de confronto direto. Pergunta, resposta, réplica e tréplica.",
  b4: "Chegamos às considerações finais. Cada candidato terá 1 minuto e 30 segundos.",
} as const;
