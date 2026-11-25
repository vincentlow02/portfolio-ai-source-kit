import { readFile } from "node:fs/promises";
import { join } from "node:path";

const base = "scripts/portfolio-chat/local-preview";
const font = "node_modules/next/dist/next-devtools/server/font/geist-latin.woff2";
const styles = "components/portfolio-chat/portfolio-chat-panel.module.css";
const icons = ["sparkles", "reset", "close", "suggestion", "send", "followup", "quote", "remove", "select"];

export const widgetAssets = new Map<string, { file: string; type: string }>([
  ["/", { file: `${base}/preview.html`, type: "text/html; charset=utf-8" }],
  ["/preview.js", { file: `${base}/preview.js`, type: "text/javascript; charset=utf-8" }],
  ["/preview.css", { file: `${base}/preview.css`, type: "text/css; charset=utf-8" }],
  ["/embed.js", { file: `${base}/embed.js`, type: "text/javascript; charset=utf-8" }],
  ["/embed.css", { file: `${base}/embed.css`, type: "text/css; charset=utf-8" }],
  ["/widget/geist.woff2", { file: font, type: "font/woff2" }],
  ["/widget/geist-OFL.txt", { file: `${base}/geist-OFL.txt`, type: "text/plain; charset=utf-8" }],
  ...icons.map(icon => [`/widget/${icon}.svg`, { file: `${base}/icons/${icon}.svg`, type: "image/svg+xml" }] as const),
]);

export function widgetFramePolicy(origin: string) {
  return `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors ${origin}`;
}

export async function readWidgetAsset(root: string, path: string, config: { origin: string; paths: string[] }) {
  const asset = widgetAssets.get(path);
  if (!asset) return undefined;
  const body = await readFile(join(root, asset.file));
  if (path === "/") return body.toString("utf8").replace("{{portfolio-origin}}", config.origin);
  if (path === "/embed.js") return body.toString("utf8").replace("/* widget-config */ null", () => JSON.stringify({ origin: config.origin, paths: config.paths }));
  if (path === "/preview.css") return await readFile(join(root, styles), "utf8") + "\n" + body.toString("utf8");
  return body;
}
