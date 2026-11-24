# V2.1 evaluation notes

The original `prism-implementation-6` fixture case is `Prism は字幕をどこに保存しますか？`. V2's `architecture-evaluation.mts` constructs corpus hash `28c76e7d2f349a4e822abf2e07223f2320d68524b4c2382c357c9d496c60b83e`; the expected public chunk is `ae78b79ec8fe17308264f702` (`/work/prism#implementation`). On this Windows/Node 24 environment, the V2 rerun returned that exact chunk with fused score 0.5347803083599023; the V2.1 run also returned it. This conflicts with the V2 evaluation document's earlier miss. The historical run's model artifact and raw score were not retained here, so the reason for the difference is NOT VERIFIED; do not infer a fix from this rerun.

The new synthetic dataset in `scripts/portfolio-chat/independent-evaluation.mts` is frozen before comparison. Four projects/eight passages and twelve questions are far too few for population estimates. Development has 4 supported, 1 unrelated and 1 ambiguous case; holdout has 4 supported, 1 unrelated and 1 ambiguous. `v2.json` and `v2-1.json` retain per-case text, expected URLs, retrieval top 5, assembled evidence, flags and timings. A single question can expect multiple passages. Recall and coverage average per supported question; irrelevant ratio divides non-labelled pack entries by all pack entries, including entries subsequently suppressed by clarification. Unsupported abstention and ambiguity clarification are reported separately. Each case runs preparation and, if necessary, the shared generation executor with a stubbed provider; `modelCalls` counts actual mock HTTP calls and `answerPathMs` includes the stubbed generation. No network model or quality claim is implied. The quota/HTTP adapters are not timed by this script.

| Split | Version | Recall@5 | Evidence coverage | Irrelevant evidence ratio | Unsupported abstention | Ambiguous clarification |
|---|---|---:|---:|---:|---:|---:|
| Dev | V2 | 25% | 50% | 33.33% | 1/1 | 0/1 |
| Dev | V2.1 | 25% | 50% | 33.33% | 1/1 | 1/1 |
| Holdout | V2 | 100% | 75% | 62.5% | 1/1 | 1/1 |
| Holdout | V2.1 | 100% | 75% | 62.5% | 1/1 | 1/1 |

Development `d3` (paraphrased Tide evaluation) and `d4` (cross-language comparison) have no evidence. Holdout `h2` retrieves the correct passage but evidence assembly excludes it; `h3` includes four non-labelled passages. These are failures/risks, not passing aggregate scores. No threshold tuning was performed on holdout. Original 100-question results are also retained per case in `original-v2.json` and `original-v2-1.json`; the reported aggregate metrics did not change.

V2 made six mock provider calls in total; V2.1 made five. The difference is `d6`: V2 generated once, V2.1 clarified without generation. All other cases made either zero or one call. Latency samples are single local observations and include cold-start and scheduling effects; they cannot support a production performance or speedup claim. See the JSON rows for retrieval, preparation and stubbed answer-path times.
