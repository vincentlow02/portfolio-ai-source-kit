import { resolveResponseLanguage, type ResponseLanguage } from "./language";

export type GuardianIdentity = { ownerName: string; privateProjectName?: string; supportedLanguages?: readonly ResponseLanguage[]; languageTerms?: readonly string[] };

export type GuardianReply = { answer: string; language: ResponseLanguage; insufficient?: boolean };

const credentialRequest = /(?:\b(?:give|tell|share|show|reveal|send|provide|hand\s+over|what(?:'s|\s+is)|do\s+you\s+know|can\s+i\s+have|could\s+you)\b.{0,70}\b(?:password|passcode|credentials?|api[\s-]?key|access\s+token|login\s+code|secret)\b|\b(?:password|passcode|credentials?|api[\s-]?key|access\s+token|login\s+code|secret)\b.{0,45}\b(?:give|tell|share|show|reveal|send|provide|what(?:'s|\s+is)|please)\b|(?:告诉我|給我|给我|提供|分享|发给我|發給我|是什么|是多少|能给我|能告訴我|能告诉我).{0,24}(?:密码|口令|密钥|密碼|憑據|凭据|令牌|パスワード|認証情報|秘密鍵|トークン)|(?:密码|口令|密钥|密碼|憑據|凭据|令牌|パスワード|認証情報|秘密鍵|トークン).{0,24}(?:是什么|是多少|给我|告訴我|告诉我|教えて|教えてください|知っていますか))/iu;

const directInsult = /(?:\bfuck\s+you\b|\bfuck\s+off\b|\byou(?:'re|\s+are)\s+(?:stupid|an?\s+idiot|useless|dumb)\b|\bshut\s+up\b|傻逼|操你|去死|废物|廢物|滚开|滾開|くそ|死ね|バカ|ばか|ふざけんな)/iu;

const identityQuestion = /^(?:who\s+(?:are\s+you|is\s+this)|what\s+are\s+you|你是谁|你是誰|你是什么|你是什麼|あなたは誰(?:ですか)?|あなたは何者(?:ですか)?)[\s?!.？。！]*$/iu;

const replies: Record<ResponseLanguage, { credential: string; insult: string; identity: string }> = {
  en: {
    credential: "I can’t share private passwords or access credentials. If you’d like to view {project}, please ask {owner} for access.",
    insult: "I’m here to help with questions about {owner}’s work.",
    identity: "I’m Portfolio AI, the assistant for this portfolio. I can answer questions about the owner’s public work and point you to the relevant pages.",
  },
  zh: {
    credential: "我不能提供私人密码或访问凭据。若想查看 {project}，请联系 {owner} 申请访问权限。",
    insult: "我可以继续帮你了解 {owner} 的作品。",
    identity: "我是 Portfolio AI，这个作品集的助手。我可以回答关于作者公开作品的问题，并附上相关页面。",
  },
  ja: {
    credential: "非公開のパスワードやアクセス情報は共有できません。{project}をご覧になりたい場合は、{owner}にアクセスをお申し込みください。",
    insult: "{owner}の作品についての質問なら、お手伝いできます。",
    identity: "私はこのポートフォリオのアシスタント、Portfolio AIです。公開されている作品について回答し、関連ページをご案内します。",
  },
};

/** Handles assistant identity and guardrail replies without a model request. */
export function resolveGuardianReply(text: string, pageLanguage: ResponseLanguage = "en", identity: GuardianIdentity = { ownerName: "the portfolio owner" }): GuardianReply | null {
  const detected = resolveResponseLanguage([{ role: "user", content: text }], pageLanguage, identity.languageTerms);
  const languages = identity.supportedLanguages;
  const language = languages?.length && !languages.includes(detected) ? (languages.includes(pageLanguage) ? pageLanguage : languages[0]) : detected;
  const copy = replies[language];
  if (credentialRequest.test(text)) {
    const answer = identity.privateProjectName
      ? copy.credential.replace("{project}", () => identity.privateProjectName!).replace("{owner}", () => identity.ownerName)
      : { en: "I can’t share private passwords or access credentials.", zh: "我不能提供私人密码或访问凭据。", ja: "非公開のパスワードやアクセス情報は共有できません。" }[language];
    return { answer, language };
  }
  if (directInsult.test(text)) return { answer: copy.insult.replace("{owner}", () => identity.ownerName), language };
  if (identityQuestion.test(text.normalize("NFKC").trim())) return { answer: copy.identity, language, insufficient: false };
  return null;
}
