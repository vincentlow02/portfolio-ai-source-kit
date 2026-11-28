# Portfolio AI source kit

Add a chat box to an existing portfolio. The Kit reads the public pages you approve and answers one question at a time with source links. Its default excerpt mode needs no API key or database.

## Hosted assistant

Deploy your own copy of the Kit on Vercel and add its script to your portfolio.

1. Fork the Kit and import the fork as a Vercel project. In that assistant project, set `PORTFOLIO_SITE_ORIGIN` to your portfolio's public HTTPS origin, such as `https://portfolio.example.com`. Set `PORTFOLIO_SOURCE_PATHS` to the public pages you want it to read, for example `/,/projects`. On Hobby, start with `PORTFOLIO_RETRIEVAL_MODE=keyword` and `PORTFOLIO_HOSTED_MODEL=0`. Deploy the assistant. [Vercel Hobby setup](docs/integration.md#vercel-hobby-setup) · [Discover and approve pages](docs/integration.md#knowledge-sources)
2. Replace the example domain with your assistant's deployment domain. Add the script before `</body>` in your portfolio and publish the site.

   ```html
   <script src="https://your-assistant.example.com/embed.js" defer></script>
   ```

3. Open your portfolio and click **Ask about this portfolio**. Ask about a project from an approved page. Expand **Sources** and check that the link opens the right page on your portfolio.

### Customize and optimize

| If you want to… | Start here |
| --- | --- |
| Match the chat UI to your portfolio | Share `components/portfolio-chat/` and the [UI customization prompt](components/portfolio-chat/UI_CUSTOMIZATION.md) with your coding assistant. |
| Fix missing, outdated, or incorrect sources | Edit the published pages or approved paths, rebuild the assistant, and check the citation for the same question. [Maintain your sources](docs/integration.md#customize-your-knowledge-base) · [Automatic refresh](docs/integration.md#automatic-knowledge-refresh) |
| Keep a large portfolio practical to deploy | Start with your key pages and expand after checking build time and indexed passage count. Keyword mode is available for hosts with tighter resource limits. [Hosting limits and retrieval](docs/integration.md#hosting-limits-and-retrieval) |
| Add generated answers | Connect your own model account and configure its quota. Compare the same questions in excerpts and model mode. [Model setup](#optional-model-replies) |
| Manage public chat traffic | [Configure per-IP limits](docs/security.md#limit-public-chat-requests) and review rule matches before tuning the threshold. |
| Review visitor questions and replies | [Enable private question logging](docs/security.md#optional-hosted-question-logging) in your own Supabase project. |

### Optional model replies

Choose a provider in the assistant project's server environment and set `PORTFOLIO_HOSTED_MODEL=1`. [Environment template](.env.example)

| Provider | Configuration |
| --- | --- |
| Qwen | `PORTFOLIO_AI_PROVIDER=qwen`, `QWEN_API_KEY`, and the regional `QWEN_BASE_URL`. Optionally set `QWEN_MODEL`. |
| OpenAI | `PORTFOLIO_AI_PROVIDER=openai` and `OPENAI_API_KEY`. Optionally set `PORTFOLIO_AI_MODEL`. |
| Vercel AI Gateway | `PORTFOLIO_AI_PROVIDER=gateway` and `AI_GATEWAY_API_KEY`. Choose a model with `PORTFOLIO_AI_MODEL`. |

Choose a [model quota backend](docs/security.md#limit-public-chat-requests). For the Vercel Firewall backend, publish a rule with the `@vercel/firewall` condition and Rate Limit ID `portfolio-ai-qwen`, shared across providers. Set a request count and window, choose **Deny** at the limit, and enable Vercel's system environment variables before redeploying. On Hobby, keep your existing per-IP rule if you use Supabase for model quota. Then ask a question with a known source and check model usage in your provider dashboard. [Firewall SDK setup](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) · [AI Gateway pricing and eligible models](https://vercel.com/docs/ai-gateway/pricing)

Generated replies send the question and selected public passages to your provider and can incur token charges. The widget keeps the question text in the current interaction by default. The assistant returns cited excerpts when generation or quota is unavailable. Set `PORTFOLIO_HOSTED_MODEL=0` and redeploy to use excerpts for every question.

## Install into your Next.js portfolio

To use the React panel and server routes directly in a Next.js App Router portfolio, replace `PUBLISHED_REF` with a published tag or commit.

```sh
npx -y shadcn@4.23.0 add 'vincentlow02/portfolio-ai-source-kit/portfolio-ai#PUBLISHED_REF'
```

Review the file targets before installing. Use `.portfolio-ai/SETUP.md` to connect your layout, approve public sources, and test with mocks. The same [UI customization guide](components/portfolio-chat/UI_CUSTOMIZATION.md) comes with the panel. Node 24, Next 16 and React 19 are the tested baseline. [Registry file targets](registry.json) · [Manual setup and example](docs/integration.md#install-into-an-existing-host) · [Upgrade a customized installation](docs/integration.md#upgrade-a-customized-installation)

## Local development

- [Preview the widget in a local Vite portfolio](docs/integration.md#vite-local-preview)
- [Try Qwen in the local preview](docs/integration.md#preview-qwen-locally)
- [Build the Atlas example and run tests](docs/integration.md#example-and-tests)
- [Code layout and architecture](docs/architecture.md#repository-layout) and [troubleshooting](docs/evaluation.md)
- [Historical release and audit reports](docs/archive/README.md)

## License

The kit and fictional example are covered by the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies and model licenses.
