import type { Candidate, DataMode, Party, SocialPlatformId, TopicId } from "@/domain/types";
import { TOPICS, MODERATOR_SPEAKER_ID } from "@/domain/types";
import { TOPIC_LABEL } from "@/domain/labels";
import type { PartyVisualIdentity } from "@/domain/identity";
import { GEO_REGIONS, getRegion, slug } from "@/geo/reference";
import { PLATFORMS } from "@/providers/platforms";

/**
 * Contexto de normalização: resolve referências da origem (nomes, códigos, rótulos)
 * para IDs do domínio. Construído incrementalmente pela ingestão.
 */
export class NormalizationContext {
  readonly mode: DataMode;
  readonly ingestedAt: string;
  parties = new Map<string, Party>();
  candidates = new Map<string, Candidate>();
  identities: PartyVisualIdentity[] = [];
  /** Apelidos por nome completo (ex.: "Paes" → "Eduardo Paes"). */
  aliases = new Map<string, string[]>();
  /** externalId de evento → { debateId, startsAt } */
  events = new Map<string, { debateId: string; startsAt: string; blocks: Map<string, string> }>();
  /** Debates conhecidos (ids de domínio) — fontes editoriais só se ligam a debates existentes. */
  debateIds = new Set<string>();

  constructor(mode: DataMode, ingestedAt = new Date().toISOString()) {
    this.mode = mode;
    this.ingestedAt = ingestedAt;
  }

  private norm(s: string) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  candidateByRef(ref: string | null): string | null {
    if (!ref) return null;
    if (this.candidates.has(ref)) return ref;
    const n = this.norm(ref);
    for (const c of this.candidates.values()) if (this.norm(c.name) === n || this.norm(c.ballotName) === n) return c.id;
    for (const c of this.candidates.values()) if ((this.aliases.get(c.name) ?? []).some((a) => this.norm(a) === n)) return c.id;
    return null;
  }

  /** Orador: candidato ou moderação. `null` = não resolvido. */
  speakerByRef(ref: string): string | null {
    const n = this.norm(ref);
    if (n === MODERATOR_SPEAKER_ID || n === "moderacao" || n === "moderador" || n === "moderadora") return MODERATOR_SPEAKER_ID;
    return this.candidateByRef(ref);
  }

  partyByRef(ref: string): string | null {
    if (this.parties.has(ref)) return ref;
    const n = this.norm(ref);
    for (const p of this.parties.values()) if (this.norm(p.acronym) === n || this.norm(p.name) === n) return p.id;
    return null;
  }

  topicByLabel(label: string | null): TopicId | null {
    if (!label) return null;
    if ((TOPICS as readonly string[]).includes(label)) return label as TopicId;
    const n = this.norm(label);
    return (Object.entries(TOPIC_LABEL) as [TopicId, string][]).find(([, l]) => this.norm(l) === n)?.[0] ?? null;
  }

  platformByName(name: string): SocialPlatformId | null {
    const n = this.norm(name);
    return PLATFORMS.find((p) => p.id === n || this.norm(p.name) === n)?.id ?? null;
  }

  /** UF + município (nome) → chave territorial. Município ausente = "Demais municípios" da UF. */
  regionByUfCity(uf: string, city: string | null): string | null {
    const ufKey = `UF:${uf.toUpperCase()}`;
    if (!getRegion(ufKey)) return null;
    const key = `M:${uf.toUpperCase()}:${slug(city ?? "Demais municípios")}`;
    if (getRegion(key)) return key;
    // município fora da referência → agrega em "Demais municípios" (precisão preservada no registro)
    return GEO_REGIONS.find((r) => r.key === `M:${uf.toUpperCase()}:demais-municipios`)?.key ?? null;
  }

  eventOffset(eventExternalId: string, iso: string): number | null {
    const e = this.events.get(eventExternalId);
    if (!e) return null;
    return (Date.parse(iso) - Date.parse(e.startsAt)) / 1000;
  }
}
