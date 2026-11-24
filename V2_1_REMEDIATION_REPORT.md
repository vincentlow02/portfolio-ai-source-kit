# V2.1 Remediation Report

**Current assessment: `INTERNAL_ARCHITECTURE_V2_1_REQUIRES_FIXES`**. The shared engine and three adapters remain; no paid provider, production deployment or remote install was used. This is a local engineering assessment, not a production or real-model approval.

On branch `fix-v2-1`, from V2 `f370bebfb158f9a92d26502f6946d6a89ed76b44`, the implementation adds deterministic clarification for common unresolved pronouns, preserves verified selections and page/history context, retries empty scoped searches without duplicate project names under unchanged qualification thresholds, and adds conservative evidence checks for explicit numbers, project names and English negation. It also improves Windows browser and temporary fixture handling. See `V2_1_ARCHITECTURE_CHANGELOG.md` and the issue register for exact boundaries.

The original 100-case evaluation retains its V2 aggregate metrics. A newly authored six-case fresh confirmation set contains four answerable questions; two still fail to assemble the expected evidence, including a Japanese paraphrase and a comparison. Its small size does not establish population performance. The earlier holdout was inspected during diagnosis and must not be described as blind after that point. See `V2_1_RETRIEVAL_EVALUATION.md` and per-case JSON.

The original and new offline assertions passed in a sequential run (60 tests). PostgreSQL 16.16 independently accepted exactly five of twelve concurrent reservations; transaction rollback released the lock. Atlas, Hosted and local registry fixture integrations have passed at recorded commits; check `V2_1_REGRESSION_TEST_RESULTS.md` for the exact tested state and remaining runs. Mock providers establish call behavior, not factual quality.

Further work is required on independent retrieval coverage and claim entailment. Live provider quality, actual billing/production controls and exact published GitHub SHA installation are NOT VERIFIED. The system's hosted excerpt limiter is per process; global compute protection needs a deployment-specific control. No external service was introduced.
