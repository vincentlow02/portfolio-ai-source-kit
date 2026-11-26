const base = "https://portfolio.invalid";
const emailAddress = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/iu;

export function safeAnswerHref(value: string): string | undefined {
  if (!value || value.length > 2048 || /[\\\s\u0000-\u001f\u007f<>]/u.test(value)) return;
  const relative = /^\/(?!\/)/u.test(value);
  if (!relative && !/^(?:https?:\/\/|mailto:)/iu.test(value)) return;

  try {
    const url = new URL(value, base);
    if (url.protocol === "mailto:") {
      const address = decodeURIComponent(url.pathname);
      if (emailAddress.test(address)) return "mailto:" + address.replaceAll("%", "%25");
      return;
    }
    if (url.username || url.password) return;
    if (!relative) return url.href;
    if (url.origin === base && !url.pathname.startsWith("//")) return url.pathname + url.search + url.hash;
  } catch { /* Ignore malformed destinations. */ }
}

export function isExcludedLink(href: string, excludedPaths: readonly string[]): boolean {
  if (!href.startsWith("/")) return false;
  try {
    const pathname = decodeURIComponent(new URL(href, base).pathname).toLowerCase();
    if (/[\\%?#]/u.test(pathname) || pathname.startsWith("//") || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(pathname)) return true;
    if (/^\/(?:api|_next|private|\.portfolio-knowledge)(?:\/|$)/u.test(pathname)) return true;
    return excludedPaths.some(path => {
      const prefix = path.toLowerCase().replace(/\/$/u, "");
      return pathname === prefix || pathname.startsWith(prefix + "/");
    });
  } catch { return true; }
}
