import { z } from "zod";
import { safeAnswerHref } from "./link-url";

const maxLinks = 120;
export const publicLinksSchema = z.array(z.strictObject({
  label: z.string().trim().min(1).max(200),
  href: z.string().refine(href => safeAnswerHref(href) === href),
})).max(maxLinks);

export type PublicLink = z.output<typeof publicLinksSchema>[number];
export type LinkSurface = { anchors: PublicLink[]; text: string };

const emailLabels = { en: "Email", zh: "邮箱", ja: "メール" };
type Locale = keyof typeof emailLabels;

export function readPublishedLinks(surfaces: readonly LinkSurface[], origin: string, language: Locale): PublicLink[] {
  const links = new Map<string, PublicLink>();
  const add = (label: string, destination: string) => {
    let href = safeAnswerHref(destination);
    if (!href) return;
    const url = new URL(href, origin);
    if (url.origin === origin) href = safeAnswerHref(url.pathname + url.search + url.hash);
    if (!href || links.size >= maxLinks || links.has(href)) return;
    const fallback = url.protocol === "mailto:" ? emailLabels[language]
      : url.origin === origin ? url.pathname.split("/").filter(Boolean).at(-1) ?? "/"
      : url.hostname.replace(/^www\./u, "");
    links.set(href, { label: (label.trim() || fallback).replace(/\s+/gu, " ").slice(0, 200).trimEnd(), href });
  };
  for (const { anchors, text } of surfaces) {
    for (const { label, href } of anchors) add(label, href);
    // Plain text addresses and URLs are also publishable destinations.
    for (const value of text.match(/https?:\/\/[^\s<>"'()]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu) ?? []) {
      if (/^https?:\/\//iu.test(value)) add("", value.replace(/[.,;!?]+$/u, ""));
      else add("", "mailto:" + value.replaceAll("%", "%25"));
    }
  }
  return [...links.values()];
}

// Older knowledge snapshots and explicit manifests may still declare these fields.
export const publicContactsSchema = z.strictObject({
  email: z.email().max(254).optional(),
  linkedIn: z.string().regex(/^https:\/\/www\.linkedin\.com\/in\/[a-z0-9][a-z0-9-]{0,119}\/$/iu).optional(),
});
export type PublicContacts = z.output<typeof publicContactsSchema>;

export function legacyContactLinks(contacts: PublicContacts | undefined, language: Locale): PublicLink[] {
  const links: PublicLink[] = [];
  if (contacts?.email) {
    const href = safeAnswerHref("mailto:" + contacts.email.replaceAll("%", "%25"));
    if (href) links.push({ label: emailLabels[language], href });
  }
  if (contacts?.linkedIn) links.push({ label: "LinkedIn", href: contacts.linkedIn });
  return links;
}

export function hasLegacyContact(link: PublicLink, published: readonly PublicLink[]): boolean {
  if (link.href.startsWith("mailto:")) return published.some(item => item.href === link.href);
  const profile = new URL(link.href);
  return published.some(({ href }) => {
    if (!href.startsWith("https://")) return false;
    const url = new URL(href);
    return /^(?:(?:www|[a-z]{2})\.)?linkedin\.com$/iu.test(url.host) &&
      url.pathname.replace(/\/$/u, "") === profile.pathname.replace(/\/$/u, "");
  });
}
