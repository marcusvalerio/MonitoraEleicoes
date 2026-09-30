import type { ModelInfo, TranscriptSegment } from "@/domain/types";
import { getDemoDataset, DEMO_MODEL } from "@/data/demo/generate";
import type { ClassifierOutput, SpeechClassifier } from "@/ai/classifier";

/** DEMO: devolve a classificação simulada associada ao registro de origem. */
export class DemoSpeechClassifier implements SpeechClassifier {
  readonly model: ModelInfo = DEMO_MODEL;
  async classify(seg: TranscriptSegment): Promise<ClassifierOutput> {
    const ext = seg.provenance.record?.externalId ?? seg.id;
    const c = getDemoDataset().classifications.find((x) => x.segmentId === ext);
    if (!c) throw new Error(`sem classificação simulada para ${ext}`);
    return {
      speaker: seg.speakerId,
      topic: c.topic,
      subtopic: c.subtopic,
      speech_type: c.speechType,
      tone: c.tone,
      target: c.targetId,
      mentions: c.mentions,
      relevance: c.relevance,
      fact_check_required: c.factCheck !== "nao_necessario",
      fact_check_status: c.factCheck,
      confidence: c.confidence,
    };
  }
}

