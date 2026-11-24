# V2.1 Remaining Verification Gates

1. Improve and evaluate multilingual paraphrases and topic-specific comparison on a larger independently adjudicated corpus. Fresh cases `f2` and `f4` abstain despite available evidence; `f3` contains extra non-labelled evidence. Keep the fresh results frozen and use newly authored development data for future changes.
2. Expand claim-level adversarial testing and establish an explicit product policy for residual semantic grounding and cross-language entailment. Numeric/keyword/source checks are not proof.
3. Verify a distributed request/compute limit for Hosted excerpt mode in the intended multi-instance deployment. Set provider-side and database model budgets independently; test production config without exposing keys.
4. After the V2.1 commit is actually published, install its exact GitHub SHA in a clean host. A local registry test is not equivalent.
5. With explicit authorization, measure real provider answer quality, failure behavior, latency and billing, and deployed quota configuration. No actual model calls were authorized in this phase.
6. Re-audit the final source archive after report-only updates. The `3736ae4` source archive already passed manifest/secret checks, negative tests, clean extraction, install, 60 offline tests and Atlas integration. Confirm the final archive differs only in documented report updates if those are made after this check.

The independent PostgreSQL concurrency test and local lockfile advisory checks were completed locally. They do not prove deployed database grants or prevent future dependency advisories.

A further independently authored development probe (`comparison-development.test.mts`) confirmed an English multi-project paraphrase miss. The failing expected-evidence assertion remains in the diagnostic test; the original offline suite does not run this file. A naive `interviews` query expansion also retrieved results after adding an unrelated submarine term, so no expansion was adopted.
