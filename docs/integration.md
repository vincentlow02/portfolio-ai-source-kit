# Integration guide

## Install into an existing host

1. Obtain this source kit and run `node scripts/copy-portfolio-kit.mjs /absolute/path/to/your-app`. The host must already have `package.json`; the installer refuses to overwrite any listed path. Keep the installed `PORTFOLIO_AI_LICENSE` notice.
2. Merge the dependencies and scripts from [`examples/atlas-portfolio/package.json`](../examples/atlas-portfolio/package.json) into your host. This example uses Node 24, Next 16 and React 19; verify compatibility if your stack differs. Do not replace your existing layout or lockfile. Run your package manager to update the lockfile.
3. Adapt the Atlas [server configuration](../examples/atlas-portfolio/portfolio-assistant.server.ts), [chat route](../examples/atlas-portfolio/app/api/studio-assistant/route.ts) and [click route](../examples/atlas-portfolio/app/api/studio-assistant/click/route.ts). Use the Node runtime and allow enough time for the 45-second provider deadline. Set `chatRoutes` and output tracing as in [Atlas's Next configuration](../examples/atlas-portfolio/next.config.ts).
4. Import `PortfolioChatPanel` from your installed `components/portfolio-chat/portfolio-chat-panel` in your root layout as in [Atlas](../examples/atlas-portfolio/app/layout.tsx). Set your own owner name, paths, endpoint, languages and suggestions. The panel takes only browser-safe options; keep database and model credentials on the server.
5. Create `portfolio-knowledge.config.ts` based on the [Atlas manifest](../examples/atlas-portfolio/portfolio-knowledge.config.ts). Run `tsx scripts/portfolio-knowledge/publish.mts` as the build command so the Next build, corpus and file tracing stay synchronized. Update `publishedPaths` in the panel when published routes change.
6. Copy [the environment template](../examples/atlas-portfolio/.env.example) to your host's `.env.local`, fill it with your own credentials and quota settings, and review/apply the included migration to a dedicated Supabase project. See [security and deployment](security.md). Start local browser chat with `node scripts/portfolio-chat/dev-server.mjs` and `PORTFOLIO_AI_LOCAL_DEV=1`; this script binds to loopback.

## Knowledge sources

Each public entry specifies `access`, `format`, and a `page` with same-origin URL, title, language (`en`, `zh`, or `ja`) and kind. Case studies and project details also need a project ID. List each URL/locale once. A protected entry declares `access: "protected"` and a pathname; no content is read from that path or its descendants.

| Format | Input | Validation |
| --- | --- | --- |
| `markdown` or `mdx` | Host file and optional heading-to-anchor map | Static AST parsing; executable MDX and raw HTML are rejected. |
| `json` | File containing a `sections` array of title, text and optional anchor | Schema and public page are checked; compare the text against what is actually rendered. |
| `rendered` | Declared published URL | Captures visible content under `main` with an anonymous browser. |
| protected | Pathname only | Excluded from the corpus and retrieval. |

The anonymous verifier requires a successful exact URL, matching HTML language, visible content and valid unique anchors. `X-Robots-Tag`, robots metadata, hidden elements, private markers and protected paths are respected. Rebuild after content or routing changes. See [architecture](architecture.md).

Sections are limited to 3,000 UTF-8 bytes per evidence chunk, including the section title and newline. Whitespace is normalized to single spaces. Ordinary text retains the existing word-boundary behavior; when a token exceeds the available budget or whitespace is combined with another character in a grapheme, native Unicode word and grapheme segmentation is used. This permits long Chinese and Japanese text without inserting spaces or splitting emoji and combining sequences. A grapheme larger than the available budget and malformed Unicode fail explicitly. Source URLs, anchors and section metadata are retained for every chunk; chunk IDs are deterministic for unchanged input.

For reconstruction of normalized section text, join ordinary word-boundary chunks with a single space. For the Unicode fallback (an oversized token or combined-whitespace grapheme), concatenate chunk bodies without adding a separator; any spaces at boundaries are preserved in those bodies. This distinction preserves compatibility with the original chunk format.

## Example and tests

To try Atlas, copy `examples/atlas-portfolio` into a new directory, run the installer into that directory, then `npm ci`, `npm run build` and `npm run typecheck` there. Configure its own `.env.local` and run `npm run dev` to use a real provider. From this repository root, `npm ci`, `npm run test:offline`, and `npm run test:integration` run offline and fresh Atlas checks with fake model and database services; these tests do not incur model charges.
