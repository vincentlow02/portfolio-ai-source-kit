# V2.1 Regression Test Results

## Final executable snapshot `f1806e1`

| Check | Observed result |
|---|---|
| Original 55 offline checks plus added regressions | `npm run test:offline` passed **87/87**, exit 0. The original test files remain in the suite. Browser checks used installed Chrome and serial execution. |
| Next.js Source Kit and Atlas | Local Registry installation into the independent Atlas host, production build, type check, route and browser integration all passed. The fixture checks authorization, privacy, text selection, citation navigation, follow-up, cancellation and mock quota. |
| Vite Local Preview | The offline preview and chat adapter tests execute the local runtime. Excerpt selection and links, iframe history/reset, mock model response validation and failure handling passed. |
| Hosted Assistant | The actual local Next/webpack Hosted fixture passed, exit 0. The Japanese comparison returned both expected citation URLs. Unsupported extra qualifiers and participant names yielded empty sources. Excerpt and stub-model paths, origin handling and fail-closed shared quota passed. |
| Second Portfolio and Local Registry | `node scripts/test-registry-install.mjs --local` passed both clean hosts, exit 0. The second host verified mobile chat, reset, citations, protected content, authorization and mock quota failure. |
| PostgreSQL quota | Fresh loopback PostgreSQL 16.16 passed the 12/5 concurrent reservation, lock/rollback, RLS, grant and ceiling checks. See the security report for the Windows launch observation and exact acceptance counts. |
| Dependency advisory audit | Production-only and full `npm audit` both completed with exit 0 and zero entries on the exact unchanged lockfile. |
| Retrieval | Original 100 cases retained. The latest independent and frozen confirmations, disagreements and per-case timings are linked in the retrieval report. |
| Source ZIP and clean reinstall | Candidate archive of `f1806e1` matched all 307 Git entries. SHA-256 `4476c803cd7e18db731cb6168960f451dc702abc3ba84880543852bd8531b41d`. A fresh extraction ran `npm ci --ignore-scripts` and `npm run test:offline`, both exit 0 and 87/87 tests. The final archive includes the later report and evidence records and is audited against its own commit. |
| Live provider, production deployment and exact GitHub SHA | **NOT VERIFIED**. The completed local checks use test fixtures and stub credentials. |

The interrupted prior check at `3a60eb7` subsequently recorded 86/86 with exit 0. The 87th case is the Hosted Japanese retrieval regression. The earlier 85- and 86-case runs are retained as historical checks.

## Historical validation

| Check | Result and scope |
|---|---|
| Original offline + added tests | `npm run test:offline` passed 77/77 at source commit `525de60`, with Node 24, installed Chrome and `--test-concurrency=1`; full existing assertions retained. An additional equivalent-participant assertion passed separately at `07299e4`. A parallel attempt failed due to ONNX memory allocation and revealed a Chinese overbroad clarification; the rule was narrowed and the sequential full run passed. |
| Atlas integration | Passed at source `525de60` in the local registry Atlas host using mock provider, fixture quota and a D: temporary directory; authorization, privacy, selections, citations, follow-up, cancellation and concurrency were exercised. |
| Hosted integration | Passed at `437bd50` with default cross-drive temp; the latest source `525de60` also passed webpack, excerpt/model, origin and fail-closed quota. At `e022f38` an initial run failed with JavaScript heap allocation; a sequential retry passed. |
| Local registry / two portfolios | Passed again at source `525de60` via local registry, fresh install, builds, type checks and mock/browser integration in both hosts using a 512 MB npm child-process heap setting. Exact remote GitHub installation is separate and remains unverified. |
| PostgreSQL | Passed on fresh 16.16 instance; 12 concurrent, 5 accepted/7 rejected; rollback lock test passed. See security report. |
| Original 100-question benchmark | Aggregate V2 figures preserved after search fallback; per-case JSON retained. |
| Independent dataset | Frozen initial and fresh cases recorded; several cross-language/comparison misses remain. |
| Dependency audit | `npm audit` and `npm audit --omit=dev` zero reported advisories at check time. |
| Source ZIP and clean reinstall | Git tree `dff86f9` was archived with Windows line conversion disabled; exact blob/manifest checks passed. The ZIP was extracted into a fresh D: directory, `npm ci --ignore-scripts` completed, and both `npm run test:offline` (77/77, recorded exit 0) and Atlas `npm run test:integration` passed. Subsequent report-only updates are re-archived and audited against the final Git tree; they do not change executable source. |
| Exact GitHub SHA / real LLM / production | NOT VERIFIED; local/mock checks cannot establish these. |

System Chrome: `PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`. D: temp/cache were necessary because C: ran out of space. The initial bundled Chromium ICU error and cross-drive Hosted fixture error are environment portability findings, not confirmed application failures.

Additional development check: `npx tsx --test scripts/portfolio-chat/comparison-development.test.mts` returned 2 pass / 1 fail. The failing assertion requires both project research passages for a paraphrase that currently retrieves none. The original `test:offline` command remains at 60/60; it does not include this explicitly failing diagnostic. See the [evaluation notes](v2-1-evaluation/README.md).

**Follow-up:** the previously failing generic interviewee development case now passes using a strictly scoped explicit-interview supplement; the file now has four passing checks and is included in the offline command. The unrelated specific-subject test remains empty. Earlier failure is retained above as history.

One local-registry run after the interviewee change passed Atlas but the second host's Next build failed while another ONNX test was running; an ONNX allocation error was also observed during that period, but its relationship to the build failure is not established. A subsequent isolated run at `bca2817` passed both hosts.

**Additional local test:** `npm run test:offline` passed 67/67 at `b85b1fe`. The newly added fixture checks that unsupported price, wage and manufacturer requests, including verified selections, do not reserve model quota and that supported examples can pass the evidence gate. Hosted passed at `e022f38` after one heap-allocation failure; both local registry hosts passed after retries with the 512 MB test-process setting. A default registry run failed with `Zone Allocation failed`; 256 MB then failed at the TypeScript heap limit. The current ZIP must be regenerated and re-audited after these source changes.

The Hosted integration at `f3e66ea` exercised a Japanese verification comparison through the actual local excerpt route. It returned zero sources on that fixture because only one project was retrieved; the assertion forbids a one-sided result while allowing a future two-sided improvement. This is a recorded retrieval miss, not a real-model quality pass.

## Latest source verification

At `d361c0e` plus the frozen test script, `npm run test:offline` passed **80/80** (exit 0) with installed Chrome and D: temp; focused hybrid/grounding tests and `npx tsc --noEmit` also passed. The local Hosted integration passed (webpack, excerpt, stub model, origin, fail-closed quota; exit 0) but the Japanese comparison fixture returned zero citations, a retrieval miss. The original 100-case benchmark retained the reported aggregate scores. A first registry rerun failed because an npm npx cache entry on C: lacked `package.json`; see subsequent retry status below. The previous archive's 77-test result predates these code changes and does not validate the latest archive.

**Final archive and registry verification:** The local Registry retry with `npm_config_cache=D:\portfolio-ai-v2-1-npm-cache` completed successfully for Atlas and the second host (exit 0); the earlier C: cache failure remains recorded above. Candidate archive from `f9eb6fe` passed exact 267-file Git blob/manifest audit and ZIP negative checks; in a new D: directory, `npm ci --ignore-scripts`, `npm run test:offline` (80/80), and `npm run test:integration` (Atlas browser and route) all exited 0. Subsequent changes are report-only and the final ZIP is audited against its own commit. These are local and mock-provider checks.

## Latest participant/temporal source checks

At `ea807c4`, the offline suite returned 81/81 with exit 0; after adding extra assertions to the same test, that test passed independently. Focused suites passed 33/33 and `tsc --noEmit` exited 0. The Hosted integration exited 0 but its Japanese comparison still had zero citations. The original benchmark aggregates are unchanged. The earlier clean archive and Registry successes precede the latest executable changes; final source must be re-archived and tested, and earlier results cannot be attributed to the new code.

**Latest installation and archive update:** Local Registry installation and mock integration passed Atlas and the second host (exit 0) on the latest executable source. Candidate archive `9d60bb2` passed 276-file Git blob/manifest and negative ZIP checks; its new extraction completed `npm ci --ignore-scripts`, 81/81 offline tests and Atlas integration, each exit 0. Later changes are report-only. Final ZIP is checked against its own commit. These checks do not establish real provider or production behavior.

## Latest retrieval and integration checks

The current executable source passed the full offline suite 85/85, focused checks and TypeScript. The expanded local Hosted fixture passed its original assertions plus actual HTTP checks for explicit two-project participant citations and unsupported names; the Japanese generic test fixture continued to return zero citations. The 100-case benchmark aggregates are unchanged. The previous clean ZIP and Registry results predate the latest source changes and must not be treated as evidence for them; latest verification is recorded below.
