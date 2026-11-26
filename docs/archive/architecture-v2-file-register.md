# Architecture V2 file change register

The baseline is `4fcfcf39f2fdd6cc812e94a5454d0993aa592f04`. The register lists repo-relative paths added or modified on `fix`. Moves and removals: zero.

| Path | Change | Purpose |
| --- | --- | --- |
| `.github/workflows/verify.yml` | Modified | Run the Hosted production fixture in CI. |
| `docs/architecture-v2-baseline.md` | Added | Record baseline metrics and verification. |
| `docs/architecture-v2-evaluation.md` | Added | Record final retrieval tuning, metrics and limitations. |
| `docs/architecture-v2-file-register.md` | Added | List the complete baseline-to-V2 change set. |
| `docs/architecture-v2-research.md` | Added | Record research references, audit and before diagram. |
| `docs/architecture-v2-review.md` | Added | Document independent findings, security evidence and operational limits. |
| `docs/architecture-v2.md` | Added | Explain the current request and publication architecture. |
| `docs/architecture.md` | Modified | Link to the V2 architecture. |
| `lib/hosted-assistant.ts` | Modified | Validate hosted snapshots and defer quota until generation. |
| `lib/knowledge/contract.ts` | Modified | Preflight source plans and compute the snapshot identity. |
| `lib/knowledge/corpus.ts` | Added | Validate version, provenance relationships and snapshot digest. |
| `lib/portfolio-chat/answer-engine.ts` | Added | Share answer preparation and finalization. |
| `lib/portfolio-chat/answer-schema.ts` | Added | Define typed, structured model output. |
| `lib/portfolio-chat/b2.ts` | Modified | Scope prompts and select eligible evidence with reasons. |
| `lib/portfolio-chat/engine-config.ts` | Modified | Define configurable audience evidence terms. |
| `lib/portfolio-chat/generation.ts` | Added | Unify SDK calls, cancellation, usage and output errors. |
| `lib/portfolio-chat/grounding.ts` | Added | Validate model citations and apply claim heuristics. |
| `lib/portfolio-chat/handler.ts` | Modified | Adapt Next access, quota, analytics and HTTP metadata. |
| `lib/portfolio-chat/request-limits.ts` | Added | Share fixed-window and concurrency limits. |
| `lib/portfolio-chat/retrieval.ts` | Modified | Resolve context, report eligibility and recover failed embeddings. |
| `lib/portfolio-chat/source-reply.ts` | Modified | Share model behavior across widget adapters. |
| `lib/portfolio-chat/timing.ts` | Modified | Report opt-in retrieval stages and aggregate usage. |
| `lib/portfolio-knowledge.ts` | Modified | Use the shared snapshot loader in Next. |
| `registry.json` | Modified | Include the new modules in the existing registry item. |
| `scripts/copy-portfolio-kit.mjs` | Modified | Copy new modules through the manual installation path. |
| `scripts/portfolio-chat/architecture-evaluation.mts` | Added | Run 100 labeled retrieval cases and a development profile sweep. |
| `scripts/portfolio-chat/boundaries.test.mts` | Modified | Verify aggregate timing fields. |
| `scripts/portfolio-chat/hybrid-retrieval.test.mts` | Modified | Test history, scope, grounding and encoder recovery. |
| `scripts/portfolio-chat/local-preview/preview.js` | Modified | Send bounded dialogue history and clear it on reset. |
| `scripts/portfolio-chat/mock-atlas.cjs` | Modified | Return fixture evidence relevant to comparisons. |
| `scripts/portfolio-chat/mock-local-preview.cjs` | Modified | Provide structured local fixture responses and failure probes. |
| `scripts/portfolio-chat/preview-local.mts` | Modified | Share requests, snapshot checks, cancellation and model errors. |
| `scripts/portfolio-chat/preview-local.test.mts` | Modified | Exercise iframe history, evidence and provider errors. |
| `scripts/portfolio-chat/provider-regression.test.mts` | Modified | Test the production executor with mock requests. |
| `scripts/portfolio-knowledge/contract.test.mts` | Modified | Test preflight, revocation, corruption and stale snapshots. |
| `scripts/portfolio-knowledge/publish.mts` | Modified | Publish validated artifacts atomically and preserve the last snapshot on failure. |
| `scripts/test-atlas-integration.mjs` | Modified | Exercise route compatibility, quota and failed manifest publication. |
| `scripts/test-hosted-integration.mts` | Added | Run an isolated Hosted build and test both answer modes. |
| `scripts/test-registry-install.mjs` | Modified | Install the actual built item from loopback for unpublished branches. |

Total: 14 additions and 25 modifications.
