# V2 security, compatibility and independent review

The independent standards and specification reviews compared `4fcfcf3...323449a`. Both used fictional fixtures. Review fixes and their regressions are in `fe3af16`.

## Standards

Six findings. The highest severity on this axis was P2.

| Finding | Resolution and regression |
| --- | --- |
| P2 — Omitted Next evidence/usage fields | Catalog and insufficient answers retain both fields, including zero token counts. Clarification and Guardian keep their separate response shapes. Atlas asserts the fields on the HTTP route. |
| P2 — Widget catalogs unavailable on captured plain pages | Model-capable widget adapters search approved plain-page prose when structured catalog metadata is absent. Regression checks the existing widget route into that evidence. |
| P2 — A bad source plan deleted the previous snapshot | Preflight keeps the current corpus and build ID intact. Atlas exercises the publisher with a conflicting manifest. |
| P2 — Edited content reused a snapshot identity | Runtime readers verify the schema-v1 digest and validate version, approved page, language, anchor and project associations. The loader rejects edited passage text even when the original hash is present. |
| P2 — Different comparison rules between context and B2 | Both use one comparison predicate. The contextual test covers both “Compare it to…” and “How is it different from…”. |
| P3 — An invalid embedding batch stayed cached | A dimension failure invalidates the batch so the next request rebuilds it. A dedicated regression tests failure and recovery. |

## Specification

Four implementation findings. The highest severity on this axis was High.

| Finding | Resolution and regression |
| --- | --- |
| High — Irrelevant research and material supplements triggered generation | Require a scoped, generic request for explicit supplements. Verify the subject on explicit English research questions and apply English claim-anchor checking to related citations. The reported fictional near-misses and the forged claim now fail closed in regression. |
| High — Incomplete publication and unhashed loaded snapshots | The publisher preflights before I/O, writes a complete candidate, and checks the actual candidate bytes on the private path in a loopback preview. A rejected candidate restores the previous file when available. All readers verify the corpus digest. |
| Medium — Billable malformed replies lost usage | The shared executor recovers available provider-reported usage both for malformed JSON and schema failures. Tests assert exactly one request and normalized error kinds for both Qwen modes. |
| Medium — Specific validation follow-ups lost their subject | Generic validation follow-ups carry a bounded topic from the prior visitor question. A single-project fixture checks that tactile signage and LED displays select different approved evidence. |

Two separate review tracks also checked delivery readiness. Evidence comes from the mock provider, public fixture pages and a disposable local database. See the [evaluation report](architecture-v2-evaluation.md) for retrieval and grounding scope.

## Security checks

- Anonymous capture, protected paths, unusable citations, forged selection payloads, cross-origin access, Qwen configuration and credential requests are covered by regression. Prompts use serialized passage data and record public source provenance.
- PostgreSQL 16.16 was started on loopback with a disposable database. The repository SQL checks passed for row-level security, service-role privileges and the minute, day and budget limits. Twelve real database connections reserved quotas concurrently. Five were accepted, seven rejected, and the recorded count was five. The database process was stopped after the run.
- The model and quota mocks use fixture-only URLs and credentials. Hosted excerpt mode works while the model-quota fixture is unavailable. Generation requests fail closed when the quota service fails.
- The original source distribution audit, positive ZIP manifest audit and negative archive tests form the packaging gate. The archive contains source, licensed UI files, synthetic fixtures and environment variable examples.

## Remaining limitations and risks

- Real provider factual quality, production cold start, production spend and billing have not been measured in this change. Mock output verifies contracts and failure behavior. The claim rules establish structural, procedural and heuristic grounding. They cannot guarantee factual entailment across arbitrary text and languages.
- The registry installer supports a fresh built item from loopback for unpublished code. The exact GitHub installation was verified at the original baseline. The exact GitHub reference for V2 requires publishing the local branch.
- Local fixed-window request limits apply per process. Supabase remains the distributed generation budget. Excerpt mode has no distributed counter in this kit.
- Knowledge removal takes effect after rebuilding and replacing running instances. Remove public access at the source and replace old deployments when revoking previously published content.
- Cross-language evidence can abstain on a legitimate question. The evaluation documents the Japanese caption-storage miss and the lower comparison coverage under narrower evidence packs.
