# V2.1 Remaining Verification Gates

1. Improve and evaluate multilingual paraphrases and topic-specific comparison on a larger independently adjudicated corpus. Fresh case `f2` now returns its expected passage and an additional unlabelled passage; `f4` still abstains despite available evidence; `f3` contains extra non-labelled evidence. Keep the fresh results frozen and use newly authored development data for future changes.
2. Expand claim-level adversarial testing and establish an explicit product policy for residual semantic grounding and cross-language entailment. Numeric/keyword/source checks are not proof.
3. Verify a distributed request/compute limit for Hosted excerpt mode in the intended multi-instance deployment. Set provider-side and database model budgets independently; test production config without exposing keys.
4. After the V2.1 commit is actually published, install its exact GitHub SHA in a clean host. A local registry test is not equivalent.
5. With explicit authorization, measure real provider answer quality, failure behavior, latency and billing, and deployed quota configuration. No actual model calls were authorized in this phase.
6. Re-audit the final source archive after report-only updates. The `dff86f9` source archive passed manifest checks, clean extraction, install, 77 offline tests and Atlas integration. The final archive must be audited against the final tree and the difference from this tested tree restricted to documented report-only updates.

The independent PostgreSQL concurrency test and local lockfile advisory checks were completed locally. They do not prove deployed database grants or prevent future dependency advisories.

**Historical development finding:** an independently authored probe (`comparison-development.test.mts`) confirmed an English multi-project paraphrase miss. That particular assertion was subsequently fixed and added to the offline suite; the separate comparison limitation remains. A naive `interviews` query expansion also retrieved results after adding an unrelated submarine term, so no expansion was adopted.

**Follow-up:** the English generic interviewee development case now passes using an explicit past-interview supplement; an unrelated subject remains excluded. This does not establish that other paraphrases or the frozen Japanese/comparison cases are resolved.

The narrow specific-intent gate reduces three independently observed unsupported generation paths, but further testing must cover valid paraphrases, mixed-intent questions, unsupported facts outside the three categories, and whether selection responses remain useful. A matching word is not semantic support.

A per-project comparison retry was evaluated and reverted after it caused a two-sided unsupported participant-name question to proceed toward generation. The final system again abstains on that example, but the separately observed comparison recall failure remains. A replacement needs independent topic/relationship validation, false-positive and quota checks, and a bounded compute budget; score qualification alone was insufficient.

Explicit plural project follow-ups now retain scope, but the topic filter is lexical and clause-based. Independently evaluate additional languages, coreference patterns, location/time/role relationships and multi-sentence evidence; reject semantic overclaims. Selecting one of several projects remains conservative, and the standalone participant-comparison miss remains open.

The separate topic holdout initially had a supported Japanese long-form retrieval miss; that case was promoted to development and now recovers both sources. A newer frozen confirmation still misses supported method and participant-count questions. The first clarification-continuation sample was promoted to development after it exposed Chinese/Japanese method-word misses; a later six-case confirmation is too small and same-reviewer to establish generalization. Evaluate longer Japanese constructions, unseen method vocabulary, same-clause unrelated facts and clarification history adversarially with an independently adjudicated corpus.

The localized-history confirmation shares the Chinese and Japanese comparison patterns in the new regression tests; it must not be treated as independent evidence for unseen phrasing. Run a larger independently authored corpus across varied prior comparisons, short clarification answers and unrelated facts. The earlier Japanese long-form case has since been promoted and recovered; newer Japanese method/count misses and standalone `f4` remain unresolved.

The old long-form Japanese case has been promoted to development and now returns both expected sources. The separately frozen `japanese-verification-holdout` still misses two supported method/count questions despite qualified semantic candidates; the same-reviewer samples are small. Independently evaluate other passive, negative and specific-attribute constructions, synonym ambiguity and one-sided Hosted retrieval. The original historical `Prism` miss discrepancy remains NOT VERIFIED.

## Latest gate update

The formerly observed Japanese method/count examples are now development cases and were recovered, but a separately frozen synthetic confirmation still misses 3/3 supported pairs; solve generalization without admitting unrelated or negated evidence, then obtain a new independently authored and adjudicated holdout. IA-18's account/device substitutions are blocked for selected compounds; test unseen noun compounds, units, cross-language relations and valid evidence expressed in unrecognized forms. The historical Prism run's differing model artifact remains unavailable. Real LLM quality, production deployment controls and exact GitHub SHA installation remain NOT VERIFIED.
