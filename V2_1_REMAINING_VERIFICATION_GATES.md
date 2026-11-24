# V2.1 Remaining Verification Gates

The final local executable snapshot is `f1806e1`. See the [regression results](V2_1_REGRESSION_TEST_RESULTS.md) for the verified archive, installations and route tests. The local gates and future evidence below have different acceptance criteria.

| Gate | Status | Conditions for verification |
|---|---|---|
| Real model factuality, provider behavior, latency and billing | NOT VERIFIED | Use an explicitly authorized isolated provider configuration. Check the claim-to-evidence relation, correct refusals and at most one billable generation for a supported request. Compare provider logs with actual token and cost usage. |
| Production access, shared quota and multi-instance compute | NOT VERIFIED | In the intended deployment, confirm origin/access settings and Supabase grants, shared reservation and failure policies. Exercise multiple replicas with a separate global request/compute limit for Hosted excerpts and confirm cancellation and recovery. Retain the distinct LLM budget. See [security guidance](docs/security.md). |
| Exact GitHub SHA installation | NOT VERIFIED | After authorized publication, install the full published SHA in clean Atlas and second-portfolio hosts and run the integration suite. The local Registry exercises local packaging. |
| Historical Prism Japanese failure | NOT VERIFIED | Obtain the original exact embedding artifact and retrieval trace, then rerun `Prism は字幕をどこに保存しますか？` on corpus `28c76e7d2f349a4e822abf2e07223f2320d68524b4c2382c357c9d496c60b83e` with expected chunk `ae78b79ec8fe17308264f702`. Both local versions retrieve the chunk. The original failure conditions remain unresolved. |
| Broader retrieval and semantic grounding quality | ACCEPTED_WITH_LIMITATION | Independently label a larger public or authorized fictional corpus across languages, ambiguous references, negation, event and number binding, personal attribution and comparisons. Rerun after freezing the holdout. Preserve original standards and separately review valid paraphrases that the conservative gates reject. |

The reproduced Hosted generic Japanese failure and observed method/count cases have local regression evidence for recovery. The current independent evaluation still abstains on the standalone Japanese research query `d4` and includes an extra unlabelled passage on each of `f2` and `f3`. The frozen samples are small, share an author with the remediation and overlap familiar task forms. The [retrieval report](V2_1_RETRIEVAL_EVALUATION.md) retains the failures and exact case data.

The durable PostgreSQL reservation is verified on a disposable local cluster. The Hosted excerpt limit is per process by design. Introducing the existing Supabase reservation into free excerpt mode would change latency and make shared credentials and service availability part of the excerpt contract. A multi-replica deployment requires an explicit distributed compute budget and operational verification.
