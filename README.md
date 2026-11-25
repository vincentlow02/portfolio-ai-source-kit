# Portfolio AI source kit

Add a chat box to your portfolio. It searches the public pages you approve and returns matching excerpts with links. The hosted widget answers one question at a time.

## Hosted assistant

For an existing public website, deploy the Kit on Vercel and paste one script into your site.

1. Import a fork of this repository into Vercel. Set these two environment variables, replacing the example site and paths with your own. Deploy the assistant. Each approved URL needs to open without signing in and display its content in `<main>`.

   ```dotenv
   PORTFOLIO_SITE_ORIGIN=https://portfolio.example.com
   PORTFOLIO_SOURCE_PATHS=/,/projects
   ```

2. Replace the example script URL with the assistant's deployment URL. Paste the script before `</body>` in your portfolio and publish your site.

   ```html
   <script src="https://your-assistant.example.com/embed.js" defer></script>
   ```

3. Open your portfolio, click **Ask about this portfolio**, and ask about something on an approved page. Expand **Sources** and open the linked page to check the answer.

Hybrid search runs on the host and needs no model key or database. [Supported sources](docs/integration.md#knowledge-sources) · [Hosting limits](docs/integration.md#hosting-limits-and-retrieval)

### Refresh when your portfolio changes

Redeploy the assistant to rebuild its knowledge from the approved pages. You can also trigger a rebuild after each successful portfolio release. [Automatic refresh setup](docs/integration.md#automatic-knowledge-refresh)

### Optional Qwen on the hosted assistant

1. In the assistant project's server environment, set `PORTFOLIO_HOSTED_MODEL=1`, `QWEN_API_KEY` and `QWEN_BASE_URL` for the key's region. [Environment template](.env.example) · [Model Studio Base URLs](https://www.alibabacloud.com/help/en/model-studio/base-url)
2. In the assistant project's Vercel Firewall, add a custom rule with the `@vercel/firewall` condition and Rate Limit ID `portfolio-ai-qwen`. Set a request count and window, choose **Deny** at the limit, and publish the rule. Enable Vercel's system environment variables and redeploy. [Firewall SDK setup](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)
3. Ask a question with a known source and check the key's usage in Model Studio. If model access or quota is unavailable, the assistant returns cited excerpts. [Security and quota](docs/security.md)

Generated replies send the question and selected public passages to the provider and can incur token charges. The widget does not save visitors' question text. Set `PORTFOLIO_HOSTED_MODEL=0` and redeploy to return to excerpts. [Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)

## Install into your Next.js portfolio

To use the React panel and server routes directly in a Next.js App Router portfolio, replace `PUBLISHED_REF` with a published tag or commit.

```sh
npx -y shadcn@4.23.0 add 'vincentlow02/portfolio-ai-source-kit/portfolio-ai#PUBLISHED_REF'
```

Review the file targets before installing. The command adds Kit source and `.portfolio-ai/SETUP.md`. Use that guide to connect your own layout, approve your public sources and test with mocks. Node 24, Next 16 and React 19 are the tested baseline. [Registry file targets](registry.json) · [Manual setup and example](docs/integration.md#install-into-an-existing-host)

## Local development

- [Preview the widget in a local Vite portfolio](docs/integration.md#vite-local-preview)
- [Build the Atlas example and run tests](docs/integration.md#example-and-tests)
- [Architecture](docs/architecture.md) and [troubleshooting](docs/evaluation.md)

## License

The kit and fictional example are covered by the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies and model licenses.
