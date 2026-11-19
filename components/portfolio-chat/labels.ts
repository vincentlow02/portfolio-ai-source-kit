import type { PortfolioChatLabels } from "./portfolio-chat-panel";

type Locale = "en" | "zh" | "ja";
const labels: Record<Locale, PortfolioChatLabels & { recommendations: string; explore: string }> = {
  en: {
    heading: "Ask me anything.",
    ask: "Ask {owner} AI", askQuote: "Ask about this quote...", askProject: "Ask about {project}...", placeholder: "Ask about {owner}...",
    cancel: "Cancel", open: "Open {owner} AI", close: "Close {owner} AI", reset: "Reset conversation", send: "Send message", removeQuote: "Remove selected quote", thinking: "Thinking...",
    yourQuestion: "Your question", response: "{owner} AI response", sources: "Sources", recommendations: "Recommendations", followups: "Suggested follow-up questions", explore: "Explore", projects: "Projects", other: "Other projects",
    errors: {}, unavailable: "The assistant is temporarily unavailable.",
  },
  zh: {
    heading: "随时问我。",
    ask: "询问 {owner} AI", askQuote: "询问这段引用...", askProject: "询问关于 {project} 的问题...", placeholder: "询问关于 {owner} 的问题...",
    cancel: "取消", open: "打开 {owner} AI", close: "关闭 {owner} AI", reset: "重置对话", send: "发送消息", removeQuote: "移除选中的引用", thinking: "思考中...",
    yourQuestion: "你的问题", response: "{owner} AI 的回答", sources: "来源", recommendations: "推荐", followups: "建议的后续问题", explore: "探索", projects: "项目", other: "其他项目",
    errors: {
      "This selection could not be verified. Please select a shorter passage on the current page.": "无法验证所选内容，请在当前页面选择较短的文字。",
      "Too many requests. Please try again later.": "请求过多，请稍后再试。",
      "The assistant returned an invalid response.": "助手返回的内容无效，请重试。",
    }, unavailable: "助手暂时无法使用，请稍后再试。",
  },
  ja: {
    heading: "何でも聞いてください。",
    ask: "{owner} AIに質問", askQuote: "この引用について質問...", askProject: "{project}について質問...", placeholder: "{owner}について質問...",
    cancel: "中止", open: "{owner} AIを開く", close: "{owner} AIを閉じる", reset: "会話をリセット", send: "メッセージを送信", removeQuote: "選択した引用を削除", thinking: "考えています...",
    yourQuestion: "あなたの質問", response: "{owner} AIの回答", sources: "出典", recommendations: "おすすめ", followups: "続けて聞く質問", explore: "見る", projects: "プロジェクト", other: "その他のプロジェクト",
    errors: {
      "This selection could not be verified. Please select a shorter passage on the current page.": "選択した内容を確認できませんでした。現在のページで短い文章を選択してください。",
      "Too many requests. Please try again later.": "リクエストが多すぎます。しばらくしてからお試しください。",
      "The assistant returned an invalid response.": "アシスタントの応答が無効でした。もう一度お試しください。",
    }, unavailable: "現在アシスタントを利用できません。後でもう一度お試しください。",
  },
};

export function defaultLabels(locale: Locale, owner: string): PortfolioChatLabels {
  const translate = (text: string) => text.replaceAll("{owner}", () => owner);
  return { ...labels[locale], ...Object.fromEntries(Object.entries(labels[locale]).flatMap(([key, value]) => typeof value === "string" ? [[key, translate(value)]] : [])) };
}

export function defaultQuestions(locale: Locale, owner: string): string[] {
  return { en: ["What projects has {owner} worked on?", "How does {owner} approach design?"], zh: ["{owner} 做过哪些项目？", "{owner} 如何进行设计？"], ja: ["{owner}はどのようなプロジェクトに取り組みましたか？", "{owner}はデザインにどう取り組んでいますか？"] }[locale].map(question => question.replace("{owner}", () => owner));
}
