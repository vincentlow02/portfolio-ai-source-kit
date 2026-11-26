import { legacyContactLinks } from "../knowledge/published-links";
import type { PortfolioCorpus } from "../portfolio-knowledge";
import type { CanonicalAnswer } from "./answer-engine";
import { defaultPortfolioChatConfig, isInternalSource, replaceOwnerMentions, sourcePath, type PortfolioChatConfig } from "./engine-config";
import type { ResponseLanguage } from "./language";

const questionWords = new Set((
  "a an are can could do does find for get give have her here his how i is it know link links may me of on open page please " +
  "portfolioowner profile account address see send share show tell the their to url visit want what where which would you your"
).split(" "));
const ownerReference = /\b(?:his|her|their|your|portfolioowner)\b|(?:他|她|你|站长|站長|作者)的|(?:作者|彼|彼女)の/iu;
const linkReference = /\b(?:links?|url|where|open|visit)\b|链接|連結|网址|網址|リンク/iu;
const words = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\be-mail\b/gu, "email")
  .match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[\p{Script=Latin}\p{N}]+|[\p{L}\p{N}]+/gu) ?? [];
const emailWords = words("email 邮箱 郵箱 电邮 電郵 电子邮件 電子郵件 メール メールアドレス");

function linkSubject(question: string) {
  const subject = question.replace(/[?!.？。！]+$/u, "")
    .replace(/['’]s\b/giu, "")
    .replace(/^(?:请问|請問|可以(?:给我|給我|告诉我|告訴我)|(?:告诉|告訴|发给|給)我)\s*/u, "")
    .replace(/^(?:(?:他|她|你|站长|站長|作者|portfolioowner)的|(?:作者|本人|彼|彼女|portfolioowner)の)\s*/iu, "")
    .replace(/\s*(?:的?(?:链接|連結|网址|網址|地址|账号|帳號)|の(?:リンク|プロフィール))?\s*(?:是什么|是什麼|在哪[里裡]?|吗|嗎|を教えて(?:ください)?|は何ですか)?\s*$/u, "");
  return [...new Set(words(subject).filter(word => !questionWords.has(word)))];
}

export function resolvePublishedLinkReply(corpus: PortfolioCorpus, question: string, language: ResponseLanguage, options: {
  config?: PortfolioChatConfig;
  page?: { path: string; projectId: string | null } | null;
} = {}): CanonicalAnswer | null {
  const { config = defaultPortfolioChatConfig, page } = options;
  const query = replaceOwnerMentions(question.normalize("NFKC"), config).trim();
  const subject = linkSubject(query);
  if (!subject.length || subject.length > 8) return null;

  const owner = ownerReference.test(query);
  const preferredPath = !owner && page?.projectId ? page.path : config.profilePath ?? config.homePath ?? "/";
  const wantsLink = linkReference.test(query);
  const matches = corpus.pages.flatMap(source => {
    if (!isInternalSource(source.url) || owner && source.kind !== "page") return [];
    const links = source.publicLinks ?? legacyContactLinks(source.publicContacts, source.language);
    return links.flatMap(link => {
      const email = link.href.startsWith("mailto:");
      const url = new URL(link.href, "https://portfolio.invalid");
      const internal = link.href.startsWith("/");
      // A navigation label alone can also be a question about the destination's content.
      if (internal && !wantsLink && !/\.[a-z0-9]+$/iu.test(url.pathname)) return [];
      const labels = words(link.label).filter(word => !questionWords.has(word));
      const addressWords = email ? emailWords : internal ? [] : words(url.hostname.replace(/^www\./u, ""));
      const keywords = new Set([...labels, ...addressWords]);
      if (!subject.every(word => keywords.has(word))) return [];
      return [{ source, link, email, preferred: Number(sourcePath(source.url) === preferredPath),
        localized: Number(source.language === language), exact: Number(labels.join(" ") === subject.join(" ")) }];
    });
  });
  matches.sort((a, b) => b.preferred - a.preferred || b.localized - a.localized || b.exact - a.exact);
  const match = matches[0];
  if (!match || matches.some(item => item.link.href !== match.link.href && item.preferred === match.preferred &&
      item.localized === match.localized && item.exact === match.exact)) return null;

  const { link, email, source } = match;
  const text = email ? decodeURIComponent(link.href.slice("mailto:".length)) : link.label;
  const answer = `[${text.replace(/[\\\[\]<>]/gu, "\\$&")}](<${link.href}>)`;
  return { language, answer, insufficient: false, claims: [], recommendations: [], followUpQuestions: [],
    sources: [{ id: "link:" + source.url, title: source.title, section: source.title, url: source.url, projectId: source.projectId }],
  };
}
