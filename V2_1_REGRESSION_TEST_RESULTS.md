# V2.1 Regression Test Results

| Check | Result and scope |
|---|---|
| Original offline + added tests | `npm run test:offline` passed 60/60 at `5623571` with Node 24, installed Chrome and `--test-concurrency=1`; full existing assertions retained. A parallel attempt failed due to ONNX memory allocation and revealed a Chinese overbroad clarification; the rule was narrowed and the sequential full run passed. |
| Atlas integration | Passed at `1eeefe6` using mock provider, fixture quota and a D: temporary directory; authorization, privacy, selections, citations, follow-up, cancellation and concurrency were exercised. |
| Hosted integration | Passed at `437bd50` with default cross-drive temp; rerun at `5623571` passed webpack, excerpt/model, origin and fail-closed quota. |
| Local registry / two portfolios | Passed at `5623571` via local registry, fresh install, builds, type checks and mock/browser integration in both hosts. Exact remote GitHub installation is separate and remains unverified. |
| PostgreSQL | Passed on fresh 16.16 instance; 12 concurrent, 5 accepted/7 rejected; rollback lock test passed. See security report. |
| Original 100-question benchmark | Aggregate V2 figures preserved after search fallback; per-case JSON retained. |
| Independent dataset | Frozen initial and fresh cases recorded; several cross-language/comparison misses remain. |
| Dependency audit | `npm audit` and `npm audit --omit=dev` zero reported advisories at check time. |
| Source ZIP and clean reinstall | NOT VERIFIED until final commit is created, archived, audited and extracted. |
| Exact GitHub SHA / real LLM / production | NOT VERIFIED; local/mock checks cannot establish these. |

System Chrome: `PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`. D: temp/cache were necessary because C: ran out of space. The initial bundled Chromium ICU error and cross-drive Hosted fixture error are environment portability findings, not confirmed application failures.
