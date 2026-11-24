# Architecture V2 baseline

Baseline source: `4fcfcf39f2fdd6cc812e94a5454d0993aa592f04`. Clean worktree before branching. Node 24.19.0, npm 12.2.0, Windows, local Chrome, fixed CPU model assets verified by the downloader. All generation-facing suites use fixtures. No real model or database was called.

`node node_modules/tsx/dist/cli.mjs scripts/portfolio-chat/architecture-evaluation.mts` evaluates 100 fictional questions split by project group. It records retrieval top-five scores against authored source labels and observes the actual B2 pack. Comparisons accept both projects' passages. Source labels are a narrow relevance proxy. The dataset is not an LLM judge or production benchmark.

| Split | Cases | Recall@5 | Precision@5 | MRR@5 | Evidence coverage | Irrelevant evidence | Unsupported had empty pack |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Development | 50 | 84.09% | 71.59% | 0.9091 | 100% | 76.34% | 0/6 |
| Holdout | 50 | 81.25% | 67.23% | 0.8523 | 100% | 73.28% | 0/6 |

Single-process measurement: cold retrieval 2,747 ms; subsequent p50 10.1 ms, p95 13.6 ms; end RSS 500 MiB. Concurrent local setup was active during the sample, so latency is descriptive. The 100% pack coverage reflects indiscriminate supplementation and is not proof of accurate retrieval.

Baseline checks on untouched production code: offline suite 44 passed / 0 failed; tracked-source audit and positive/negative ZIP checks passed. Atlas and exact public baseline registry integrations were launched with sanitized mock services. Local Docker could not connect to its Linux daemon, and no local `psql` executable was found. Real deployment, real model quality and production quota are outside the local baseline.
