# Integration guide

## Install into an existing host

1. Obtain this source kit and run `node scripts/copy-portfolio-kit.mjs /absolute/path/to/your-app`. The host must already have `package.json`; the installer refuses to overwrite any listed path. Keep the installed `PORTFOLIO_AI_LICENSE` notice.
2. Merge the dependencies and scripts from [`examples/atlas-portfolio/package.json`](../examples/atlas-portfolio/package.json) into your host. This example uses Node 24, Next 16 and React 19; verify compatibility if your stack differs. Do not replace your existing layout or lockfile. Run your package manager to update the lockfile.
3. Adapt the Atlas [server configuration](../examples/atlas-portfolio/portfolio-assistant.server.ts), [chat route](../examples/atlas-portfolio/app/api/studio-assistant/route.ts) and [click route](../examples/atlas-portfolio/app/api/studio-assistant/click/route.ts). Use the Node runtime and allow enough time for the 45-second provider deadline. Set `chatRoutes` and output tracing as in [Atlas's Next configuration](../examples/atlas-portfolio/next.config.ts).
4. Import `PortfolioChatPanel` from your installed `components/portfolio-chat/portfolio-chat-panel` in your root layout as in [Atlas](../examples/atlas-portfolio/app/layout.tsx). Set your own owner name, paths, endpoint, languages and suggestions. The panel takes only browser-safe options; keep database and model credentials on the server.
5. Create `portfolio-knowledge.config.ts` based on the [Atlas manifest](../examples/atlas-portfolio/portfolio-knowledge.config.ts). Run `tsx scripts/portfolio-knowledge/publish.mts` as the build command so the Next build, corpus and file tracing stay synchronized. Update `publishedPaths` in the panel when published routes change.
6. Copy the environment template to your host's `.env.local`. Start local browser chat with `node scripts/portfolio-chat/dev-server.mjs` and `PORTFOLIO_AI_LOCAL_DEV=1`. The script binds to loopback, and the chat returns excerpts when no model is configured. For generation, add your provider key and quota settings and review the migration for a dedicated Supabase project. [Environment template](../examples/atlas-portfolio/.env.example) · [Security and deployment](security.md)

## Knowledge sources

For Hosted and Vite preview, approved pages must open at their direct URLs and show their content inside `<main>`. Capture allows same-origin scripts and styles and blocks page-initiated fetch and XHR. Use `/` or lowercase paths with letters, digits and hyphens. The reader treats `/projects/<slug>`, `/work/<slug>`, and `/case-studies/<slug>` as project pages. For a custom route, you can mark the main element with `<main data-portfolio-project="field-notes">`. Keep one case study per project ID and language. If a Vite SPA returns 404 at a direct URL, configure a host rewrite. [Vercel Vite rewrites](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas)

Approve your homepage for questions about the owner. For example, try “Who is the portfolio owner?” to see the published profile text. The Kit reads visible web and email links in the approved content and site footer. Give icon-only links a descriptive `aria-label` or `title`, then ask using that label, such as “Where is the Codeberg link?” Replies open the published destination and cite the portfolio page that listed it.

Discovery checks up to 50 pages it finds through sitemaps and links on the same site. The report lists candidate URLs, titles, languages, and extracted text section counts before approval. It also gives reasons for skipping paths. Candidates must open anonymously and contain visible portfolio text. For Hosted, review and edit the printed paths before setting the environment variables. [Hosted setup](../README.md#hosted-assistant)

Local preview and Hosted builds use the exact approved paths or the configured manifest. After a successful build, check the log for the indexed passage and link counts for each page and for any explicitly excluded paths. Ask “Who is the portfolio owner?” if you included the homepage, or ask about a detail on an approved project page. Expand **Sources** and open the cited page to check the answer.

An automatically captured entry specifies `access: "public"`, `format: "rendered"`, and a same-origin `url`. Capture reads the title and language (`en`, `zh`, or `ja`) from the page. For a curated Markdown, MDX, or JSON source, supply a `page` with its URL, title, language, and kind. Explicit case study and project detail metadata also needs a project ID. List each URL/locale once. A protected entry declares `access: "protected"` and a pathname. The path and its descendants stay outside the index.

For Hosted, set `PORTFOLIO_KNOWLEDGE_CONFIG=./portfolio-knowledge.config.ts` and leave `PORTFOLIO_SOURCE_PATHS` unset. For Vite local preview, pass `--manifest ./portfolio-knowledge.config.ts` instead of `--path`. Default-export an object with a `sources` array. Resolve static file paths relative to the directory where you run the publisher. For a separate Hosted deployment, make those files available in the assistant's build checkout and keep their approved public pages up to date. An exact URL list is sufficient if you only need to read your rendered site. [Manifest example](../examples/atlas-portfolio/portfolio-knowledge.config.ts)

| Format | Input | Validation |
| --- | --- | --- |
| `markdown` or `mdx` | Host file and optional heading-to-anchor map | Static AST parsing; executable MDX and raw HTML are rejected. |
| `json` | File containing a `sections` array of title, text and optional anchor | Schema and public page are checked; compare the text against what is actually rendered. |
| `rendered` | Published URL or explicit page metadata | Captures visible portfolio content with an anonymous browser. |
| protected | Pathname only | Excluded from the corpus and retrieval. |

The anonymous verifier requires a successful exact URL, matching HTML language, visible content and valid unique anchors. `X-Robots-Tag`, robots metadata, hidden elements, private markers and protected paths are respected. Rebuild after content or routing changes. See [architecture](architecture.md).

Sections are limited to 3,000 UTF-8 bytes per evidence chunk, including the section title and newline. Whitespace is normalized to single spaces. Ordinary text retains the existing word-boundary behavior; when a token exceeds the available budget or whitespace is combined with another character in a grapheme, native Unicode word and grapheme segmentation is used. This permits long Chinese and Japanese text without inserting spaces or splitting emoji and combining sequences. A grapheme larger than the available budget and malformed Unicode fail explicitly. Source URLs, anchors and section metadata are retained for every chunk; chunk IDs are deterministic for unchanged input.

For reconstruction of normalized section text, join ordinary word-boundary chunks with a single space. For the Unicode fallback (an oversized token or combined-whitespace grapheme), concatenate chunk bodies without adding a separator; any spaces at boundaries are preserved in those bodies. This distinction preserves compatibility with the original chunk format.

## Customize your knowledge base

For a bio, project, or contact update, edit the portfolio page and publish it. Then rebuild the assistant so its answers use the updated text. Add or remove paths in `PORTFOLIO_SOURCE_PATHS` for Hosted. In local preview, run `preview:local` again to reuse the approved list, or pass `--discover` to review it.

For a more specific introduction, add your name and a short bio to the published homepage, or choose a public excerpt from that page in your manifest. A Markdown excerpt can use the published name as its heading and the bio as its body. Set `page.url` to `/` and use the same name for `page.title`. The Kit still reads visible links from the approved page when you use a curated excerpt.

Use a manifest when you want to select specific excerpts, mix web pages with Markdown, MDX, or JSON files, or exclude a section of the site. Save the following as `portfolio-knowledge.config.ts` in the Kit checkout and adjust the routes to match your site.

```ts
export default {
  sources: [
    { access: "public", format: "rendered", url: "/" },
    { access: "public", format: "rendered", url: "/work/trail-map" },
    {
      access: "public",
      format: "markdown",
      file: "knowledge/faq.md",
      page: { url: "/faq", title: "FAQ", language: "en", kind: "page" },
      anchors: { "Project handoffs": "project-handoffs" },
    },
    { access: "protected", url: "/drafts" },
  ],
};
```

Save this excerpt in `knowledge/faq.md`. Publish the same heading and sentence on `/faq`, with the heading ID `project-handoffs`, so the assistant can cite it.

```md
## Project handoffs

Vector maps are delivered as SVG files.
```

- **Local preview** Run `npm run preview:local -- --origin http://127.0.0.1:5173 --manifest ./portfolio-knowledge.config.ts`, then restart `npm run preview:chat`.
- **Hosted** Keep the manifest and source files in the assistant's build checkout. Set `PORTFOLIO_KNOWLEDGE_CONFIG=./portfolio-knowledge.config.ts`, clear `PORTFOLIO_SOURCE_PATHS`, and redeploy.

Edit your website, manifest, and source files to maintain the knowledge base. Each successful rebuild generates a fresh `.portfolio-knowledge` snapshot. Ask about the updated material after rebuilding and open **Sources** to check the linked page.

## Automatic knowledge refresh

Each assistant deployment rebuilds knowledge from the approved sources. Update `PORTFOLIO_SOURCE_PATHS` or the manifest when you add or remove a source. A failed production build leaves the last successful assistant deployment serving.

Create a Vercel Deploy Hook for the **assistant project's** production branch. Store the hook URL in your publishing system's secrets and trigger it after your **portfolio site's** release is live. [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks)

- **Vercel with GitHub.** Enable `repository_dispatch` in the portfolio project's Vercel Git settings. Copy the example to `.github/workflows/refresh-portfolio-knowledge.yml` on the portfolio repository's default branch. Set the Actions variable `PORTFOLIO_VERCEL_PROJECT_ID` to the portfolio project's ID and the Actions secret `PORTFOLIO_AI_DEPLOY_HOOK_URL` to the assistant's hook URL. [Workflow example](../examples/refresh-portfolio-knowledge.yml) · [Vercel GitHub events](https://vercel.com/docs/git/vercel-for-github#repository-dispatch-events)
- **Other publishing systems.** Send the following request from the step that runs after your site is live.

  ```sh
  curl --silent --fail --max-time 20 --output /dev/null --request POST -- "$PORTFOLIO_AI_DEPLOY_HOOK_URL"
  ```

Test the hook by publishing a change to one approved page. After the assistant rebuilds, ask about the new text and check the citation.

## Hosting limits and retrieval

The default Hybrid build downloads about 135 MB of local model files and stores passage vectors in the private snapshot. Normal requests encode only the question. On a Linux CPU host with a custom install command, set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` before installing dependencies. The Hosted Vercel install command already sets this. [Retrieval architecture](architecture.md#retrieval-modes)

Vercel Hobby can host an eligible personal, non-commercial assistant within the plan's allowances. Deploys, refreshes and chat requests use the hosting allowance. Within that allowance and the applicable Firewall limits, excerpts have zero API charges and optional Qwen adds its provider usage charges. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Function usage](https://vercel.com/docs/functions/usage-and-pricing) · [Firewall limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting#limits) · [Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)

If your Node.js host has tighter resource limits, set `PORTFOLIO_RETRIEVAL_MODE=keyword` for build and runtime and redeploy. Keyword search keeps cited excerpts and optional generation while skipping model files and embedding inference. It needs closer wording matches than Hybrid search.

## Vite local preview

You'll need an existing Vite portfolio, Node.js 24, npm and Chromium. On Windows PowerShell, use `npm.cmd` if the `npm` script is blocked.

1. In the portfolio directory, install its dependencies and start its dev server. Open `http://127.0.0.1:5173/` to check that it displays.

   ```sh
   npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
   ```

2. Keep the Vite terminal running. In a second terminal in the Kit checkout, run discovery and start the chat service after capture. Use the same port as your portfolio.

   ```sh
   npm ci
   npm run preview:local -- --origin http://127.0.0.1:5173
   npm run preview:chat
   ```

   When `preview:local` runs discovery, it shows the candidate details and reasons for skipping paths. Enter `all` or the numbers of specific pages separated by commas. Press Enter on an empty line to cancel. The Kit reuses the approved paths on later runs for the same origin. Add `--discover` when you want to review the list again. For scripted setup, repeat `--path` for each approved page or pass `--manifest` to supply the sources directly.

3. Add this loader before `</body>` in the portfolio's `index.html`. Open the portfolio at `http://127.0.0.1:5173` and ask about an approved page. Use **Sources** to check the excerpt.

   ```html
   <script type="module">
     if (import.meta.env.DEV && window.location.hostname === "127.0.0.1") {
       const chat = document.createElement("script");
       chat.src = "http://127.0.0.1:4174/embed.js";
       document.body.append(chat);
     }
   </script>
   ```

The capture writes `.portfolio-knowledge/local-preview.json`, which Git ignores. Rebuild it and restart chat after changing approved pages or the portfolio port. If you start chat with `--port`, use that port in the loader. The embedded widget submits one question at a time. It uses the current route when asking about an approved project page. On desktop, select a passage on the page and click **Ask AI Kit** to add it to your question.

### Preview Qwen locally

Set the following in the Kit's Git-ignored `.env.local`, then restart chat with `npm run preview:chat -- --model`. Use a key and base URL from the same Model Studio region. [API keys](https://www.alibabacloud.com/help/en/model-studio/get-api-key) · [Base URLs](https://www.alibabacloud.com/help/en/model-studio/base-url)

```dotenv
PORTFOLIO_AI_PROVIDER=qwen
QWEN_API_KEY=your-key
QWEN_BASE_URL=https://your-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-flash
QWEN_JSON_MODE=object
QWEN_ENABLE_THINKING=false
```

Model preview binds to loopback and can incur provider charges. Ask about an approved page and verify that the linked evidence supports the answer.

## Example and tests

Copy `examples/atlas-portfolio` into a new directory. Run `node scripts/copy-portfolio-kit.mjs /absolute/path/to/atlas` from the Kit checkout. In the Atlas directory, run `npm ci`, `npm run build` and `npm run typecheck`. Copy its `.env.example` to `.env.local`, set `PORTFOLIO_AI_LOCAL_DEV=1`, and start `npm run dev` to try excerpts.

From the Kit root, `npm run test:offline` runs the regression suite and `npm run test:integration` checks a fresh Atlas installation. `node --import tsx scripts/test-hosted-integration.mts` checks Hosted and `node scripts/test-registry-install.mjs --local` checks the Registry in two hosts. These tests use fake model and quota services.
