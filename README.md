# Portfolio AI source kit

Portfolio AI adds an assistant that answers from selected pages on your own portfolio and links to its sources. Its shared retrieval engine combines keyword and multilingual semantic search.

- [Hosted assistant](#hosted-assistant) deploys a separate service and adds it to a public portfolio with one script.
- [Vite local preview](#vite-local-preview) runs the assistant on your development machine while you keep your existing Vite portfolio.
- [Next.js App Router installation](#install-into-your-nextjs-portfolio) adds the reusable chat UI and server routes to a Next.js portfolio.

## Hosted assistant

Use this route for a public HTTPS portfolio that allows the assistant's script, stylesheet, icons, and frame. The assistant runs in its own project and uses the pages you approve.

Import your fork of the Kit into a Vercel project using the branch or release that contains this guide.

1. Set `PORTFOLIO_SITE_ORIGIN` to your portfolio's canonical HTTPS origin, such as `https://www.example.com`. Set `PORTFOLIO_SOURCE_PATHS` to the exact paths you approve, such as `/,/projects,/projects/field-notes`. The build prepares the retrieval model and generates a private knowledge file. Each page needs an anonymous HTTP 200, a supported HTML language, and visible `<main>` text that renders using same-origin scripts and styles.
2. Copy the assistant's HTTPS deployment origin into this script and add it to your portfolio HTML before `</body>`. Publish your portfolio with the script in place.

   ```html
   <script src="https://your-assistant.example.com/embed.js" defer></script>
   ```

3. Open your public portfolio, select the sparkle button (**Ask about this portfolio**), and ask about a distinctive term from an approved page. Expand **Sources** to check the link. On desktop, you can select a passage from an approved page and use **Ask Portfolio AI** to quote it. Redeploy the assistant to refresh the knowledge base after updating the source pages.

For both Hosted and Vite preview, the widget sends one question at a time. On an approved project page, it also sends the current path so a question like “How was it tested?” can refer to that project. The reader recognizes approved `/projects/<slug>` pages as projects. For another route such as `/work/field-notes`, use `<main data-portfolio-project="field-notes">`. The ID uses lowercase letters, digits, and hyphens. Keep one approved page per project ID and language.

If a Vite portfolio page opens through site navigation but its direct URL returns 404, configure your host to serve the app at that URL before selecting it. For a Vite SPA on Vercel, see [the deep-link rewrite instructions](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

The hosted assistant returns source excerpts without API credentials. To enable generated Qwen answers, copy the settings shown in the [environment template](.env.example) to your assistant project's environment, apply the [quota migration](supabase/migrations/202611100001_vincent_ai_analytics.sql) to a dedicated Supabase project, and set `PORTFOLIO_HOSTED_MODEL=1`. Configure the region, rate limits and budget using the [security and quota guide](docs/security.md). The assistant reserves shared quota before sending the question and selected approved passages to Qwen. Keep provider keys and quota credentials in the assistant project's server environment.

## Vite local preview

You'll need an existing Vite portfolio, Git, Node.js 24, npm, and Chromium. On Windows PowerShell, use `npm.cmd` if the `npm` script is blocked.

### 1. Start your portfolio

Open a terminal in your **Vite portfolio**. Install its dependencies using its usual setup, then start the dev server:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173` and check that a page you want to include, such as `/projects`, displays its content. Keep this terminal running. If you choose a different port, use it for the browser URL and the capture command below.

### 2. Create the knowledge base

Open a second terminal in the **Kit** checkout. For a fresh checkout, use the branch or release that contains this guide. [Kit repository](https://github.com/vincentlow02/portfolio-ai-source-kit)

```sh
npm ci
npm run preview:local -- --origin http://127.0.0.1:5173 --path /projects
```

Replace `/projects` with a public page you approve for the assistant. Repeat `--path` to include more pages. A successful run prints `Local knowledge preview` with the page and passage counts and saves `.portfolio-knowledge/local-preview.json`. Review the passages and their source paths in that file. Git ignores the file.

Use an approved `/projects/<slug>` page or mark its `<main>` with `data-portfolio-project` to let the widget identify the current project.

The reader captures visible text in `<main>` on pages with English, Chinese, or Japanese HTML language declarations. Use `/` or lowercase route paths with letters, digits, and hyphens, such as `/projects/field-notes`. It can load same-origin scripts and styles to render a page. The approved page's text needs to render with those resources, since capture blocks `fetch` and XHR. Protected, hidden, and `noindex` content is excluded.

### 3. Open chat inside your portfolio

From the **Kit** terminal, start the local chat service:

```sh
npm run preview:chat
```

In your **Vite portfolio's** `index.html`, add this development-only loader before `</body>`:

```html
<script type="module">
  if (import.meta.env.DEV && window.location.hostname === "127.0.0.1") {
    const chat = document.createElement("script");
    chat.src = "http://127.0.0.1:4174/embed.js";
    document.body.append(chat);
  }
</script>
```

The first startup downloads about 135 MB of public embedding model files. The Kit caches them in the Git-ignored `.portfolio-knowledge/embedding-model/` directory. It computes embeddings on your machine and needs no API key or database.

Refresh the portfolio at `http://127.0.0.1:5173` and select the sparkle button (**Ask about this portfolio**). Try asking about an approved project using your own wording. The chat shows a matching excerpt in the source language. Expand **Sources** to open the cited page.

If the chat button is missing, check that both terminals are running and that your browser uses the exact `127.0.0.1` origin you captured. If you start chat with `--port`, use that port in the loader. Rebuild the knowledge base and restart chat after changing approved content or the portfolio port.

### Optional Qwen model preview

Create `.env.local` in the **Kit** directory and fill in your [Model Studio API key](https://www.alibabacloud.com/help/en/model-studio/get-api-key) and [OpenAI-compatible base URL](https://www.alibabacloud.com/help/en/model-studio/base-url) from the same region:

```dotenv
PORTFOLIO_AI_PROVIDER=qwen
QWEN_API_KEY=your-key
QWEN_BASE_URL=https://your-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-flash
QWEN_JSON_MODE=object
QWEN_ENABLE_THINKING=false
```

The URL above illustrates a Singapore workspace. Keep the key in the Git-ignored `.env.local` file in the Kit. Stop the chat service with `Ctrl+C` and restart it on the same port:

```sh
npm run preview:chat -- --model
```

Refresh the portfolio. Ask a question about an approved page and check that the cited passage supports the model's answer. Model mode sends the question and selected approved passages to your provider and can incur charges. All Vite preview modes bind to `127.0.0.1` for local testing.

## Try the example

Use Node.js 24, npm and a compatible Chromium installation. Copy `examples/atlas-portfolio` to a separate directory, then from the kit directory run:

```sh
node scripts/copy-portfolio-kit.mjs /absolute/path/to/atlas
cd /absolute/path/to/atlas
npm ci
npm run build
```

Copy `.env.example` in Atlas to `.env.local`, configure your own model and dedicated Supabase project, apply the supplied SQL migration, and run `npm run dev`. Never commit the local environment file. The example's `portfolio-knowledge.config.ts`, `portfolio-assistant.server.ts`, layout and API routes show the integration points.

## Install into your Next.js portfolio

For a Next.js App Router project, review the file targets in `registry.json`. Replace `PUBLISHED_REF` with the published tag or commit of the Kit version you want to install.

```sh
npx -y shadcn@4.23.0 add 'vincentlow02/portfolio-ai-source-kit/portfolio-ai#PUBLISHED_REF'
```

This installs the reusable code, dependencies, example templates and `.portfolio-ai/SETUP.md`. It does not automatically change your layout, choose your sources, configure credentials, apply SQL, or publish your site. The command targets project-root paths; inspect conflicts first and do not overwrite existing files without reviewing them. Node 24, Next 16 and React 19 are the tested baseline. A Figma account is not needed.

Give your coding agent this prompt:

> Read `.portfolio-ai/SETUP.md` and integrate Portfolio AI into this portfolio. Inspect my app and propose the exact public sources and protected paths; wait for my approval before building the knowledge corpus. Use mock services for validation and report the results.

You remain responsible for approving public content, supplying your own model and dedicated Supabase credentials, reviewing the migration and testing the result before public deployment. The fictional Atlas content is an example, not your portfolio's knowledge. Keep your `.env.local` and generated corpus private. Model calls may incur provider charges.

## Manual installation

1. Run `node scripts/copy-portfolio-kit.mjs /absolute/path/to/your-app`. It refuses to overwrite existing files.
2. Add the dependencies and build script from the Atlas `package.json` to your app, while retaining your own layout and design.
3. Adapt the Atlas API routes, `portfolio-assistant.server.ts`, `next.config.ts` and panel integration in `app/layout.tsx`.
4. Declare your public sources and protected paths in a knowledge manifest based on `portfolio-knowledge.config.ts`; build with `tsx scripts/portfolio-knowledge/publish.mts`.
5. Configure server-only credentials, regional model pricing and shared quota in your own `.env.local`. Apply the included SQL migration to a dedicated project only after reviewing it. The legacy `vincent_ai` database identifiers are retained for compatibility.
6. Test citations, protected content, authorization, abuse limits and semantic accuracy against your own material before enabling public access. A valid citation link does not guarantee a model claim is factually supported.

The CI registry test installs the exact GitHub commit into both the Atlas example and an independently structured fictional portfolio; it builds, typechecks and tests interactions with fake model and quota services. It does not make paid model calls.

## Next.js sources and deployment

The builder accepts public rendered pages, Markdown, static MDX and JSON. Static MDX ingestion rejects executable expressions and JSX; use rendered pages for dynamic material. Sources must be visible anonymously at the declared same-origin URL; protected paths are excluded. Rebuild the corpus with the app after content changes.

```mermaid
flowchart LR
  A[Public content and manifest] --> B[Build and anonymous verification]
  B --> C[Private corpus]
  D[Chat panel] --> E[Server route]
  C --> E
  E --> F[Hybrid retrieval and B2 evidence]
  E --> G[Shared Supabase quota]
  F --> H[Structured model response]
  G --> H
  H --> I[Server-owned citations]
```

Keep API and database secrets on the server. Configure an exact allowed HTTPS origin, shared quota and provider-side spend controls. Atlas includes basic security headers in `next.config.ts`; adapt them to your host and test them in deployment. On Vercel Preview, independently verify platform Deployment Protection before enabling chat; an origin check is not authentication. Default public access is disabled. Model output is untrusted and still needs human evaluation; heuristic validation cannot guarantee semantic correctness.

See the [integration guide](docs/integration.md), [architecture](docs/architecture.md), [security and deployment](docs/security.md), and [evaluation and troubleshooting](docs/evaluation.md) for details on the Next.js integration.

## License and dependencies

The kit and fictional example are covered by the accompanying [MIT license](LICENSE). Dependencies are installed separately; preserve their applicable licenses and notices. See [third-party notices](THIRD_PARTY_NOTICES.md) and the example lockfile. No original portfolio assets are included.
