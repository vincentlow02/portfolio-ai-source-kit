---
name: portfolio-ai-install
description: Integrate or verify the Portfolio AI source kit in an existing Next.js App Router portfolio. Use when a user asks to add, configure, or troubleshoot this specific assistant in their portfolio; do not use for unrelated chatbots.
---

# Integrate Portfolio AI

Read `.portfolio-ai/SETUP.md` and `.portfolio-ai/security.md` in the host. If the kit is not installed, review the source registry item and destination conflicts before installing the version the owner selected. Do not overwrite existing host files or agent instructions. This workflow does not require Figma.

Inspect the host framework, application root, package manager, build and layout. Identify compatibility and integration conflicts, and report unsupported arrangements instead of guessing. Inspect only material the owner permits. Propose specific public same-origin sources and protected paths; wait for the owner's approval before adding them to the manifest or publishing a corpus. Never place private material in the corpus.

Adapt the installed templates and existing UI to the host without replacing its design: configure the manifest and server settings, add the chat and click routes, integrate the panel, and merge tracing/build settings. Preserve the host's existing configuration and behavior. Guide the owner to provide their own server-only credentials and dedicated quota service; never print or commit credentials, apply migrations or enable public access without appropriate authorization.

Run `node scripts/portfolio-chat/doctor.mjs` for static readiness. The doctor makes no network calls and cannot prove credentials, database behavior, privacy, model correctness, or deployment protection. After source approval, build and typecheck; verify citations, interactions, protected paths, authentication and fail-closed quota with mock services. Do not make paid calls unless separately authorized. Report the changes, checks, manual steps, limitations and blockers.
