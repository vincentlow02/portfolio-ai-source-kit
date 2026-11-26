# Portfolio AI source kit

Add a chat box to an existing portfolio. The Kit reads the public pages you approve and answers one question at a time with source links. Its default excerpt mode needs no API key or database.

## Hosted assistant

For an existing public website, deploy the Kit on Vercel and paste one script into your site.

1. With Node.js 24, open your Kit checkout and run discovery with the public HTTPS address of your portfolio.

   ```sh
   npm ci
   npm run discover:portfolio -- --origin https://portfolio.example.com
   ```

2. Review the discovery report. It shows each candidate's URL, title, language, and extracted text section count. It also explains why checked paths were skipped. Include the homepage, case studies, and any public contact page you want the assistant to use. Copy the printed `PORTFOLIO_SITE_ORIGIN` and your approved `PORTFOLIO_SOURCE_PATHS` into your assistant project's Vercel environment variables, then deploy your fork. The build log shows how many passages and links were indexed on each page and lists any explicit exclusions. [Supported sources](docs/integration.md#knowledge-sources)

3. Replace the example script URL with the assistant's deployment URL. Paste the script before `</body>` in your portfolio and publish your site.

   ```html
   <script src="https://your-assistant.example.com/embed.js" defer></script>
   ```

4. Open your portfolio and click **Ask about this portfolio**. Try “Who is the portfolio owner?” or “What projects are featured here?” The assistant uses your published profile and project pages. Expand **Sources** to open the evidence.

On desktop, select text on an approved portfolio page and click **Ask AI Kit** beside it. The selected passage appears above the question field. You can remove it or send it with your question.

The Kit reads profile text, projects, and visible links from the approved pages. Visitors can open links such as GitHub, an email address, or a résumé directly from the reply. Descriptive link text or an accessible label makes even icon links findable. [Knowledge sources](docs/integration.md#knowledge-sources)

### Maintain your knowledge base

Edit the content on your portfolio, then redeploy the assistant to rebuild its knowledge. Run discovery again to find new pages and update your approved paths. For finer control, use a manifest to combine automatically captured pages with your own Markdown, MDX, or JSON excerpts from published pages. [Customize your knowledge base](docs/integration.md#customize-your-knowledge-base) · [Automatic refresh setup](docs/integration.md#automatic-knowledge-refresh)

### Optional model replies

Choose a provider in the assistant project's server environment and set `PORTFOLIO_HOSTED_MODEL=1`. [Environment template](.env.example)

| Provider | Configuration |
| --- | --- |
| Qwen | `PORTFOLIO_AI_PROVIDER=qwen`, `QWEN_API_KEY`, and the regional `QWEN_BASE_URL`. Optionally set `QWEN_MODEL`. |
| OpenAI | `PORTFOLIO_AI_PROVIDER=openai` and `OPENAI_API_KEY`. Optionally set `PORTFOLIO_AI_MODEL`. |
| Vercel AI Gateway | `PORTFOLIO_AI_PROVIDER=gateway` and `AI_GATEWAY_API_KEY`. Choose a model with `PORTFOLIO_AI_MODEL`. |

In Vercel Firewall, publish a custom rule with the `@vercel/firewall` condition and Rate Limit ID `portfolio-ai-qwen`. This is the shared rule ID for all providers. Set a request count and window, choose **Deny** at the limit, and enable Vercel's system environment variables before redeploying. Then ask a question with a known source and check usage in your provider dashboard. [Firewall SDK setup](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) · [Security and quota](docs/security.md)

Generated replies send the question and selected public passages to your provider and can incur token charges. The widget keeps the question text in the current interaction. The assistant returns cited excerpts when generation or quota is unavailable. Set `PORTFOLIO_HOSTED_MODEL=0` and redeploy to use excerpts for every question.

## Install into your Next.js portfolio

To use the React panel and server routes directly in a Next.js App Router portfolio, replace `PUBLISHED_REF` with a published tag or commit.

```sh
npx -y shadcn@4.23.0 add 'vincentlow02/portfolio-ai-source-kit/portfolio-ai#PUBLISHED_REF'
```

Review the file targets before installing. The command adds Kit source and `.portfolio-ai/SETUP.md`. Use that guide to connect your own layout, approve your public sources and test with mocks. Node 24, Next 16 and React 19 are the tested baseline. [Registry file targets](registry.json) · [Manual setup and example](docs/integration.md#install-into-an-existing-host)

## Local development

- [Preview the widget in a local Vite portfolio](docs/integration.md#vite-local-preview)
- [Try Qwen in the local preview](docs/integration.md#preview-qwen-locally)
- [Build the Atlas example and run tests](docs/integration.md#example-and-tests)
- [Architecture](docs/architecture.md) and [troubleshooting](docs/evaluation.md)
- [Historical release and audit reports](docs/archive/README.md)

## License

The kit and fictional example are covered by the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies and model licenses.
