# Security and deployment

Keep model keys, Supabase server credentials, `.env.local`, generated corpora and build output out of Git and browser bundles. The environment template contains placeholders only. Review the provided migration before applying it to your own dedicated Supabase project. Shared quota must succeed before a model request; anonymous analytics omit raw questions and answers.

Set conservative request and spend limits and current regional model prices, and configure provider-side spending controls. Public access is disabled by default. Before enabling it, configure the exact HTTPS origin, test authorization and abuse limits, and review the model's answers against the cited passages. A valid source link alone does not prove a claim is supported. For Vercel Preview, verify platform Deployment Protection independently; origin checks are not authentication.

Built-in public/preview policy covers the mock-tested Qwen and OpenAI model IDs listed in the service guide. A custom server adapter must explicitly approve an exact tested model; absence or failure of that policy fails closed. This is not a claim that arbitrary providers or databases are supported.

See the complete [security guide](https://github.com/vincentlow02/portfolio-ai-source-kit/blob/main/docs/security.md) and [evaluation guide](https://github.com/vincentlow02/portfolio-ai-source-kit/blob/main/docs/evaluation.md) in the source repository.
