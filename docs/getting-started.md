# Getting started

Portfolio AI is a source kit for an existing Next.js App Router application. Node 24, Next 16.4.6, React 19.2.4, npm and Chromium are the versions exercised in CI. Other versions, package managers and layouts require independent compatibility testing. The item writes source files into the project root; inspect `registry.json` and preview conflicts before installation. Do not overwrite existing application or agent files.

1. Review and install the GitHub Registry item, using the command in the README. For a reproducible installation, replace the ref with the full SHA of a reviewed commit. Review the result and keep `PORTFOLIO_AI_LICENSE`.
2. Ask a coding agent to read `.agents/skills/portfolio-ai-install/SKILL.md` and `.portfolio-ai/SETUP.md`. Have it inspect the host, propose exact public URLs and protected paths, and wait for your approval before constructing the manifest or corpus. The agent adapts the existing panel, routes, server configuration, file tracing and build command without replacing your layout or existing configuration.
3. Run `node scripts/portfolio-chat/doctor.mjs`, then configure the services and perform the [service setup](ai-services-setup.md). Build the approved corpus, typecheck and run interaction and security checks with mocks. Review actual claims and citations before enabling public access.

The installed skill and doctor are available only in source revisions that include them; v1.1.0 predates these additions. Figma is not needed for installation. Atlas and the test examples are fictional; replace their names, pages and content with your own.

## What still requires owner action

An installation command copies code and installs dependencies; it does not infer source permissions, finish application integration, acquire credentials, create a database, apply SQL, test your model, or publish your site. The owner approves sources, supplies provider credentials and a dedicated Supabase project, reviews the migration, sets spend limits, and reviews citations and deployment security.

The CI cold-start fixture begins with no Portfolio AI routes, components or manifest. Its owner approval and integration edits are simulated explicitly in test code: the test installs the item, confirms the host layout, Next configuration and existing `AGENTS.md` are untouched, then adapts the manifest, routes, panel, tracing and build command before exercising mock chat. This validates those reproducible steps, not autonomous behavior by a live coding agent. Real integrations can require additional manual conflict resolution, source approval, service setup and security review.

## Troubleshooting

- **Registry install reports existing files:** review the conflicting paths. With shadcn 4.23.0, `--yes` does not automatically approve overwrites: when stdin is unavailable the CLI can exit with status 0 at the overwrite prompt after changing dependencies and before writing all files. Inspect the CLI output and run the doctor if present; a missing doctor means installation is incomplete. Do not treat the exit status alone as success. Preserve the host files and resolve conflicts explicitly with the owner.
- **Doctor reports unresolved dependencies:** check that your package manager installed the kit dependencies. The check uses Node's standard resolver; package managers with custom loaders can require a manual check. It does not prove version compatibility.
- **Doctor says corpus is missing or stale:** approve the source list, build through the publisher, and keep `.next/BUILD_ID` and the generated corpus together. A matching ID does not guarantee the passages are accurate or public.
- **Build rejects a source:** verify anonymous same-origin access, page language, visible content and anchors. Dynamic MDX must be ingested as rendered content; JSON and file content also require human comparison against the published page.
- **Chat returns 401/403:** verify local loopback access or the configured deployment protection and origin. Origin checks are not authentication.
- **Chat returns 429/503:** inspect quotas, prices, credentials and the Supabase migration. The doctor does not contact the database or verify atomic reservations.
- **Chat returns 502 or a citation is misleading:** check build tracing and corpus version, provider structured-output compatibility, and the actual source passages. A valid link does not prove the claim.

See [integration](integration.md), [security](security.md), and [evaluation](evaluation.md) for the complete details.
