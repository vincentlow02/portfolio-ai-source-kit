# V2 Independent Test Results

**Target:** `f370bebfb158f9a92d26502f6946d6a89ed76b44` in isolated `D:\portfolio-ai-v2-independent-v2` worktree. Runtime Node `v24.19.0`, Windows. No application code changes, credentials, or paid model calls.

| Check | Result | Evidence and limits |
|---|---|---|
| `npm run test:offline` | **PASS: 55 tests** | Set `PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`; 55 pass, 0 fail, 0 skipped. Includes browser history/reset, local preview, Hosted capture, publication/render checks, provider mocks, retrieval, and guardrail tests. Default bundled Puppeteer browser failed ICU startup; system Chrome works. |
| `npm run test:integration` | **PASS** | Atlas production build and independent browser/request checks passed: auth/privacy, selection validation, citations, insufficiency, quota fail closed, concurrency limits, highlight-to-ask, source navigation, follow-up, cancellation/recovery. Fixture credentials and mock provider only. |
| `npx tsx scripts/test-hosted-integration.mts` | **PASS** | With `TEMP`/`TMP` on the D: worktree drive, Hosted production build plus excerpt/model modes, origin checks and unavailable/exhausted quota fail-closed behavior passed. Initial cross-drive temp attempt failed Webpack resolution; not a product failure. |
| `node scripts/test-registry-install.mjs --local` | **PASS** | After setting a D: `TEMP` and `npm_config_cache`, local registry built/installed; generated Atlas and second portfolio mock integration tests passed. This is explicitly **not** exact GitHub installation verification. |
| `npx tsx scripts/portfolio-chat/architecture-evaluation.mts` | **PASS / reproduced** | 100 cases. Development Recall@5 84.09%, Evidence Coverage 96.59%, Irrelevant Evidence Ratio 30.00%; holdout 81.25%, 92.61%, 28.77%. Unsupported empty evidence 6/6 in each split. Valid fixture regression results; synthetic 12 passages and authored vocabulary do not establish production generalization. |
| Fresh independent retrieval probes | **MIXED** | Seven newly authored prompts on four synthetic public passages. Japanese caption-storage query retrieved correct English `/work/prism#implementation` score 0.547; English equivalent 0.893; unnamed paraphrase 0.631. Context-free `How was it tested?` qualified `/work/lantern#research` at 0.554. Neptune and protected payroll prompts produced no qualified matches; romanized Japanese typo abstained. Tiny diagnostic set only. |
| Exact documented Japanese miss | **NOT VERIFIED** | Simplified independent Japanese probe succeeds, but exact documented 12-passage corpus/question artifact was not independently reconstructed. Do not treat the simple probe as resolving the known miss. |
| `scripts/portfolio-chat/quota-postgres.test.sql` | **NOT VERIFIED** | Docker CLI exists but Docker daemon is unavailable (`docker_engine` named pipe missing); no local `psql`/`pg_ctl`/`initdb` was found. Could not run disposable PostgreSQL multi-connection concurrency test. |
| Exact GitHub registry install | **NOT VERIFIED** | Requires a published full Git SHA. V2 commit is local/unpublished; local registry success is not equivalent. |
| Real model answer quality, billing, production configuration | **NOT VERIFIED** | No authorized live provider or production access used. Mock tests validate contracts/failure handling, not model factuality or actual spend. |
| Dependency security/advisories | **NOT VERIFIED** | No advisory audit executed against lockfile. |

## Benchmark limitations

The benchmark corpus and expected URLs are authored together in `scripts/portfolio-chat/architecture-evaluation.mts`. Queries often repeat project names, section titles, anchor nouns, and passage vocabulary. Project-group holdout avoids question-level leakage between identical passage groups, but both groups are synthetic and generated from the same template. Report Recall@5, evidence coverage, and irrelevant evidence ratio as regression metrics on this fixture only.

## Probe details

Temporary `.audit-probes.mts` built four public passages plus protected payroll, called `retrieveEvidence`, printed chunk IDs/source URLs/scores, and was removed. For that generated corpus: Prism implementation `ae78b79ec8fe17308264f702`; Prism research `a98fade6b96f2d597b14c361`; Lantern research `6223d1e2185ddf2fa7b2a35e`. The ambiguous no-history query shows nearest-match qualification can supply evidence without an explicit subject; see IA-09.

## V2.1 verification update

This document preserves the original V2 audit record. Its initial browser/Hosted failures and pipeline-duplication descriptions are superseded by the V2 verification updates above and the V2.1 reports. V2.1 work and remaining verification conditions are recorded in V2_1_ISSUE_RESOLUTION_REGISTER.md and V2_1_REMEDIATION_REPORT.md. A local registry pass does not establish an exact GitHub installation.
