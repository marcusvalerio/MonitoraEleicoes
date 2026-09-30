import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RuleBasedSpeechClassifier, scoreTopics } from "./classifiers";
import type { Candidate, TranscriptSegment } from "@/domain/types";

const cands: Candidate[] = ["Eduardo Paes", "Douglas Ruas", "Anthony Garotinho", "William Siri", "André Marinho", "Helena Duarte", "Rafael Monteiro"].map((n, i) => ({ id: `c${i}`, name: n, ballotName: n, partyId: "p", officeId: "x", swatch: "#000", initials: "X" }));
const clf = new RuleBasedSpeechClassifier(() => cands);
const seg = (text: string, speakerId = "c0", addressedToId: string | null = null): TranscriptSegment => ({ id: "s", debateId: "d", seq: 1, speakerId, startOffset: null, endOffset: null, text, blockId: "b", addressedToId, provenance: { nature: "collected", sourceId: "x", mode: "live" } });

describe("temas · pontuação ponderada (v2)", () => {
  it("termos fracos somados (sem termo forte) NÃO definem tema", async () => {
    const t = "Chega de tirar dinheiro do seu bolso. É hora de virar a página.";
    expect((await clf.classify(seg(t))).topic).toBe("outros");
    expect((await clf.classify(seg("O dinheiro do seu bolso vai para a inflação."))).topic).toBe("economia");
  });
  it("'família' sozinha NÃO define assistência social (caso real RJ)", async () => {
    const t = "Nesta reta final, quero agradecer à minha esposa e à minha família. Sou candidato para oferecer esperança.";
    expect((await clf.classify(seg(t))).topic).toBe("outros");
  });
  it("assistência social exige evidência forte", async () => {
    expect((await clf.classify(seg("Vamos ampliar o Bolsa Família e o cadastro único para famílias vulneráveis."))).topic).toBe("assistencia_social");
  });
  it("segurança por termos fortes; confiança maior com mais evidência", async () => {
    const a = await clf.classify(seg("Quem criou o Bope e o Batalhão? Melhorar a segurança pública com policiamento."));
    expect(a.topic).toBe("seguranca");
    const b = await clf.classify(seg("A segurança é importante e a polícia também."));
    expect(b.topic).toBe("seguranca");
    expect(a.confidence).toBeGreaterThan(b.confidence);
  });
  it("sem evidência suficiente → 'outros' com confiança baixa", async () => {
    const r = await clf.classify(seg("Primeiro, quero agradecer a vocês que nos acompanham até agora. Um grande abraço."));
    expect(r.topic).toBe("outros");
    expect(r.confidence).toBeLessThan(0.5);
  });
  it("pontuação ordena temas", () => {
    expect(scoreTopics("reestatizar a Cedae, saneamento e esgoto")[0].topic).toBe("infraestrutura");
  });
});

describe("tipos de fala", () => {
  it.each([
    ["pergunta", "Douglas Ruas, qual é a sua proposta para a Linha 3 do metrô?", "c0", "c1"],
    ["proposta", "Vamos criar oito delegacias da mulher 24 horas em todo o estado.", "c0", null],
    ["proposta", "Nós vamos ampliar a Patrulha Maria da Penha.", "c0", null],
    ["ataque", "Douglas Ruas faz parte de um governo podre que destruiu o estado.", "c2", null],
    ["critica", "Eduardo Paes não realizou projetos transformadores na região.", "c1", null],
    ["defesa", "Eu não fujo do debate sobre as drogas; isso não é verdade.", "c3", null],
    ["resposta", "A região portuária foi objeto de uma PPP e as vigas pertenciam à empresa.", "c0", "c2"],
    ["comparacao", "Ao contrário de Eduardo Paes, eu entreguei obras no Noroeste.", "c1", null],
  ] as const)("%s ← %s", async (expected, text, speaker, to) => {
    expect((await clf.classify(seg(text, speaker, to))).speech_type).toBe(expected);
  });
  it("'Nós vamos, com gestão…' sem verbo de ação NÃO é proposta (caso real RJ)", async () => {
    const r = await clf.classify(seg("Nós vamos, com gestão, firmeza e muita coragem, junto com Benedita, o nosso estado no próximo dia 4."));
    expect(r.speech_type).not.toBe("proposta");
  });
});

describe("regressão · considerações finais reais (RJ, 29/09/2026)", () => {
  const file = JSON.parse(readFileSync(path.join(process.cwd(), "data/real/rj-governador-2026-09-29/transcript.press-final-statements.json"), "utf-8")) as { segments: { speaker: string; text: string }[] };
  const byName = (n: string) => cands.find((c) => c.name === n)!.id;
  it("nenhuma fala classificada como assistência social; números de urna/anos não disparam fact-check sozinhos", async () => {
    const out = await Promise.all(file.segments.map((s) => clf.classify(seg(s.text, byName(s.speaker)))));
    expect(out.map((o) => o.topic)).not.toContain("assistencia_social");
    const marinho = out[file.segments.findIndex((s) => s.speaker === "André Marinho")];
    expect(marinho.fact_check_required).toBe(false);
    const siri = out[file.segments.findIndex((s) => s.speaker === "William Siri")];
    expect(siri.fact_check_required).toBe(false);
    const paes = out[file.segments.findIndex((s) => s.speaker === "Eduardo Paes")];
    expect(paes.speech_type).not.toBe("proposta");
  });
});
