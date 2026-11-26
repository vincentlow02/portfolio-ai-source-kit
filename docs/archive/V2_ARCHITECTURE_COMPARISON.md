# V2 Architecture Comparison

| Area | Baseline (4fcfcf3) | V2 (f370beb) | Independent assessment |
|---|---|---|---|
| Answer flow | Entrypoints had more local logic and duplicated provider/evidence behavior. | Next has `answer-engine.ts`; Hosted and Vite share `source-reply.ts`; model call utility `generation.ts` shared selectively. | Reduced duplication, but not one full shared pipeline across all three entrypoints. |
| Retrieval | Hybrid keyword and semantic retrieval existed. | Adds explicit qualified matches, cache recovery, evidence pack reasons and timing. | Better boundaries; V2 evaluation is synthetic and small, so general recall is not established. |
| Evidence/citations | Existing B2 evidence and source validation. | Adds typed answer schema and citation/source eligibility/claim heuristics. | Better structural integrity; entailment still heuristic and language-dependent. |
| Knowledge publication | Existing source/corpus publishing. | Adds digest/provenance validation, preflight and candidate artifact checks. | Stronger integrity/revocation workflow; running deployments must be replaced after revocation. |
| Quota/cost | Generation path reserved quota. | Defers reservation until model path and uses shared executor; process limits added. | Better deterministic zero-generation path. Hosted excerpt mode remains outside distributed quota; concurrency SQL not independently verified here. |
| Runtime boundaries | Separate request checks. | Body reader and limiter shared in places; different thresholds by entrypoint. | Cleaner primitives, yet local fixed-window limits remain per process. |
| Compatibility | Existing widget and Next contracts. | New answer engine and metadata; integration tests updated. | Offline run had widget-history test failure; integration matrix incomplete in this audit. |
| Dependencies | Pinned application dependencies. | Dependency versions updated in manifest/lock as part of V2 diff. | No dependency advisory audit performed; NOT VERIFIED. |

The baseline comparison is based on source diff and docs only; no baseline-vs-V2 full execution matrix was completed.

The source-path audit corrected an initial concern: all three entrypoints use the same `answer-engine.ts` preparation and generation core (Next directly; Hosted and Vite through `source-reply.ts`). Keep this as a positive architectural finding. Remaining adapters differ at HTTP/auth/quota/serialization boundaries by design; no defect was established there.

## V2.1 verification update

This document preserves the original V2 audit record. Its initial browser/Hosted failures and pipeline-duplication descriptions are superseded by the V2 verification updates above and the V2.1 reports. V2.1 work and remaining verification conditions are recorded in V2_1_ISSUE_RESOLUTION_REGISTER.md and V2_1_REMEDIATION_REPORT.md. A local registry pass does not establish an exact GitHub installation.
