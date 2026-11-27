# Customize the Portfolio AI chat UI

Share this folder with your coding assistant and paste the prompt below. Specify which integration you use, describe the changes you want, and include a screenshot or design reference if you have one. For build and browser checks, give the assistant access to your local checkout. Use public or fictional example content in the handoff and keep secrets, generated corpora, and visitor records in your deployment.

## Where to edit

| Integration | What to change | Files to include as context |
| --- | --- | --- |
| **Hosted widget** loaded with `embed.js` | `widget/embed.css` styles the launcher, highlight button, and iframe placement. `widget/preview.css` styles the chat inside the iframe. Edit `widget/preview.html` for markup and static copy. Launcher text is in `widget/embed.js`, dynamic chat copy is in `widget/preview.js`, and icons are in `widget/icons/`. | Include the whole `widget/` folder and `portfolio-chat-panel.module.css`. Include `lib/portfolio-chat/widget-assets.ts` from the Kit checkout if the assistant needs to see how these assets are served. |
| **Next.js panel** rendered as `<PortfolioChatPanel>` | Start with `portfolio-chat-panel.module.css` for styling, `portfolio-chat-panel.tsx` for JSX, and `labels.ts` for localized copy. Use the props in your layout or wrapper for the assistant name, suggested questions, and configured languages. | Include `chat-adapter.ts`, `use-portfolio-selection.ts`, and the snippet of your layout or wrapper that renders the panel. |

The Hosted widget loads `portfolio-chat-panel.module.css` before `widget/preview.css`. Use `preview.css` for changes that should apply only to Hosted. If the shared stylesheet changes, check both integrations.

## Prompt for a coding assistant

```text
Customize the Portfolio AI chat UI in my project.

Integration: [Hosted widget or Next.js panel]
Visual changes: [What I want to change, with a reference if available]

Use the matching files in components/portfolio-chat/. Start with CSS and edit markup or labels where the design needs it. Keep the current request and response formats, approved source settings, model settings, quotas, and question logging behavior. Use local excerpts or mocks for verification.

Preserve these features in the selected integration:

- Show the launcher, open and close the chat, and keep the composer and actions usable on desktop and a narrow phone screen with the keyboard open. Preserve keyboard navigation, visible focus, accessible names, and the existing focus and scroll behavior.
- Keep typed questions and suggested questions working, with loading feedback and one request at a time. Enter sends, Shift+Enter adds a line, and IME composition must finish before sending. Reset clears the conversation and ignores stale responses. Keep cancel and retry behavior where the panel provides it.
- Keep highlight-to-ask on approved pages, the selected-quote preview and removal, and the current page context after navigation. Continue to exclude protected or unapproved content from selection and page context.
- Keep links in answers, expandable source citations, and follow-up questions accessible and usable. Preserve existing link validation, localized labels and their placeholders, and all loading, empty, error, and rate-limit states that the integration displays.

For Hosted, preserve the Shadow DOM, iframe messaging and origin checks, existing DOM IDs, and template markers `/* widget-config */ null`, `{{portfolio-origin}}`, and `{{question-log-notice}}`. Keep `/api/preview` and its single-question request format. When a follow-up is clicked, send the passage ID paired with that button. Keep the excerpt fallback and conditional question logging notices, and show the rate-limit message for a plain-text 429.

For Next.js, keep `<PortfolioChatPanel>` compatible with its existing props and host content. Preserve the host-configured endpoints, conversation history, selection hooks, safe Markdown rendering, and mobile dialog behavior.

Check the existing UI before editing and repeat the same flows afterward. Run the relevant checks listed in UI_CUSTOMIZATION.md. Report the changed files, the checks you ran and their results, and anything you could not verify. Use synthetic questions and mock responses for error states.
```

## Verify your changes

1. Open the chat from the portfolio on desktop and on a narrow phone screen. Check focus, keyboard navigation, scrolling, the composer with the soft keyboard open, and closing and reopening.
2. Send a typed question and a suggested question. Open a source link and send a follow-up. Select text on an approved page, ask about it, and try removing the quote. Check that a protected or unapproved page cannot attach its text.
3. Exercise an empty submission, a pending request followed by reset, and a rate-limit response. In Next.js, also test canceling and resending. For Hosted, use a mock to verify the excerpt fallback and both visibility states of the logging notice.

**Hosted or Vite preview from a full Kit checkout.** Follow `docs/integration.md` to start the local excerpt preview. After `npm ci`, `npm run test:offline` prepares the embedding files and runs the browser regression tests. Run `node --import tsx scripts/test-hosted-integration.mts` after that to check the Hosted build with mock services.

**Next.js panel.** In an installed portfolio, follow `.portfolio-ai/SETUP.md` to build, type-check, and open the local excerpt UI. Run the browser checks above in your configured languages. From a full Kit checkout, `npm run test:integration` exercises the Next.js example using mocks.
