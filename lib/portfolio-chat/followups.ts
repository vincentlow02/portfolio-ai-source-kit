import { portfolioLanguageTerms, replaceOwnerMentions } from "./engine-config";
import { defaultPortfolioChatConfig } from "./engine-config";
import { resolveProjects } from "./retrieval";
import type { B2Intent, ChatMessage } from "./core";
import type { PortfolioCorpus } from "../portfolio-knowledge";
import { clearlyWrongLanguage, type ResponseLanguage } from "./language";

// These patterns reject invitations addressed to the visitor, rather than
// attempting to rewrite questions or identify every possible form of speech.
const assistantInvitation = /(?:\b(?:would|do|did|are|were|will|can)\s+you\s+(?:like|want|interested|prefer|care|curious)\b|\bare\s+you\s+interested\b|\b(?:shall|should|may|can)\s+i\s+(?:explain|show|tell|describe|share|help|elaborate|provide)\b|(?:你|您)(?:是否|会不会|有没有|有沒有|想不想|愿不愿意|願不願意|想要|想|要|愿意|願意|有兴趣|有興趣)[^？?]{0,60}(?:了解|知道|看看|看|听|聽|探索|学习|學習|介绍|介紹|我|吗|嗎|么|麼)|(?:需要|要不要|想不想)(?:我|再|进一步|進一步)|(?:ご興味|興味)(?:が|は)?(?:あります|ございます|ある)|(?:知りたい|見たい|聞きたい|ご覧になりたい|知りたく|見たく)(?:ですか|でしょうか|ありませんか|思いますか)|(?:説明|紹介|お見せ|お伝え)(?:しましょうか|しますか|いたしましょうか))/iu;

const personalFollowUpTopic = /(?:\b(?:portfolioowner|he|his|designer|design(?:er)?|industrial design|background|education|study|approach|perspective|judgment|work with engineers|product design|projects?)\b|工业设计|設計|设计|設計|背景|教育|学习|學習|项目|作品|设计理念|設計理念|エンジニア|デザイン|プロダクト|学歴|考え方|アプローチ|作品)/iu;
const unrelatedProjectDetail = /(?:\b(?:research findings|research methods|interviews?|participants|figma workflow|timeline|team structure|implementation history|beta users?|metrics)\b|研究结果|研究方法|参与者|參與者|访谈|インタビュー|参加者|チーム構成|実装履歴|実装経緯|メトリクス|指標)/iu;

export function validateFollowUpQuestions(questions: string[], messages: ChatMessage[], previous: string[], corpus: PortfolioCorpus, favorFeatured = false, language?: ResponseLanguage, intent?: B2Intent, config = defaultPortfolioChatConfig): string[] {
  const normalize = (q: string) => q.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const seen = new Set([...messages.filter(m => m.role === "user").map(m => m.content), ...previous].map(normalize));
  const languageTerms = portfolioLanguageTerms(config);
  const valid = questions.flatMap(item => {
    const q = item.trim(), key = normalize(q);
    if (!key || seen.has(key) || assistantInvitation.test(q) || (language && clearlyWrongLanguage(q, language, languageTerms)) || /(?:https?:\/\/|www\.|[<>])/iu.test(q) || !/[?？]$/u.test(q) ||
        (intent === "PERSONAL_OVERVIEW" && (!personalFollowUpTopic.test(replaceOwnerMentions(q, config)) || unrelatedProjectDetail.test(q)))) return [];
    const projects = resolveProjects([{ role: "user", content: q }], corpus, config);
    if (projects.some(id => !corpus.caseStudies.some(project => project.projectId === id))) return [];
    seen.add(key); return [q];
  });
  const featured = config.preferredFollowUpProject;
  if (favorFeatured && featured) valid.sort((a, b) => Number(resolveProjects([{role:"user",content:b}], corpus, config).includes(featured)) - Number(resolveProjects([{role:"user",content:a}], corpus, config).includes(featured)));
  return valid.slice(0, 3);
}

/** Reuse public discovery questions if the model has no eligible suggestions. */
export function fallbackFollowUpQuestions(corpus: PortfolioCorpus, messages: ChatMessage[], projects: string[], language: ResponseLanguage, config = defaultPortfolioChatConfig): string[] {
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const current = normalize(messages.at(-1)?.content ?? "");
  const project = projects.length === 1 ? corpus.caseStudies.find(item => item.projectId === projects[0] && item.language === language) : undefined;
  const name = project?.title.trim();
  const safeName = name && name.length <= 80 && !/(?:https?:\/\/|www\.|[<>])/iu.test(name) ? name : undefined;
  const hasPage = (pathname: string | undefined) => corpus.pages.some(page => page.language === language && new URL(page.url, "http://localhost").pathname === pathname);
  const projectQuestion = safeName ? { en: `What is ${safeName}?`, zh: `${safeName} 是什么项目？`, ja: `${safeName}はどんなプロジェクトですか？` }[language] : undefined;
  const catalogQuestion = hasPage(config.projectDirectoryPath) ? { en: "What projects has {owner} worked on?", zh: "{owner} 做过哪些项目？", ja: "{owner}はどのようなプロジェクトに取り組みましたか？" }[language].replace("{owner}", () => config.ownerName) : undefined;
  const profileQuestion = hasPage(config.profilePath) ? { en: "How does {owner} approach product design?", zh: "{owner} 如何进行产品设计？", ja: "{owner}はプロダクトデザインにどう取り組んでいますか？" }[language].replace("{owner}", () => config.ownerName) : undefined;
  // Previously shown suggestions may be reused when the model supplies no new
  // ones; do not repeat the question that the visitor just asked.
  return [projectQuestion, catalogQuestion, profileQuestion].filter((question): question is string => Boolean(question && normalize(question) !== current)).slice(0, 2);
}
