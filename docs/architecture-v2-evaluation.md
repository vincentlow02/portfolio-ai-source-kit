# Architecture V2 evaluation

The 100 original fictional questions use a 50-case development set and a 50-case holdout set split by project. The evaluation compares authored passage labels with the retriever and the assembled evidence pack. The holdout was excluded from the profile sweep. Later inspection of holdout misses was diagnostic. The general interview verb-form correction came from the development set and was checked against the same saved holdout.

| Split | Metric | Baseline | V2 |
| --- | --- | ---: | ---: |
| Development | Recall@5 | 84.09% | 84.09% |
| Development | Precision@5 | 71.59% | 71.59% |
| Development | MRR@5 | 0.9091 | 0.9091 |
| Development | Evidence coverage | 100% | 96.59% |
| Development | Irrelevant evidence | 76.34% | 30.00% |
| Development | Empty evidence for unsupported questions | 0/6 | 6/6 |
| Holdout | Recall@5 | 81.25% | 81.25% |
| Holdout | Precision@5 | 67.23% | 67.23% |
| Holdout | MRR@5 | 0.8523 | 0.8523 |
| Holdout | Evidence coverage | 100% | 92.61% |
| Holdout | Irrelevant evidence | 73.28% | 28.77% |
| Holdout | Empty evidence for unsupported questions | 0/6 | 6/6 |

Comparison labels include every authored passage for both projects. The V2 pack may use one overview or direct match per side, so comparison coverage can fall when both sides still have support. One Japanese question about where caption tracks are stored failed to retrieve its approved English passage. The safe response for that case is abstention. Improve multilingual recall with more independently labeled data before relaxing thresholds.

## Threshold sweep

All profiles below use the **development set only**. For each profile, cutoffs of 3, 5 and 8 gave the same aggregate figures on this small corpus. The production evidence caps remain 18 passages, 3,000 bytes per passage, and 18,000 bytes in total.

| Profile | Pure / assisted cosine | Fused cutoff | Keyword weight | Recall@5 | Precision@5 | Unsupported queries with matches |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Loose | 0.33 / 0.27 | 0.47 | 0.20 | 84.09% | 67.05% | 0/6 |
| Production | 0.365 / 0.30 | 0.50 | 0.20 | 84.09% | 71.59% | 0/6 |
| Strict | 0.41 / 0.34 | 0.55 | 0.20 | 82.39% | 77.27% | 0/6 |
| Lower keyword weight | 0.365 / 0.30 | 0.50 | 0.10 | 84.09% | 74.62% | 0/6 |
| Higher keyword weight | 0.365 / 0.30 | 0.50 | 0.30 | 84.09% | 71.59% | 0/6 |

Retain the existing parameters. The development set suggests examining the lower keyword weight in future multilingual tests. This sample has 12 chunks and provides limited evidence on larger knowledge bases.

## Request cost and grounding

Provider regression tests exercise one request for each Qwen output mode, a 700-token cap, zero automatic retries, caller cancellation, malformed output and provider errors. Mock Next usage traveled back as 600 input and 70 output tokens. The executor fixture separately verifies cached-token reporting. The Next and Hosted HTTP quota fixtures exercise deterministic catalog, Guardian and no-evidence paths while generation quota is unavailable. The answers from those paths still return through their existing HTTP contracts.

The citation suite tests false keys, selected passages, protected content, personal/team attribution and misleading research claims. The checks establish source eligibility, evidence-key and URL integrity, and chosen claim heuristics. Semantic entailment remains a separate manual review task. The 12/12 metric covers evidence abstention on the labeled cases. Mocked answer tests cover deterministic output and parsing. Real provider answer quality and production token usage remain unmeasured.

## Runtime performance

Local Windows, Node 24, CPU MiniLM, 12 fictional chunks. The table uses the first V2 sample after context and cache fixes. A later reproduction during concurrent builds had 4,417 ms cold retrieval and 16.44/26.72 ms warm p50/p95. Background installation and builds were active in both samples. These single-process runs quantify the cost distribution, with too much variance for a speedup claim.

| Measurement | Result |
| --- | ---: |
| V2 cold retrieval | 2,689 ms |
| Cold corpus embedding including encoder load | 2,645 ms |
| Warm retrieval p50 / p95 | 11.35 / 16.43 ms |
| Warm query embedding p50 | 10.52 ms |
| Warm keyword search p50 | 0.19 ms |
| Warm semantic ranking p50 | 0.12 ms |
| Warm evidence assembly p50 | 0.38 ms |
| Four concurrent queries with cold corpus and warm encoder | 210 ms |
| RSS increase across concurrent sample | 16.5 MiB |
| End process RSS | 513 MiB |
| Local mock generation p50 / p95 | 4.24 / 162.58 ms |

The cold stage dominates. The cache shares one in-flight batch across concurrent requests, and the regression verifies recovery after a rejected batch. Deterministic catalog requests skip retrieval when there is no selection. Keep embedding artifacts and external indexes out of this version. Their deployment costs need a representative larger corpus and repeat measurements before adoption.

Run `node --import tsx scripts/portfolio-chat/architecture-evaluation.mts` or add `--profiles` for the development-only threshold sweep.
