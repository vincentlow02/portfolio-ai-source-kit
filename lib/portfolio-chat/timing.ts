import type { RetrievalPhase } from "./retrieval";

type Phase = "knowledge" | "retrieval" | "assembly" | "model" | RetrievalPhase;

/** Opt-in server-side aggregate timings; never accepts request or evidence text. */
export class RequestTiming {
  private readonly started = performance.now();
  private readonly phases: Record<Phase, number> = {
    knowledge: 0, retrieval: 0, assembly: 0, model: 0,
    keyword: 0, indexLoad: 0, corpusEmbedding: 0, queryEmbedding: 0, semantic: 0, rankFusion: 0,
  };
  private inputTokens: number | null = null;
  private outputTokens: number | null = null;

  constructor(private readonly enabled: boolean) {}

  record(phase: Phase, duration: number) {
    if (this.enabled) this.phases[phase] += Math.max(0, duration);
  }

  async measure<T>(phase: Phase, run: () => Promise<T>): Promise<T> {
    if (!this.enabled) return run();
    const start = performance.now();
    try { return await run(); } finally { this.record(phase, performance.now() - start); }
  }

  usage(input?: number, output?: number) {
    if (this.enabled) { this.inputTokens = input ?? null; this.outputTokens = output ?? null; }
  }

  finish() {
    if (!this.enabled) return;
    const total = performance.now() - this.started;
    const round = (n: number) => Math.round(n * 100) / 100;
    const measured = this.phases.knowledge + this.phases.retrieval + this.phases.assembly + this.phases.model;
    console.info(JSON.stringify({ event: "portfolio_ai_timing", totalMs: round(total),
      apiOverheadMs: round(Math.max(0, total - measured)), knowledgeMs: round(this.phases.knowledge),
      retrievalMs: round(this.phases.retrieval), evidenceAssemblyMs: round(this.phases.assembly),
      keywordMs: round(this.phases.keyword), indexLoadMs: round(this.phases.indexLoad), corpusEmbeddingMs: round(this.phases.corpusEmbedding),
      queryEmbeddingMs: round(this.phases.queryEmbedding), semanticMs: round(this.phases.semantic),
      rankFusionMs: round(this.phases.rankFusion),
      modelMs: round(this.phases.model), inputTokens: this.inputTokens, outputTokens: this.outputTokens }));
  }
}
