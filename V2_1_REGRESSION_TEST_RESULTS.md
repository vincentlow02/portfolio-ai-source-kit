# V2.1 Regression Test Results

| Check | Result and scope |
|---|---|
| Original offline + added tests | `npm run test:offline` passed 73/73 at `93091ae`, with Node 24, installed Chrome and `--test-concurrency=1`; full existing assertions retained. An additional equivalent-participant assertion passed separately at `07299e4`. A parallel attempt failed due to ONNX memory allocation and revealed a Chinese overbroad clarification; the rule was narrowed and the sequential full run passed. |
| Atlas integration | Passed at `1eeefe6` using mock provider, fixture quota and a D: temporary directory; authorization, privacy, selections, citations, follow-up, cancellation and concurrency were exercised. |
| Hosted integration | Passed at `437bd50` with default cross-drive temp; the latest source `3a5416e` also passed webpack, excerpt/model, origin and fail-closed quota. At `e022f38` an initial run failed with JavaScript heap allocation; a sequential retry passed. |
| Local registry / two portfolios | Passed again at source `3a5416e` via local registry, fresh install, builds, type checks and mock/browser integration in both hosts using a 512 MB npm child-process heap setting. Exact remote GitHub installation is separate and remains unverified. |
| PostgreSQL | Passed on fresh 16.16 instance; 12 concurrent, 5 accepted/7 rejected; rollback lock test passed. See security report. |
| Original 100-question benchmark | Aggregate V2 figures preserved after search fallback; per-case JSON retained. |
| Independent dataset | Frozen initial and fresh cases recorded; several cross-language/comparison misses remain. |
| Dependency audit | `npm audit` and `npm audit --omit=dev` zero reported advisories at check time. |
| Source ZIP and clean reinstall | Git tree `2b586a4` was archived with Windows line conversion disabled; exact blob/manifest checks passed. The ZIP was extracted into a fresh D: directory, `npm ci --ignore-scripts` completed, and both `npm run test:offline` (73/73) and Atlas `npm run test:integration` passed. Subsequent report-only updates are re-archived and audited against their final Git tree; they do not change executable source. |
| Exact GitHub SHA / real LLM / production | NOT VERIFIED; local/mock checks cannot establish these. |

System Chrome: `PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`. D: temp/cache were necessary because C: ran out of space. The initial bundled Chromium ICU error and cross-drive Hosted fixture error are environment portability findings, not confirmed application failures.

Additional development check: `npx tsx --test scripts/portfolio-chat/comparison-development.test.mts` returned 2 pass / 1 fail. The failing assertion requires both project research passages for a paraphrase that currently retrieves none. The original `test:offline` command remains at 60/60; it does not include this explicitly failing diagnostic. See `docs/v2-1-evaluation/README.md`.

**Follow-up:** the previously failing generic interviewee development case now passes using a strictly scoped explicit-interview supplement; the file now has four passing checks and is included in the offline command. The unrelated specific-subject test remains empty. Earlier failure is retained above as history.

One local-registry run after the interviewee change passed Atlas but the second host's Next build failed while another ONNX test was running; an ONNX allocation error was also observed during that period, but its relationship to the build failure is not established. A subsequent isolated run at `bca2817` passed both hosts.

**Additional local test:** `npm run test:offline` passed 67/67 at `b85b1fe`. The newly added fixture checks that unsupported price, wage and manufacturer requests, including verified selections, do not reserve model quota and that supported examples can pass the evidence gate. Hosted passed at `e022f38` after one heap-allocation failure; both local registry hosts passed after retries with the 512 MB test-process setting. A default registry run failed with `Zone Allocation failed`; 256 MB then failed at the TypeScript heap limit. The current ZIP must be regenerated and re-audited after these source changes.
