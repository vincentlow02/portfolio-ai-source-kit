# Evaluation and troubleshooting

Run `npm ci`, `npm run test:offline` and `npm run test:integration` from the source kit. The integration test copies the fictional Atlas host and the source kit into a separate temporary directory, performs its own lockfile installation and build, and exercises the production API and browser interactions using fake Qwen and Supabase services. It checks authorization, protected content exclusion, verified selection, comparisons, citations, follow-ups, cancellation and recovery. These tests make no paid model calls.

To audit a release archive, use Python 3.11 or newer and a Git checkout containing the released commit:

```sh
python3 scripts/audit-release-zip.py /path/to/source.zip --commit <commit-or-tag> --sha256 <published-sha256>
```

The audit reads the ZIP without extracting it. It checks the digest, every file and byte against the selected Git tree, paths, duplicates, symbolic links, disallowed media and local files, candidate secrets and portfolio references, required notices, and local links in the README and integration guide. CI also tests malformed archives and performs a fresh installation from the inspected ZIP. `--allow-legacy-crlf` exists solely to audit the historical V1.0.0 asset, whose files differ from its Git blobs only by CRLF line endings; do not use it for new releases.

## Prepare a stable release

Use a reviewed commit with passing checks from `Verify source kit`. Test the exact commit in a clean Hosted deployment with excerpts, and install the registry item into a fresh Next.js portfolio. Check the embed, citations, and a related-section follow-up. In the release notes, include a copyable shadcn command with the tested tag or full commit SHA in place of `PUBLISHED_REF`, a link to the Hosted setup at the same version, and the [upgrade guide](integration.md#upgrade-a-customized-installation).

Build an optional ZIP from the release commit with `git -c core.autocrlf=false archive --format=zip --output=source.zip HEAD`. Audit it against the same commit and publish its SHA-256 checksum with the archive.

## Evaluate and troubleshoot answers

Before a real-model test, obtain explicit authorization for the call count and spend, confirm your provider's actual regional pricing and billing controls, use a dedicated staging database, and disable automatic retries. Record outcomes, token usage, latency, source URLs and a manual assessment of each claim against its cited public passage. A successful response or valid citation URL does not prove factual grounding. Test unsupported facts, private paths, prompt injection, personal-role attribution and multilingual questions relevant to your own content. Do not log private text or credentials.

| Symptom | Check |
| --- | --- |
| Build rejects content | Verify the declared source is visible anonymously, indexed, has the declared language and a unique anchor; dynamic MDX should use the rendered adapter. |
| Chat returns 401 or 403 | Check local loopback mode, evaluation bearer authorization, public origin settings and upstream Preview protection. |
| Chat returns 429 or 503 | Check process throttles, shared quota configuration and ledger, Supabase connectivity, and the provider configuration. |
| Hosted returns an excerpt unexpectedly | With `PORTFOLIO_AI_TIMING=1`, check `answerMode` and `fallbackReason` in the `portfolio_ai_timing` event. Check the edge firewall separately for requests it blocked before reaching the assistant. |
| Next.js chat returns 502 | Rebuild the app and corpus together and check output tracing and the build ID. For generated replies, verify that the provider supports the configured structured-output mode. |
| Local preview shows that the assistant is temporarily unavailable | Check the terminal running `preview:chat`. If you started it with `--model`, the terminal prints a brief description of provider errors. After changing `.env.local`, restart the service. |
| Local model preview displays an excerpt notice | The preview retrieved published evidence and used it when the model reply failed validation. Check the configured model and its structured-output settings. |
| Response has a valid citation but unsupported details | Inspect the cited passage and improve content, retrieval or validation; do not infer factual support from URL validity. |

For troubleshooting, do not paste secrets or private corpus data into issue reports. See [security](security.md) and [architecture](architecture.md).
