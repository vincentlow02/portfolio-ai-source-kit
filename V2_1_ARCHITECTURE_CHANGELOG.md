# V2.1 Architecture Changelog

- `0c3720f`, `940d3b0`, `67cdc87`, `1eeefe6`: resolve bare references conservatively, respect clear history, page and verified selections, protect ambiguous multi-project context, and retain original Chinese material question behavior.
- `dada1d4`, `bdd7226`, `5623571`: verify numeric claim forms and explicit project names against cited material, add a narrow same-language negative-claim check and adversarial tests; avoid interpreting very short project IDs as ordinary articles.
- `14ab6cc`: only after an empty named-project retrieval, retry without duplicate project labels while retaining the same search qualification thresholds. This may perform an additional embedding query; latency must be measured in a real deployment.
- `437bd50`: Windows browser fallback and same-volume temporary Hosted fixture.
- `96bcb0c`: disposable PostgreSQL concurrency and rollback harness with explicit opt-in.
- `203bd30`, `dbd3ef6`, `a2dda1d`, `9b0523d`: frozen evaluation data, V2/V2.1 per-case evidence, mock call counts/timings, fresh confirmation cases and quota boundary documentation.

No second model, new external service, API contract change, or unnecessary adapter unification was introduced. Eligibility checks are not semantic proof; see `V2_1_SECURITY_AND_QUOTA_REPORT.md`.

A strictly generic English interviewee question may now include the named projects' public passages that explicitly state past interviews or conversations; specific subjects do not trigger this supplement. See `scripts/portfolio-chat/comparison-development.test.mts`. This development fix does not imply the fresh Japanese and comparison misses were solved.

The `bca2817` source adds a conservative direct negation/action contradiction check. It may reject a valid statement if distinct events share the same verb; it is not a semantic entailment verifier.

Commits `dc83718` and `b85b1fe` add narrow multilingual evidence-type checks for explicit cost, salary and manufacturer questions, including selections. This trades some recall for safer handling and does not prove semantic entailment or address unrelated intents.
