# V2 Remaining Risks

- **Retrieval:** Small synthetic set cannot support broad recall claims. Japanese caption-storage query is documented as missing the correct English chunk. Without independent cross-language labels, changing thresholds risks either missed evidence or irrelevant context.
- **Grounding:** structural citation validity and lexical overlap do not prove semantic support. Heuristics can fail on paraphrase, negation, numbers, Japanese/Chinese attribution, and multi-claim sentences.
- **Pipeline drift:** Next and widget adapters do not run a single canonical orchestration; behavior may differ for deterministic answers, abstention, citations, recommendations and follow-ups.
- **Quota and abuse:** process-local limits multiply across replicas; hosted excerpt mode has no distributed counter. SQL atomicity is not independently reproduced in this audit.
- **Knowledge revocation:** snapshots are immutable per build; removing content requires rebuilding and replacing processes still holding old snapshots.
- **Runtime and dependencies:** cold ONNX startup/resource behavior and dependency security were not independently measured/audited here.
- **Compatibility:** Atlas, second portfolio, Hosted, registry installation, UI/API contract and exact remote install were not fully re-run. Exact GitHub V2 install requires publication.
- **Provider:** no real model output quality, actual billing, production timeout behavior or deployed quota configuration verified; mock tests cannot establish these.
- **Test status:** offline suite incomplete after one observed iframe history failure; no clean full-suite result.

Additional environment limitation: the Hosted integration script was attempted and failed during the temporary Windows fixture's webpack build because dependency paths from D: were resolved as relative paths under a C: temp directory. This does not establish a Hosted runtime defect, but the integration deliverable remains NOT VERIFIED until run in a compatible layout.

The full offline suite, Atlas integration, Hosted integration, and local registry install with generated Atlas/second-portfolio mocks have now passed. Remaining gates are narrow and explicitly external/environment-bound: exact GitHub SHA publication/install, PostgreSQL daemon for real concurrent SQL reservations, exact original Japanese-miss reproduction, live provider/production verification (only if authorized), and dependency advisory review.

## V2.1 verification update

This document preserves the original V2 audit record. Its initial browser/Hosted failures and pipeline-duplication descriptions are superseded by the V2 verification updates above and the V2.1 reports. V2.1 work and remaining verification conditions are recorded in V2_1_ISSUE_RESOLUTION_REGISTER.md and V2_1_REMEDIATION_REPORT.md. A local registry pass does not establish an exact GitHub installation.
