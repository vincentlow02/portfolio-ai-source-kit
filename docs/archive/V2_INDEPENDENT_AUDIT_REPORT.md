# V2 Independent Audit Report

**Verdict: `INTERNAL_ARCHITECTURE_V2_REQUIRES_FIXES`**

Audit target: `fix` at `f370bebfb158f9a92d26502f6946d6a89ed76b44`; baseline `4fcfcf39f2fdd6cc812e94a5454d0993aa592f04`. Read-only review in the existing isolated V2 worktree `D:\portfolio-ai-v2-independent-v2`; no application code changed. Date: 2026-11-24.

## Executive summary

The three entry points share the core answer pipeline. Next calls `prepareAnswer`/`generateAnswer` directly; Hosted and local preview call `source-reply.ts`, which calls those same functions. Their adapters keep different HTTP/access/quota/serialization policies, which is reasonable for their contracts. The code therefore does not support a claim that three complete AI pipelines remain duplicated.

The V2 code improves corpus validation, defers paid quota reservation until model generation, enforces request limits, and applies citation eligibility checks. The offline suite did not complete: the browser-dependent test could not start Chromium (ICU file descriptor error) before assertions. A focused non-browser subset passed 48 tests. Production provider quality, exact remote install, PostgreSQL concurrency and production deployment remain unverified.

**Disposition:** do not approve V2 as complete yet. Complete browser-dependent and integration verification, resolve or explicitly accept context-free ambiguous retrieval, and strengthen evidence-grounding acceptance evidence. Detailed conditions are recorded below.

## Scope and method

Compared the named baseline and V2 commit metadata and file diff; inspected the V2 request adapters, orchestration, retrieval/evidence, knowledge loader/publisher, quota and generation implementations, evaluation fixture, tests and integration scripts. Ran `npm run test:offline` in the V2 isolated worktree. No secrets were read and no paid model request was made. No PostgreSQL concurrency test, hosted deployment, exact GitHub install, or remote provider test was executed independently.

## Architecture assessment

- **Entrypoints:** Next `lib/portfolio-chat/handler.ts` calls `prepareAnswer`/`generateAnswer` in `answer-engine.ts`. Hosted `lib/hosted-assistant.ts` calls `createModelReply`/`excerptReply` in `source-reply.ts`, which calls the same answer engine; Vite `scripts/portfolio-chat/preview-local.mts` also uses `source-reply.ts`. The core answer pipeline is shared; adapters retain contract-specific HTTP, access and response behavior.
- **Retrieval:** `retrieval.ts` fuses Orama and MiniLM and keeps exact-literal fallback. The committed 100-question fixture is fictional, has 12 authored passages, mixes language and project names in each question, and uses expected source URLs authored beside the corpus. It is useful regression coverage but not independent production recall evidence. Reported corpus metrics cannot validate production relevance distribution.
- **Knowledge:** schema digest and provenance relationships are checked in `knowledge/corpus.ts`; publish preflight and candidate validation have tests. Revocation still requires rebuilt artifacts and replacement of running processes, per architecture docs.
- **Grounding:** `grounding.ts` verifies citation keys against the evidence pack and current public corpus, then applies lexical/regex heuristics. It does not establish semantic entailment. Source eligibility is not proof that each sentence follows from its citation.
- **Cost:** Next reserves quota only after deterministic/abstention handling and before generation. Hosted reserves only inside model path; excerpt mode has no distributed counter. Local model mode is opt-in and process-limited. Atomic multi-connection PostgreSQL behavior is NOT VERIFIED in this run.
- **Compatibility:** full offline, Atlas, Hosted and local registry integrations with generated Atlas/second portfolio passed. Exact GitHub install remains NOT VERIFIED because V2 commit is not published; local registry install is not equivalent.

## Findings

See `V2_ISSUE_REGISTER.md` for classified findings and acceptance criteria. The full offline and local integrations passed after selecting installed Chrome and placing temporary fixtures on the same drive. Material remaining concerns are benchmark representativeness, context-free ambiguous retrieval, heuristic grounding, and process-local excerpt limits. Exact Japanese miss, real PostgreSQL concurrency, remote GitHub installation, production/provider behavior, and dependency advisories remain unverified.

## Security and cost control observations

- **Input/resource bounds:** shared request body reader caps bytes and times out stalled bodies; messages and selections have separate schema/size checks; Next/Hosted/Vite apply request and active-request limits. These checks reduce single-process abuse but do not create a distributed rate limit.
- **Unauthorized access/origin:** Next requires configured local-dev opt-in, valid same-origin/public origin, or an access token; Hosted requires exact same-origin and `Sec-Fetch-Site`; the Atlas integration exercised unauthorized rejection. Origin checks are not a substitute for authentication where the deployment exposes sensitive behavior.
- **Private corpus:** publication validates explicit source access and path overlaps; runtime filters protected namespaces; tests cover protected markers and stale/corrupt snapshots. Removal still requires rebuilding and replacing running instances.
- **SSRF:** anonymous browser capture restricts requests to approved same-origin GET navigation/assets; local preview validates loopback origin. No user-supplied URL fetch was identified in the question API path. Qwen endpoint is deployment configuration and is constrained by provider validation; this was covered by a no-network config test, not a live network scan.
- **Prompt injection/XSS/API key:** prompts serialize corpus and selection data as untrusted evidence and tests cover forged selections/claims; model credentials are read server-side. Response/output tests validate schema and safe destinations. This audit did not perform a comprehensive browser XSS/fuzz campaign, external penetration test, or secret-scanning/advisory audit.
- **Quota:** deterministic Next and Hosted model-adapter responses return before quota reservation; actual generation reserves before provider call; Atlas/Hosted mock integrations verified fail-closed unavailable/exhausted paths. PostgreSQL multi-connection atomicity remains NOT VERIFIED independently. Hosted excerpt mode is intentionally outside model quota and only process-limited.
- **Dependency security:** NOT VERIFIED; pinned versions alone are not a security audit.

## Required verification before approval

1. Run browser-dependent tests with a supported Chromium binary; run the full offline suite to completion.
2. Independently run Atlas, second integration, Hosted and registry workflows; record exact commands/results.
3. Run disposable PostgreSQL concurrent reservation test independently.
4. Run fresh cross-language/ambiguous/adversarial retrieval cases including the Japanese caption-storage miss; publish per-case evidence and metrics.
5. Verify exact remote GitHub installation after publication and verify production/provider behavior only with authorized credentials/environment.

## Independent follow-up evidence (2026-11-24)

A 48-test non-browser subset completed successfully. The focused iframe test did not fail its assertions: Puppeteer could not start Chromium (`Invalid file descriptor to ICU data received`, process code `2147483651`). Reclassify this as NOT VERIFIED in this environment, not a confirmed product defect. The full offline suite remains incomplete because its browser-dependent portion could not execute.

The evaluation script was independently rerun: it reproduced 84.09% development and 81.25% holdout Recall@5, with evidence coverage 96.59%/92.61% and irrelevant evidence ratio 30.00%/28.77%. These are reproducible fixture metrics, but not production-quality independent metrics due to 12 synthetic passages and co-designed query/label vocabulary.

Seven newly authored retrieval probes identified a context-free ambiguous query (`How was it tested?`) qualifying a nearest research passage, while an unrelated Neptune query and private payroll prompt produced no qualified evidence. A simple Japanese caption-storage question retrieved the correct English passage in the custom fixture, but that does not reproduce the exact documented known miss; exact question/corpus reproduction remains open. See `V2_INDEPENDENT_TEST_RESULTS.md` for chunk IDs, scores and commands.

## Verification update (2026-11-24)

The browser environment issue was resolved for testing by selecting installed Chrome through `PUPPETEER_EXECUTABLE_PATH`; full offline suite passed 55/55. Atlas integration passed. Hosted integration passed after setting its temporary directory to the same drive as the worktree. Local registry installation plus generated Atlas and second-portfolio integrations passed; this does not verify remote GitHub installation. Thus previous browser/Hosted failures are now classified as test-environment portability issues rather than product failures.

The four-passage retrieval probe produced both correct matches and a context-free ambiguous nearest match. The exact documented Japanese miss, PostgreSQL concurrency test, remote exact-SHA installation, live provider quality/billing, production environment and dependency advisory audit remain NOT VERIFIED. Docker daemon is unavailable on this machine.

## V2.1 verification update

This document preserves the original V2 audit record. Its initial browser/Hosted failures and pipeline-duplication descriptions are superseded by the V2 verification updates above and the V2.1 reports. V2.1 work and remaining verification conditions are recorded in V2_1_ISSUE_RESOLUTION_REGISTER.md and V2_1_REMEDIATION_REPORT.md. A local registry pass does not establish an exact GitHub installation.
