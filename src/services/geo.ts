import "server-only";
import { getProviders } from "@/providers/registry";
import { aggregateGeo } from "@/geo/aggregate";
import { ancestorsOf, getRegion } from "@/geo/reference";
import type { GeoLevelId, GeoResponse } from "@/geo/types";
import type { TopicId } from "@/domain/types";

const SOCIAL_MAX_LEVEL: GeoLevelId = "municipio";

/** Agregação territorial no servidor — o browser recebe só as linhas do nível pedido. */
export async function queryGeo(q: { debateId: string; parentKey: string; childLevel?: GeoLevelId; from?: number; to: number; topic?: TopicId | null }): Promise<GeoResponse | null> {
  const p = getProviders();
  const parent = getRegion(q.parentKey);
  if (!parent) return null;
  const childLevel: GeoLevelId = q.childLevel ?? (parent.level === "pais" ? "uf" : parent.level === "regiao" ? "uf" : parent.level === "uf" ? "municipio" : "zona");
  const from = Math.max(0, q.from ?? 0);
  const trendWindow = 900;
  const base = {
    mode: p.mode,
    parent: { key: parent.key, name: parent.name, level: parent.level },
    breadcrumb: ancestorsOf(parent.key).map((r) => ({ key: r.key, name: r.level === "uf" ? r.shortName : r.name })),
    childLevel,
    window: { from, to: q.to, trendWindow },
  };
  if (!["regiao", "uf", "municipio"].includes(childLevel)) {
    return {
      ...base,
      rows: [],
      totals: { posts: 0, topicPosts: 0, geolocatedShare: p.geo.geolocatedShare },
      unavailableReason: `Publicações em redes sociais não têm localização precisa abaixo de ${SOCIAL_MAX_LEVEL}. Zonas, locais e seções existem apenas nos dados oficiais do Explorador eleitoral.`,
    };
  }
  const metrics = await p.geo.metrics(q.debateId, { to: q.to });
  const rows = aggregateGeo(metrics, { parentKey: parent.key, childLevel, from, to: q.to, topic: q.topic, trendWindow });
  return {
    ...base,
    rows,
    totals: { posts: rows.reduce((a, r) => a + r.posts, 0), topicPosts: rows.reduce((a, r) => a + r.topicPosts, 0), geolocatedShare: p.geo.geolocatedShare },
    unavailableReason: rows.length ? null : "Sem publicações geolocalizadas neste recorte.",
  };
}

export async function getBoundaries(level: GeoLevelId) {
  return getProviders().geo.boundaries(level);
}

import { getDebateSnapshot } from "./debates";
import { geoSeries } from "@/geo/aggregate";
import { TOPIC_LABEL } from "@/domain/labels";
import type { DebateSnapshot } from "./debates";

/** Tudo que o MapExplorer precisa para a renderização inicial (SSR). */
export async function getMapBootstrap(debateId: string, opts: { parentKey?: string; topic?: TopicId | null; snapshot?: DebateSnapshot } = {}) {
  const s = opts.snapshot ?? (await getDebateSnapshot(debateId));
  if (!s) return null;
  const parentKey = opts.parentKey && getRegion(opts.parentKey) ? opts.parentKey : "BR";
  const initial = await queryGeo({ debateId, parentKey, to: s.offset, topic: opts.topic ?? null });
  if (!initial) return null;
  const metrics = await getProviders().geo.metrics(debateId, { to: s.offset });
  const topics = s.topics.map((t) => t.topic);
  return {
    debateId,
    startsAt: s.debate.startsAt,
    now: s.offset,
    totalEnd: s.totalEnd,
    entities: s.participants.map((c) => ({ id: c.id, name: c.name, color: c.swatch, partyAcronym: c.party?.acronym ?? "" })),
    topics: topics.length ? topics : (["economia"] as TopicId[]),
    series: geoSeries(metrics, "BR"),
    events: s.events.filter((e) => e.kind === "social_spike").map((e) => ({ id: e.id, code: e.code, t: e.startOffset, title: e.title, topicLabel: TOPIC_LABEL[e.topic] })),
    initial,
    initialBoundaries: await getBoundaries(initial.childLevel),
  };
}
