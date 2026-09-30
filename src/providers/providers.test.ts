import { describe, expect, it, vi } from "vitest";
import { collectAll, paginate, type ElectionProvider, type MediaProvider, type RawRecord, type SocialProvider, type TranscriptProvider } from "./contracts";
import { DemoElectionProvider, DemoMediaProvider, DemoSocialProvider, DemoTranscriptProvider } from "./demo";
import { FixtureElectionProvider, FixtureMediaProvider, FixtureSocialProvider, FixtureTranscriptProvider } from "./fixture";
import { SvgGeoProvider } from "./geo/svg";
import { AuthenticationRequired, InvalidResponse, NormalizationError, ProviderUnavailable, RateLimited, uiStateFor } from "./errors";
import { backoffDelay, DEFAULT_RETRY, withRetry } from "./resilience";
import { NORMALIZERS } from "@/normalization/normalizers";

interface ProviderSet {
  transcript: TranscriptProvider;
  social: SocialProvider;
  election: ElectionProvider;
  media: MediaProvider;
}
const sets: Record<string, ProviderSet> = {
  demo: { transcript: new DemoTranscriptProvider(), social: new DemoSocialProvider(), election: new DemoElectionProvider(), media: new DemoMediaProvider() },
  fixture: { transcript: new FixtureTranscriptProvider(), social: new FixtureSocialProvider(), election: new FixtureElectionProvider(), media: new FixtureMediaProvider() },
};

function checkRaw(r: RawRecord, providerId: string) {
  expect(r.providerId).toBe(providerId);
  expect(r.externalId).toBeTruthy();
  expect(NORMALIZERS[r.schema], `sem normalizador para ${r.schema}`).toBeTypeOf("function");
  expect(Number.isNaN(Date.parse(r.collectedAt))).toBe(false);
  if (r.publishedAt) expect(Number.isNaN(Date.parse(r.publishedAt))).toBe(false);
}

describe.each(Object.entries(sets))("contrato de providers · %s", (_name, s) => {
  const all = [s.transcript, s.social, s.election, s.media] as (TranscriptProvider | SocialProvider | ElectionProvider | MediaProvider)[];
  it("declaram id, nome, tipo, capabilities, config, rate limit e fonte", async () => {
    for (const p of all) {
      expect(p.info.id).toBeTruthy();
      expect(p.info.name).toBeTruthy();
      expect(["transcript", "social", "election", "media"]).toContain(p.info.kind);
      expect(p.info.capabilities).toBeTypeOf("object");
      expect(Array.isArray(p.info.config.requiredEnv)).toBe(true);
      expect(p.info.rateLimit).toBeDefined();
      expect(p.info.retry.maxAttempts).toBeGreaterThan(0);
      expect(p.info.sourceId).toMatch(/^src-/);
      expect(["connected", "degraded", "offline", "not_configured", "demo"]).toContain((await p.health()).status);
    }
  });
  it("transcrição devolve registros brutos paginados e completos", async () => {
    const events = await collectAll((pg) => s.transcript.listEvents(pg));
    expect(events.length).toBeGreaterThan(0);
    events.forEach((e) => checkRaw(e, s.transcript.info.id));
    const ext = events[0].externalId;
    const small = await s.transcript.fetchSegments(ext, { limit: 10 });
    expect(small.items).toHaveLength(10);
    expect(small.hasMore).toBe(true);
    expect(small.nextCursor).toBe("10");
    const full = await collectAll((pg) => s.transcript.fetchSegments(ext, pg), 7);
    const again = await collectAll((pg) => s.transcript.fetchSegments(ext, pg), 500);
    expect(full.map((r) => r.externalId)).toEqual(again.map((r) => r.externalId));
    full.forEach((r) => checkRaw(r, s.transcript.info.id));
  });
  it("social respeita capabilities (sem posts → lista vazia)", async () => {
    const ext = (await s.transcript.listEvents()).items[0].externalId;
    const posts = await collectAll((pg) => s.social.fetchPosts({ eventExternalId: ext }, pg));
    if (!s.social.info.capabilities.posts) expect(posts).toHaveLength(0);
    else expect(posts.length).toBeGreaterThan(0);
    const counts = await s.social.fetchCounts({ eventExternalId: ext }, { limit: 5 });
    counts.items.forEach((r) => checkRaw(r, s.social.info.id));
  });
  it("eleições nunca fabricam resultados", async () => {
    expect((await s.election.fetchResults({})).items).toHaveLength(0);
    expect(s.election.info.capabilities.results).toBe(false);
  });
});

describe("paginação", () => {
  const data = Array.from({ length: 23 }, (_, i) => i);
  it("cursor/limit/nextCursor/hasMore", () => {
    const p1 = paginate(data, { limit: 10 });
    expect(p1).toMatchObject({ items: data.slice(0, 10), nextCursor: "10", hasMore: true });
    const p3 = paginate(data, { cursor: "20", limit: 10 });
    expect(p3).toMatchObject({ items: [20, 21, 22], nextCursor: null, hasMore: false });
  });
  it("cursor inválido é erro", () => {
    expect(() => paginate(data, { cursor: "abc" })).toThrow();
  });
  it("collectAll percorre todas as páginas", async () => {
    expect(await collectAll((p) => Promise.resolve(paginate(data, p)), 4)).toEqual(data);
  });
});

describe("erros e resiliência", () => {
  const sleep = vi.fn(async () => {});
  it("retenta erros retentáveis e respeita Retry-After", async () => {
    let n = 0;
    const r = await withRetry(async () => {
      n++;
      if (n === 1) throw new RateLimited("x", 3);
      if (n === 2) throw new ProviderUnavailable("x");
      return "ok";
    }, DEFAULT_RETRY, { sleep, rand: () => 0 });
    expect(r).toBe("ok");
    expect(sleep).toHaveBeenNthCalledWith(1, 3000);
    expect(sleep).toHaveBeenNthCalledWith(2, 1000);
  });
  it("não retenta erros definitivos", async () => {
    const fn = vi.fn(async () => {
      throw new AuthenticationRequired("x");
    });
    await expect(withRetry(fn, DEFAULT_RETRY, { sleep })).rejects.toBeInstanceOf(AuthenticationRequired);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("desiste após maxAttempts", async () => {
    const fn = vi.fn(async () => {
      throw new ProviderUnavailable("x");
    });
    await expect(withRetry(fn, { ...DEFAULT_RETRY, maxAttempts: 3 }, { sleep })).rejects.toBeInstanceOf(ProviderUnavailable);
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("backoff exponencial limitado", () => {
    const d = [1, 2, 3, 10].map((a) => backoffDelay(a, DEFAULT_RETRY, () => 0));
    expect(d).toEqual([500, 1000, 2000, 16000]);
  });
  it("UI traduz códigos de erro em estados", () => {
    expect(uiStateFor(new RateLimited("x"))).toBe("provider_unavailable");
    expect(uiStateFor(new NormalizationError("x", "r", "m"))).toBe("partial");
    expect(uiStateFor(new InvalidResponse("x", "m"))).toBe("error");
    expect(uiStateFor(new Error("x"))).toBe("error");
  });
});

describe("GeoProvider é independente das métricas", () => {
  it("serve só geometria", async () => {
    const g = new SvgGeoProvider();
    expect(g.info.capabilities.format).toBe("svg-path");
    expect((await g.boundaries("uf"))?.boundaries.length).toBe(27);
  });
});
