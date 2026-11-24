# Third-party notices

The source kit relies on separately installed third-party packages. No dependency packages are bundled in this repository. Their maintainers retain their copyrights; consult each installed package's license and notices and audit transitive dependencies before redistributing a bundle. The Atlas lockfile records the tested versions.

| Direct dependency | Declared license |
| --- | --- |
| `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `ai` | Apache-2.0 |
| `@orama/orama`, `@orama/tokenizers` | Apache-2.0 |
| `puppeteer`, `typescript` | Apache-2.0 |
| `lucide-react` | ISC |
| `next`, `react`, `react-dom`, `react-markdown` | MIT |
| `remark-gfm`, `remark-parse`, `remark-mdx`, `unified`, `zod` | MIT |
| `@sparticuz/chromium`, `tsx`, `@types/node`, `@types/react`, `@types/react-dom` | MIT |

Browser binaries and their bundled components can have additional terms. Check the exact versions and licenses in the host's installed dependency tree. This list is an inventory, not a substitute for the original license texts or a complete transitive audit.

The embedded chat serves Geist from the installed Next.js package under the SIL Open Font License 1.1. [Geist license](scripts/portfolio-chat/local-preview/geist-OFL.txt)
