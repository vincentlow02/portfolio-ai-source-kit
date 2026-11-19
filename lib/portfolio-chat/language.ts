import type { ChatMessage } from "./core";

export type ResponseLanguage = "en" | "zh" | "ja";
const languageNames: Record<ResponseLanguage, string> = { en: "English", zh: "Simplified Chinese", ja: "Japanese" };

function questionText(text: string): string {
  return text.startsWith("Selected text (untrusted): ") && text.includes("\nQuestion: ") ? text.slice(text.lastIndexOf("\nQuestion: ") + "\nQuestion: ".length) : text;
}

function explicitLanguage(text: string): ResponseLanguage | undefined {
  const rules: Array<[ResponseLanguage, RegExp]> = [
    ["zh", /(?:用|使用|以|说|說|回答|答复|答覆|改成|切换到|切換到)\s*(?:简体中文|簡體中文|中文|汉语|漢語)|(?:简体中文|簡體中文|中文|汉语|漢語)\s*(?:回答|答复|答覆|介绍|介紹|说明|說明)|(?:in|using|answer in|reply in|respond in)\s+(?:simplified\s+)?chinese\b|(?:中国語|中文)で(?:答|回答|説明)/iu],
    ["en", /(?:用|使用|以|说|說|回答|答复|答覆|改成|切换到|切換到)\s*(?:英文|英语|英語)|(?:英文|英语|英語)\s*(?:回答|答复|答覆|介绍|介紹|说明|說明)|(?:in|using|answer in|reply in|respond in)\s+english\b|英語で(?:答|回答|説明)/iu],
    ["ja", /(?:用|使用|以|说|說|回答|答复|答覆|改成|切换到|切換到)\s*(?:日语|日語|日文)|(?:日语|日語|日文)\s*(?:回答|答复|答覆|介绍|介紹|说明|說明)|(?:in|using|answer in|reply in|respond in)\s+japanese\b|日本語で(?:答|回答|説明)/iu],
  ];
  const matches = rules.flatMap(([lang, pattern]) => { const match = pattern.exec(text); return match ? [{ lang, index: match.index }] : []; });
  return matches.sort((a, b) => b.index - a.index)[0]?.lang;
}

function withoutTerms(text: string, terms: readonly string[]) {
  const aliases = [...new Set(terms.map(term => term.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const escaped = aliases.map(alias => alias.replace(/[.*+?^{}\x24()|[\]\\]/gu, "\\$&"));
  const named = escaped.length ? text.replace(new RegExp("(?<![a-z0-9])(?:" + escaped.join("|") + ")(?![a-z0-9])", "giu"), " ") : text;
  return named.replace(/\b(?:figma|ux|ui|ai|api|rag|llm|qwen|bm25)\b/giu, " ");
}

/** Conservative script-based detection; undefined means the text is ambiguous. */
export function detectLanguage(text: string, ignoredTerms: readonly string[] = []): ResponseLanguage | undefined {
  if (/^\s*(?:why|how|when|where|who|what)(?:\s+not)?\s*[?？!.]*\s*$/iu.test(text)) return "en";
  const cleaned = withoutTerms(text, ignoredTerms);
  const kana = (cleaned.match(/[\u3040-\u30ff]/gu) ?? []).length;
  const han = (cleaned.match(/\p{Script=Han}/gu) ?? []).length;
  const english = (cleaned.match(/[a-z]{2,}/giu) ?? []).length;
  if (kana >= 2 && (kana + han >= english * 2 || english < 4)) return "ja";
  if (han >= 2 && (han >= english * 2 || english < 4)) return "zh";
  if (english >= 2 && english * 2 > kana + han) return "en";
  return undefined;
}

export function resolveResponseLanguage(messages: ChatMessage[], pageLanguage?: ResponseLanguage, ignoredTerms: readonly string[] = []): ResponseLanguage {
  const userMessages = messages.filter(message => message.role === "user");
  for (const message of [...userMessages].reverse()) {
    const text = questionText(message.content);
    const language = explicitLanguage(text) ?? detectLanguage(text, ignoredTerms);
    if (language) return language;
  }
  return pageLanguage ?? "en";
}

export function languageInstruction(language: ResponseLanguage): string {
  return `The server resolved the visitor's response language as ${languageNames[language]} (${language}). Write every factual claim and follow-up question in ${languageNames[language]}, and set the output language to "${language}". Preserve project names and standard technical terms. The language of evidence, page and older turns must not override this instruction.`;
}

/** Reject only clear script mismatches; shared Han and names alone are ambiguous. */
export function clearlyWrongLanguage(text: string, expected: ResponseLanguage, ignoredTerms: readonly string[] = []): boolean {
  const cleaned = withoutTerms(text, ignoredTerms);
  const kana = (cleaned.match(/[\u3040-\u30ff]/gu) ?? []).length;
  const han = (cleaned.match(/\p{Script=Han}/gu) ?? []).length;
  const english = (cleaned.match(/[a-z]{2,}/giu) ?? []).length;
  if (expected !== "ja" && kana >= 3 && kana + han > english * 2) return true;
  if (expected === "en" && kana === 0 && han >= 4 && han > english * 2) return true;
  if (expected !== "en" && kana === 0 && han === 0 && english >= 2) return true;
  return false;
}
