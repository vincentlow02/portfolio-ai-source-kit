# Model and quota services

Keep secrets in `.env.local` or your hosting platform's server-only environment. The doctor reads `process.env` and `.env.local` only; it does not reproduce all Next.js environment file precedence or interpolation. Its results are local checks, not proof that credentials, endpoints, quotas or provider behavior work. It never makes network calls or prints values.

## Compatibility and evidence

| Service | Current behavior | Evidence and limits |
| --- | --- | --- |
| Qwen, `qwen3.7-flash` | Local evaluation and opt-in public/protected-preview modes, subject to existing access controls. | Schema and object JSON modes, malformed output and timeout tested with mocks; the complete chat flow is tested with a fake Qwen service. Regional provider behavior and pricing must be checked by the owner. |
| OpenAI, `gpt-4o-mini` | Protected evaluation and opt-in public/protected-preview modes; response storage is disabled by the SDK option. | Mock tests cover the B2 schema, citations, disabled storage, malformed output, timeout and quota failure. They do not verify a live model or service; other OpenAI model IDs remain evaluation-only. |
| Vercel AI Gateway | Configurable for protected evaluation. | Configuration exists; end-to-end provider behavior has not been verified in the mock integration tests. Public and protected-preview modes currently reject it. |
| Supabase quota and analytics | Only bundled database adapter. Shared quota is reserved before the model call; analytics is best effort. | The SQL migration's privileges and concurrent reservations are tested against local PostgreSQL in CI; mocked HTTP failure and quota exhaustion fail closed. A real Supabase project is not validated by the doctor. |
| Other models or databases | No built-in compatibility claim. | Require an adapter and equivalent structured-output, security, quota, concurrency and integration tests. |

The matrix describes verified configurations and explicit restrictions, not a promise that an arbitrary model, endpoint or database works.

## Adapter interfaces

`lib/portfolio-chat/services.ts` defines server-only `ModelProvider`, `Quota` and optional `Analytics` interfaces. The chat route may pass trusted adapters as the second argument to `createPortfolioChatHandler`; the click handler accepts the same analytics adapter. The built-in adapters remain the default, and `analytics: null` disables event reporting. A quota adapter must atomically reserve shared request and estimated cost limits before returning `true`, and should honor the supplied abort signal; false, non-true results, errors and the 3.5-second reservation deadline fail closed. A reservation that finishes after the deadline must never trigger a model call. Analytics receives bounded event metadata, not raw messages or answers; failures are ignored and calls have a 3.5-second deadline. Analytics adapters should also honor the supplied abort signal.

Adapters are application code running with server privileges. Their existence does not establish compatibility or security for another service. In public and protected-preview modes, the model provider's `allowsPublic(model)` must explicitly return `true`; an absent, throwing or non-true policy fails closed. Built-in policy allows only the mock-tested Qwen and OpenAI model IDs above. A custom adapter can define its own explicit policy after the owner tests and approves that exact service and model; do not approve a provider merely because its API is compatible. Before relying on a custom adapter, independently test provider structured output and invalid responses, cancellation, timeouts, source privacy, quota atomicity under concurrency, outages and spend controls. The CI cold-start mock exercises adapter failure behavior; it is not evidence that an external provider or database is supported. The doctor checks the built-in policy only and cannot validate custom adapter policy.

## Configure services

1. Select a supported provider and use `.portfolio-ai/templates/.env.example` as a starting point. For Qwen set `PORTFOLIO_AI_PROVIDER`, `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL` and the applicable JSON mode. Use the appropriate regional pay-as-you-go endpoint and current regional rates. Do not append `/chat/completions` to the base URL. For OpenAI, set `PORTFOLIO_AI_PROVIDER=openai`, `OPENAI_API_KEY` and optionally `PORTFOLIO_AI_MODEL=gpt-4o-mini`. For Gateway protected evaluation, set `PORTFOLIO_AI_PROVIDER=gateway`, `AI_GATEWAY_API_KEY` and a compatible `PORTFOLIO_AI_MODEL`.
2. Review the SQL migration before applying it to a dedicated Supabase project. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, request limits, daily budget and conservative input/output prices. Configure provider-side spending limits as well. Legacy `vincent_ai` object names are compatibility identifiers.
3. Run the doctor. Check the actual model and database separately only with appropriate authorization. Local browser chat uses the loopback dev script and `PORTFOLIO_AI_LOCAL_DEV=1`. Public access is off by default; review exact HTTPS origin, deployment protection, quota, abuse limits, sources and citations before enabling it.

The `configured-locally` doctor result only means that a subset of values passes local checks. It does not verify keys, pricing, provider support, database migrations, network access, source permissions or safe public deployment. A real provider test can incur cost.
