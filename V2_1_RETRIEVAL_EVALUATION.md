# V2.1 Retrieval Evaluation

Full methodology and per-case data: `docs/v2-1-evaluation/README.md`, `original-v2.json`, `original-v2-1-final.json`, `v2-fresh.json` and `v2-1-final.json`. Results below are per supported query; irrelevant evidence is a proportion of all assembled entries. Timings are single local observations and generation uses a mock provider.

| Dataset | Version | Recall@5 | Evidence coverage | Irrelevant evidence | Unsupported abstention | Ambiguity clarification |
|---|---|---:|---:|---:|---:|---:|
| Original development (44 supported) | V2 and V2.1 | 84.09% | 96.59% | 30.00% | 6/6 | Not measured |
| Original holdout (44 supported) | V2 and V2.1 | 81.25% | 92.61% | 28.77% | 6/6 | Not measured |
| Independent development (4 supported) | V2 | 25% | 50% | 33.33% | 1/1 | 0/1 |
| Independent development | V2.1 | 25% | 50% | 33.33% | 1/1 | 1/1 |
| Fresh confirmation (4 supported) | V2 | 50% | 50% | 33.33% | 1/1 | 0/1 |
| Fresh confirmation | V2.1 | 50% | 50% | 33.33% | 1/1 | 1/1 |

The first independent holdout was used to investigate a cross-language assembly miss and is no longer blind. Its later 100% coverage on four answerable cases cannot validate generalization. The fresh cases were authored after the fix and evaluated once; the Japanese `f2` and comparison `f4` still miss, and `f3` admits an additional non-labelled passage. No semantic threshold was lowered. Case-level actual stubbed provider call counts and retrieval/answer path times are in JSON. In the first independent set `d6` changes from one mock model call to zero; ordinary generated cases make one.

The documented original Japanese case is `Prism は字幕をどこに保存しますか？`, corpus hash `28c76e7d2f349a4e822abf2e07223f2320d68524b4c2382c357c9d496c60b83e`, expected chunk `ae78b79ec8fe17308264f702`. This machine's rerun of V2 and V2.1 retrieved it; V2 score was 0.53478. The historical report says it missed, but its exact model artifact and raw score are not available, so the reason for the discrepancy is NOT VERIFIED. Do not claim a multilingual model improvement from this case.

The fresh ambiguity case `f5` duplicates an added pronoun regression question, so its 1/1 clarification is not independent evidence. The other fresh cases were not used for tuning.

After the English interviewee and negative-action changes, the frozen sets were rerun for regression at `bca2817`: original benchmark totals are unchanged, and `f2`/`f4` still abstain. Because the fresh-set outputs had been inspected before this rerun, the repeated result is regression evidence, not a new blind estimate. See `original-v2-1-latest.json` and `v2-1-latest.json`.
