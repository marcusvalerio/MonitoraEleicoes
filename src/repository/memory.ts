import type { DataStore } from "@/ingestion/store";
import type { PageRequest } from "@/providers/contracts";
import { StoreQueries, type QueryContext } from "./queries";
import type { Repository } from "./types";

/** Repositório em memória (demo/fixture): o store inteiro vive no processo. */
export class MemoryRepository implements Repository {
  private readonly q: StoreQueries;
  constructor(store: DataStore, ctx: QueryContext) {
    this.q = new StoreQueries(store, ctx);
  }
  get mode() {
    return this.q.ctx.mode;
  }
  get clock() {
    return this.q.ctx.clock;
  }
  moderatorId = () => this.q.moderatorId();
  platforms = () => this.q.ctx.platforms();
  listDebates = async () => this.q.listDebates();
  getDebate = async (id: string) => this.q.getDebate(id);
  getBlocks = async (id: string) => this.q.getBlocks(id);
  transcriptEnd = async (id: string) => this.q.transcriptEnd(id);
  getTranscript = async (id: string, r?: { from?: number; to?: number }) => this.q.getTranscript(id, r);
  getTranscriptQuality = async (id: string) => this.q.getTranscriptQuality(id);
  getTranscriptPage = async (id: string, p: PageRequest & { to?: number }) => this.q.getTranscriptPage(id, p);
  getSegment = async (d: string, id: string) => this.q.getSegment(d, id);
  getEvents = async (id: string, r?: { to?: number }) => this.q.getEvents(id, r);
  getCandidates = async () => this.q.getCandidates();
  getParties = async () => this.q.getParties();
  getPartyIdentities = async () => this.q.getPartyIdentities();
  getElectoralResults = async () => this.q.getElectoralResults();
  getSocialMetrics = async (id: string, r?: { to?: number }) => this.q.getSocialMetrics(id, r);
  getSocialPosts = async (id: string, p: PageRequest & { from?: number; to?: number }) => this.q.getSocialPosts(id, p);
  getGeoMetrics = async (id: string, r?: { to?: number }) => this.q.getGeoMetrics(id, r);
  getGeoCoverage = async (id: string, r?: { from?: number; to?: number }) => this.q.getGeoCoverage(id, r);
  getArticles = async (id?: string) => this.q.getArticles(id);
  getSources = async () => this.q.getSources();
  getReports = async () => this.q.getReports();
  getSourceRecord = async (id: string) => this.q.getSourceRecord(id);
  getDataStatus = async () => this.q.getDataStatus();
}
