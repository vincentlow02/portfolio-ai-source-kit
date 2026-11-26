# V2.1 Architecture Changelog

The repair branch starts at V2 `f370bebfb158f9a92d26502f6946d6a89ed76b44`. The earlier `4fcfcf39f2fdd6cc812e94a5454d0993aa592f04` tree remains the historical architecture baseline. The executable snapshot for final validation is `f1806e1`. Next.js, Vite and Hosted retain their adapters and use the shared Answer Engine for model preparation, generation and validation. Hosted and Vite can still return deterministic excerpts.

`57e976b`, `456e2b5` and `757c534` require affirmative direct English study evidence for the generic participant comparison. They reject known negative, conditional or merely reported interviews before generation. `bd2294e` consolidates the Japanese retry and admits an English equivalent only when the entire carried question matches a generic completed-testing form and the missing projects have English-only eligible candidates. Original topic eligibility, approved public source rules, score thresholds, pack caps and the all-project requirement still apply. An English passage must contain a recognized direct completed test for these generic Japanese forms.

The accompanying regression checks exercise the actual Hosted HTTP route, cross-language citations, unsupported qualifiers and zero reservation where evidence is absent. The local Registry fixture continues to exercise both independent hosts. The retrieval and grounding changes remain bounded by the documented limits on wording and relationships. See the [current architecture](architecture-v2.md) and [file change register](V2_1_FILE_CHANGE_REGISTER.md).

## Earlier changes

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

Commits `a6de258` and `2c52e83` add counted Chinese/Japanese numeral checks and personal-role checks for first-person and selected female pronouns. These are conservative lexical controls, with known coverage and false-rejection limits described in the security report.

`01f3f6c` adds a limited people-count association check; `07299e4` covers equivalent participant terminology. This complements numeric-presence checking but does not validate arbitrary units or facts.

- `0bee033`: retry an empty single explicit project search with the project label removed while retaining that project's scope and unchanged retrieval thresholds; extend narrow intent checks to counts and dates. Extra retrieval can increase latency and irrelevant evidence.
- `3a5416e`: add a narrow start-of-use intent check to distinguish some creation-date evidence. These lexical gates are not event-level entailment checks and can reject valid facts.

- `4dbf939` temporarily introduced bounded per-project comparison retries; `05b39d7` removed the production change after a two-sided unrelated-evidence counterexample. The latter adds a zero-reservation regression; `lib` matches `16401f9` exactly. Retained experiment artifacts explain the observed recall/precision tradeoff and do not describe final behavior.

- `93091ae`: restore the complete four-project fixture for the comparison quota regression. With local embedding assets available it fails on `4dbf939` and passes after rollback; a smaller corpus and literal-only fallback did not reproduce the defect.

- `dcca1b3`, `6523b85`, `b5e02fe`, `f9ec58e`, `036b31a`: carry explicitly plural project comparisons across turns; constrain each side with conservative same-clause topic cues and preserve numbers/purpose; return paired cited public excerpts in Hosted or abstain. The rules can both miss valid evidence and fail on subtle within-clause relationships. `6bd1856` adds Hosted-route coverage. No extra model or search threshold was introduced.

- `7ab3750`, `8017608`, `e76f381`: clarify a missing plural-comparison topic without reservation, carry named-project scope when the visitor replies to that exact clarification, and recognise limited Chinese/Japanese method terms in English evidence. The assistant message is a context hint rather than evidence; other phrasings and semantic relations remain limited. `eecc26d` verifies the Hosted route and quota-unavailable behavior.

- `c01ec71`: recognise common Chinese and Japanese comparison verbs in conversation history. The localized-history confirmation shares these templates with the added regression tests and is not a generalization estimate.

- `f75c164`, `5d065b0`: bound carried comparison work to 18 projects and 32 distinct topic terms, deduplicate repeated terms and fail closed before retrieval; add zero-reservation regressions. Very large valid comparisons can be refused.

- `640ab1c`, `6b08d2b`, `525de60`, `f3e66ea`: recognize affirmative Japanese passive testing forms, retry an empty carried-comparison search with a scoped `検証`→`テスト` synonym while retaining other terms and thresholds, add a narrow negative-testing guard and verify one fake generation call/zero reservations for development examples. Hosted integration checks that its Japanese excerpt never returns only one side. This increases local retrieval work and does not prove semantic equivalence or resolve all method/count questions.

## Latest changes

`6ee7867` adds scoped Japanese test-method and explicit participant-count checks, retaining score thresholds and requiring public test-related evidence. `d361c0e` prevents selected account/device compounds from establishing human counts in retrieval and cited claims. `583492d` and `434a660` freeze separate synthetic confirmation cases before execution. These are bounded heuristics; the new participant/method confirmation still misses 3/3 supported cases, and negative semantics and source-to-claim relationships remain incomplete.

## Scoped testing relation follow-up

`ea807c4` permits one existing Japanese testing-synonym retry for a missing comparison side, scoped to the resolved projects and retaining original eligibility rules, adds bounded method/participant grammar and a guard for selected future/planned testing forms. It adds local retrieval cost and remains a lexical heuristic, not semantic entailment. A frozen 12-case same-reviewer confirmation still misses 2/4 supported cases; 8/8 negative cases abstain. `1fb61b4` froze that set before first execution and `cdfe34c` recorded results and quota checks.

## Latest comparison updates

`4409c26` adds a bounded bilingual hint to a scoped participant-count retry while retaining all original question text and evidence gates. `f11f1d7` supports an explicitly generic two-project participant comparison using selected direct counted-study evidence. `4a178d3` requires both project excerpts and original-topic evidence for explicit Hosted comparisons; this can increase conservative abstention. `7938ba6` avoids embedding project names into an exact bare testing clarification while applying them as retrieval scope; no threshold changed. All rules are incomplete and the Hosted Japanese generic case remains an open miss.
