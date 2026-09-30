import { describe, expect, it } from "vitest";
import { detectFormat, parseTimestamp, parseTranscript, splitSpeaker, TranscriptParseError } from "./transcript";

// Arquivos de TESTE (conteúdo sintético mínimo) — não representam o debate real.
describe("parsers de transcrição", () => {
  it("timestamps", () => {
    expect(parseTimestamp("00:01:02.500")).toBe(62500);
    expect(parseTimestamp("01:02,5")).toBe(62500);
    expect(parseTimestamp("62.5")).toBe(62500);
    expect(parseTimestamp("xx")).toBeNull();
  });
  it("orador por <v>, [ ] e NOME:", () => {
    expect(splitSpeaker("<v Maria Silva>Olá</v>")).toEqual({ speaker: "Maria Silva", text: "Olá" });
    expect(splitSpeaker("[Moderação] Boa noite")).toEqual({ speaker: "Moderação", text: "Boa noite" });
    expect(splitSpeaker("JOÃO: texto aqui")).toEqual({ speaker: "JOÃO", text: "texto aqui" });
    expect(splitSpeaker("sem orador")).toEqual({ speaker: null, text: "sem orador" });
  });
  it("VTT com tempo exato", () => {
    const c = parseTranscript("WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Ana>Primeira fala.</v>\n\n00:00:05.000 --> 00:00:09.500\nsegunda\nlinha", "vtt");
    expect(c).toEqual([
      { seq: 1, startMs: 1000, endMs: 4000, speakerLabel: "Ana", block: null, text: "Primeira fala." },
      { seq: 2, startMs: 5000, endMs: 9500, speakerLabel: null, block: null, text: "segunda linha" },
    ]);
    expect(() => parseTranscript("oi", "vtt")).toThrow(TranscriptParseError);
  });
  it("SRT", () => {
    const c = parseTranscript("1\n00:00:01,000 --> 00:00:02,000\nANA: oi\n\n2\n00:00:03,000 --> 00:00:04,000\nBETO: olá\n", "srt");
    expect(c.map((x) => [x.speakerLabel, x.startMs, x.text])).toEqual([
      ["ANA", 1000, "oi"],
      ["BETO", 3000, "olá"],
    ]);
  });
  it("TXT sem tempo: blocos, continuação de turno, tempo opcional", () => {
    const c = parseTranscript("## Bloco 1\nANA: começo\ncontinuação\n[00:10] BETO: resposta\n", "txt");
    expect(c).toEqual([
      { seq: 1, startMs: null, endMs: null, speakerLabel: "ANA", block: "Bloco 1", text: "começo continuação" },
      { seq: 2, startMs: 10000, endMs: null, speakerLabel: "BETO", block: "Bloco 1", text: "resposta" },
    ]);
  });
  it("JSON e CSV", () => {
    expect(parseTranscript('[{"speaker":"A","text":"x","start":1.5}]', "json")[0]).toMatchObject({ startMs: 1500, endMs: null, speakerLabel: "A" });
    expect(() => parseTranscript('[{"speaker":"A"}]', "json")).toThrow(/sem texto/);
    const c = parseTranscript('speaker,start,end,text\nA,00:00:01,00:00:02,"olá, mundo"\n,,,"sem orador"\n', "csv");
    expect(c).toEqual([
      { seq: 1, speakerLabel: "A", startMs: 1000, endMs: 2000, block: null, text: "olá, mundo" },
      { seq: 2, speakerLabel: null, startMs: null, endMs: null, block: null, text: "sem orador" },
    ]);
  });
  it("detecta formato pela extensão", () => {
    expect(detectFormat("a.VTT")).toBe("vtt");
    expect(() => detectFormat("a.docx")).toThrow();
  });
});
