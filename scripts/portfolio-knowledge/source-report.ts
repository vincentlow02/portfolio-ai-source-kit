import type { PortfolioCorpus } from "../../lib/portfolio-knowledge";
import type { discoverPortfolioSources } from "./discover-sources.mts";

function label(text: string) {
  return text.replace(/[\s\p{Cc}\p{Cf}]+/gu, " ").trim();
}

function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

export function printDiscoveryReport(origin: string, report: Awaited<ReturnType<typeof discoverPortfolioSources>>) {
  console.log(`Sources found on ${origin}`);
  console.log(`Eligible for review (${report.candidates.length})`);
  for (const [index, page] of report.candidates.entries()) {
    console.log(`  ${index + 1}. ${page.path} — ${label(page.title)} [${page.language}], ${count(page.sections, "section")}`);
  }
  if (report.skipped.length) {
    console.log(`Skipped (${report.skipped.length})`);
    for (const page of report.skipped) console.log(`  ${label(page.path)} — ${label(page.reason)}`);
  }
  if (report.limitReached) console.log("Discovery reached its scan or reporting limit. Add other public paths manually if needed.");
}

export function printIndexedSources(corpus: PortfolioCorpus, origin: string) {
  const passages = new Map<string, number>();
  for (const chunk of corpus.chunks) {
    const [page] = chunk.sourceUrl.split("#", 1);
    passages.set(page, (passages.get(page) ?? 0) + 1);
  }
  console.log("Indexed pages");
  for (const page of corpus.pages) {
    const url = new URL(page.url, origin).href;
    console.log(`  ${url} — ${label(page.title)} [${page.language}], ${count(passages.get(page.url) ?? 0, "passage")}, ${count(page.publicLinks?.length ?? 0, "link")}`);
  }
  if (corpus.report.exclusions.length) {
    console.log("Excluded by the knowledge manifest");
    for (const { pathname } of corpus.report.exclusions) console.log(`  ${pathname} — protected path`);
  }
}
