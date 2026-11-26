import type { Link, LinkReference, Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { safeAnswerHref } from "../knowledge/link-url";

const parser = unified().use(remarkParse).use(remarkGfm);

function label(node: Nodes): string {
  if ("value" in node) return node.value;
  if ("alt" in node) return node.alt ?? "";
  return "children" in node ? node.children.map(label).join("") : "";
}

/** Preserve the widget's plain-text layout and turn Markdown links into clickable text. */
export function answerLinkParts(answer: string, origin: string) {
  const links: (Link | LinkReference)[] = [];
  const definitions = new Map<string, string>();
  function collect(node: Nodes) {
    if (node.type === "link" || node.type === "linkReference") links.push(node);
    else if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    else if ("children" in node) node.children.forEach(collect);
  }
  collect(parser.parse(answer));

  const parts: Array<string | { text: string; href: string }> = [];
  let offset = 0;
  for (const link of links) {
    const href = safeAnswerHref(link.type === "link" ? link.url : definitions.get(link.identifier) ?? "");
    const start = link.position?.start.offset;
    const end = link.position?.end.offset;
    if (!href || start === undefined || end === undefined || start < offset) continue;
    if (start > offset) parts.push(answer.slice(offset, start));
    parts.push({ text: label(link) || href, href: new URL(href, origin).href });
    offset = end;
  }
  if (!parts.length) return undefined;
  if (offset < answer.length) parts.push(answer.slice(offset));
  return parts;
}
