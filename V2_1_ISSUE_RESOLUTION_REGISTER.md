# V2.1 Issue Resolution Register

Statuses describe evidence and do not imply user acceptance of residual risk. `ACCEPTED_WITH_LIMITATION` means the current internal design retains the stated limitation; deployment owners must separately decide whether it is acceptable.

| ID | Status | Evidence and remaining condition |
|---|---|---|
| IA-01 | RESOLVED | `anonymous-browser.mjs` tries installed Windows Chrome/Edge when the default browser fails and no override was supplied; focused iframe test passed without an override. Offline suite can run with explicit Chrome. |
| IA-02 | VERIFIED | `handler.ts` calls `prepareAnswer`/`generateAnswer`; widget model path in `source-reply.ts` calls the same engine. Excerpt mode intentionally returns retrieved text without generation. |
| IA-03 | ACCEPTED_WITH_LIMITATION | Original 100-case benchmark retained. Frozen independent development, initial holdout and fresh confirmation cases and raw results are in `docs/v2-1-evaluation`. Fresh set still misses Japanese paraphrase and comparison; new larger independently adjudicated corpora are needed. |
| IA-04 | ACCEPTED_WITH_LIMITATION | `grounding.ts` checks cited numeric forms, known project IDs, and a narrow English negative-claim anchor. `grounding-adversarial.test.mts` covers substitutions, forged keys and wrong project. These checks do not establish entailment, unit association, complete negation or cross-language facts. |
| IA-05 | EXTERNAL_VERIFICATION_REQUIRED | `request-limits.ts` is per process and Hosted excerpt does not reserve model quota. `docs/security.md` separates compute from model budgets and recommends distributed edge protection; deployed multi-instance protection/limits require an actual deployment and owner decision. |
| IA-06 | VERIFIED | Fresh disposable PostgreSQL 16.16: 12 connections, 5 accepted, 7 rejected, 5 recorded; rollback released the advisory transaction lock and left one subsequent reservation. `scripts/portfolio-chat/quota-concurrency-check.cjs` and SQL fixture reproduce the check. Deployed Supabase settings remain unverified. |
| IA-07 | EXTERNAL_VERIFICATION_REQUIRED | Local registry installation and Atlas/second fixture integrations passed; exact GitHub commit installation requires the commit to be published and was not run. |
| IA-08 | VERIFIED | Prior report withdrew the duplicate-pipeline concern; common answer engine remains, with intentionally different entrypoint adapters and excerpt behavior. |
| IA-09 | ACCEPTED_WITH_LIMITATION | English/Chinese/Japanese unresolved reference, prior history, multiple projects, verified page, selection and zero reservation have regression cases. Rules are bounded patterns, not a general coreference model. |
| IA-10 | RESOLVED | Hosted fixture now uses the checkout volume on Windows; Hosted webpack/excerpt/model/origin/fail-closed suite passed with default cross-drive temp configuration. |

## Code evidence

- Clarification and prior-project ambiguity: `lib/portfolio-chat/retrieval.ts:49`, `lib/portfolio-chat/b2.ts:115`, `lib/portfolio-chat/answer-engine.ts:32`; excerpt guard: `lib/portfolio-chat/source-reply.ts:57`. Reproduce using `npm run test:offline`, in particular `hybrid-retrieval.test.mts`.
- Qualified fallback: `lib/portfolio-chat/b2.ts:116` and `:125`; the existing semantic and fused limits remain in `lib/portfolio-chat/retrieval.ts` under `defaultRetrievalProfile`.
- Claim checks: `lib/portfolio-chat/grounding.ts:60`, `:65`, `:70`; reproduce with `npx tsx --test scripts/portfolio-chat/grounding-adversarial.test.mts`.
- Budget reservation and process limiter: `lib/portfolio-chat/handler.ts:118`, `lib/hosted-assistant.ts:84`, `lib/portfolio-chat/request-limits.ts:2`, `lib/portfolio-chat/supabase.ts:31`. The quota test runner has a disposable-server guard at `scripts/portfolio-chat/quota-concurrency-check.cjs:6`.
- Test environment: `scripts/portfolio-knowledge/anonymous-browser.mjs:32`, `scripts/test-hosted-integration.mts:15`.
