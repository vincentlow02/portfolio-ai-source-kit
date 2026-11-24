# V2 Remediation Plan

## Gate 1 — Resolve demonstrated regression

1. Reproduce the iframe bounded-history/reset failure in a clean supported Node 24 + Chromium run and capture assertion details.
2. Correct client or harness behavior without weakening the existing test standard.
3. Run the isolated test and complete offline suite to a normal exit; preserve logs and commit IDs.

## Gate 2 — Independently validate behavior

1. Add blind, independently authored retrieval prompts across English, Chinese and Japanese, including paraphrase without project names, ambiguity, unrelated queries, known Japanese caption miss, Unicode extremes and prompt injection.
2. Recompute Recall@5, evidence coverage and irrelevant evidence from judged expected chunk IDs; report query-level outcomes and retain current tests unchanged.
3. Assert deterministic answer paths make zero provider calls, generation paths make exactly one, unsupported requests abstain before quota/model call, and malformed/provider/cancel paths have explicit quota semantics.

## Gate 3 — Validate security and cost boundaries

1. Run quota SQL in disposable PostgreSQL with concurrency; verify accepted/rejected counts and transaction/timeout behavior.
2. Test multi-instance request rate assumptions, especially Hosted excerpt mode. Add distributed abuse protection if anonymous volume is expected to be material.
3. Adversarially test claims that share vocabulary but contradict evidence, numeric swaps, negation, cross-language attribution and forged citations.
4. Run dependency advisory/security review against the exact lockfile and runtime.

## Gate 4 — Compatibility and architecture decision

1. Run Atlas, second integration, Hosted, local preview and registry workflows in clean environments; compare response contracts, UI, citations, follow-ups and text selection.
2. After publishing V2, verify exact GitHub version install; do not treat local registry success as equivalent.
3. Decide whether to unify all three orchestration paths or explicitly maintain capability-specific pipelines with parity tests.
4. Reassess approval only when Gates 1–3 pass and remaining remote/provider checks are either completed or accepted with owners and operational limits.

No fixes were implemented in this audit. This plan is a handoff for the next decision stage.

## Additional next steps

5. Run the browser-dependent tests with a functioning supported Chromium binary. The current audit failure is startup-level and cannot adjudicate product behavior.
6. Add the context-free ambiguous query case to independent acceptance checks; distinguish legitimate prior-turn resolution from unsupported one-turn guesswork.
7. Preserve the exact known Japanese miss input and corpus as a separately adjudicated regression case; the custom successful Japanese probe is not a substitute.

## V2.1 verification update

This document preserves the original V2 audit record. Its initial browser/Hosted failures and pipeline-duplication descriptions are superseded by the V2 verification updates above and the V2.1 reports. V2.1 work and remaining verification conditions are recorded in V2_1_ISSUE_RESOLUTION_REGISTER.md and V2_1_REMEDIATION_REPORT.md. A local registry pass does not establish an exact GitHub installation.
