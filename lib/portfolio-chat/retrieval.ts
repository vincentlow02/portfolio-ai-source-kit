import { create, insert, search } from "@orama/orama";
import { createTokenizer as chinese } from "@orama/tokenizers/mandarin";
import { createTokenizer as japanese } from "@orama/tokenizers/japanese";
import type { PortfolioCorpus, PortfolioChunk } from "../portfolio-knowledge";
import type { ChatMessage } from "./core";
import { defaultPortfolioChatConfig } from "./engine-config";
import { embeddingProvider, embedPassageVectors, publishedPassageVectors, type EmbeddingProvider } from "./embeddings";

import type { PortfolioChatConfig } from "./engine-config";
export const comparisonQuestion = /compare|different|difference|相比|比较|对比|對比|区别|差异|差異|不同|比較|比べ|違い/iu;
// Shared vocabulary for explicitly counted people; this deliberately omits
// arbitrary nouns so counts of devices or dates are not treated as people.
export const countedPeopleNouns = String.raw`(?:people|persons?|participants?|visitors?|users?|passengers?|volunteers?|gardeners?|nurses?|teachers?|researchers?|curators?|archivists?|commuters?|staff|employees?|residents?|patients?|librarians?|rangers?|artists?|students?|designers?|developers?|workers?)`;
// These compounds count artefacts or groups, not necessarily individual people.
export const nonHumanCountSuffix = String.raw`(?![\s-]+(?:accounts?|profiles?|personas?|devices?|groups?|teams?|hours?|minutes?|sessions?|interviews?|responses?|records?|roles?|positions?|badges?|studies|tests?|surveys?|journeys?|stories|levels?)\b)`;
export const comparisonTopicClarification = {
  en:"What would you like to compare about the projects?",
  zh:"你想比较这些项目的哪方面？",
  ja:"これらのプロジェクトの何を比較しますか？",
} as const;
export const validationFollowUp = /^(?:how did (?:the team|they|he|she) (?:validate|test) (?:that|it)|(?:团队|他们)(?:是)?如何(?:验证|测试)(?:的)?|どうやって(?:検証|テスト)しましたか)[?？。]?$/iu;
const reference = /(?:\bit\b|\bthat project\b|\bthe project\b|\bthat decision\b|\bthe other\b|\bhis (?:role|responsibilities|contributions?|research|work|design|findings|methods?)\b|\bwhat did he do\b|这个项目|该项目|它|那个项目|那个决定|他的职责|他的贡献|他的研究|他的工作|他的设计|他的发现|他的研究方法|そのプロジェクト|それ|このプロジェクト|その設計|その決定|彼の役割|彼の担当|彼の研究|その研究|その調査)/iu;

// Search may include labels to find their section; citation eligibility is
// decided separately by the B2 evidence pack.
function searchable(chunk: PortfolioChunk): boolean {
  const text = chunk.content.trim();
  return Boolean(text && !/^(?:next|previous|back|menu|close|read more|view project|下一页|上一页|返回|次へ|前へ)$/iu.test(text));
}

export function isSubstantivePassage(chunk: PortfolioChunk): boolean {
  const lines = chunk.content.trim().split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length < 2 || chunk.content.trim() === chunk.sectionTitle.trim()) return false;
  return lines.slice(1).some(line => searchable({ ...chunk, content: line }) &&
    !/^(?:this(?: section| page)? is (?:a )?placeholder\b|(?:coming soon|details forthcoming)\b|(?:内容待补|内容待更新|準備中)[。.!！]?\s*$)/iu.test(line) &&
    !/^(?:\d+\s*\/|solution\s*\d+\s*\/|[\p{P}\p{S}\s]+$)/iu.test(line));
}

// Some specific factual requests need evidence for the requested kind of
// fact, not merely the same topic. This deliberately small multilingual gate
// is conservative and is not a general semantic-entailment classifier.
export function sourceMatchesSpecificIntent(query: string, source: string): boolean {
  const normalized = query.normalize("NFKC");
  const body = source.normalize("NFKC");
  return specificFactChecks.every(([intent, evidence]) => !intent.test(normalized) || evidence.test(body));
}

const specificFactChecks: Array<[RegExp, RegExp]> = [
    [/(?:\bhow much\b.{0,90}\b(?:costs?|charg(?:e[ds]?|ing)|pay|paid|budget|price|salary|spend|spent|subscription)\b|\bwhat (?:is|was) (?:the |its )?(?:total )?(?:price|cost|budget|salary)\b|(?:预算|預算|月费|月費|工资|薪水).{0,18}(?:多少|几)|多少钱|多少錢|多少(?:美元|加元)|いくら)/iu,
      /(?:[$€£¥]\s*\d|\d[\d,.]*\s*(?:usd|cad|dollars?|euros?|yen|円|元|美元|加元)(?![a-z0-9])|(?:is|was) free\b|at no cost\b|免费使用|免費使用|無料で)/iu],
    [/(?:\b(?:what|which)\b.{0,55}\b(?:database|cloud provider|hosting provider)\b|(?:数据库|資料庫|云服务商|雲服務商).{0,15}(?:哪|什么|什麼)|どの.{0,15}(?:データベース|クラウド))/iu,
      /(?:\b(?:built (?:on|with)|hosted (?:on|by)|deployed (?:on|to)|stored in|(?:uses?|used|runs? on)\b.{0,55}(?:database|postgres|mysql|sqlite|mongodb|redis|cloud|aws|azure|firebase|supabase))\b|(?:采用|採用|部署在|存储于|儲存在).{0,45}(?:数据库|資料庫|云|雲)|(?:データベース|クラウド).{0,30}(?:使用|採用))/iu],
    [/(?:\b(?:price|pricing|cost|costs|purchase|buy|buying|expensive)\b|価格|値段|費用|料金|いくら|購入|购买|購買|价格|價格|费用|費用|多少钱|多少錢)/iu,
      /(?:\b(?:price|pricing|cost|costs|purchase|buy|sold|free|budget|dollars?|euros?|yen|usd|sgd)\b|[$€£¥]\s*\d|\d[\d,.]*\s*(?:円|元)|[一二三四五六七八九十百千万]+(?:円|元)|価格|値段|費用|料金|無料|購入|购买|購買|价格|價格|费用|費用|免费|免費|美元)/iu],
    [/(?:\b(?:salary|salaries|wages?|payroll|compensation|payday)\b|給料|給与|賃金|工资|工資|薪水|薪资|薪資)/iu,
      /(?:\b(?:salary|salaries|wages?|payroll|compensation|paid|payday|earn(?:ed|s)?)\b|給料|給与|賃金|工资|工資|薪水|薪资|薪資)/iu],
    [/(?:\b(?:manufacturer|manufacturers|who manufactures|which company (?:makes|manufactures|sells))\b|製造.{0,15}会社|会社.{0,15}製造|哪.{0,8}(?:公司|企业).{0,8}(?:生产|製造|制造))/iu,
      /(?:\b(?:manufacturer|manufactured|manufactures|produced by|made by|sold by|supplier|vendor)\b|製造元|製造会社|製造した|メーカー|生产商|生產商|制造商|製造商|生产厂家)/iu],
    [/(?:\bhow many\b|(?:何|几|幾|多少)(?:人|名|个|個|枚|台|件|回|次|站|駅|所|月|日|位))/iu,
      /(?:(?<!\d)(?!(?:19|20)\d{2}(?!\d))\d+(?!\d)|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|several|dozens?)\b|[零〇一二两兩三四五六七八九十百千万]+(?:人|名|个|個|枚|台|件|回|次|站|駅|所|月|日|位)|数(?:人|名|个|個|枚|回)|複数)/iu],
    [/(?:いつから|何年|哪一年|哪年|\bwhen\s+(?:did|was|were)\b[^?]{0,100}\b(?:launch|launched|release|released|start|started|open|opened|complete|completed)\b)/iu,
      /(?:\b(?:19|20)\d{2}\b|[零〇一二三四五六七八九十百千\d]{2,}年|\b(?:launched|released|opened|started|since|before|after|during|first)\b|開始|开始|開業|开业|公開|公开|发布|發布)/iu],
    [/(?:いつから[^?？。]{0,35}(?:使わ|使い|使用|利用)|(?:何时|何時|什么时候|什麼時候)[^?？。]{0,20}(?:开始|開始)?(?:使用|利用)|\b(?:when|since when)\b[^?]{0,100}\b(?:start(?:ed)? using|began using|put into use|in use|used)\b)/iu,
      /(?:\b(?:used|using|in use|put into use|operated|in operation|deployed|adopted)\b|使わ|使い|使用|利用|運用|运用)/iu],
];

function projectLabels(id: string, corpus: PortfolioCorpus, config: PortfolioChatConfig) {
  return [...new Set([...(config.projectAliases?.[id] ?? []), id, id.replaceAll("-", " "),
    ...corpus.pages.filter(page => page.projectId === id && (page.kind === "case-study" || page.kind === "project-detail")).map(page => page.title)]
    .map(label => label.normalize("NFKC").trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
}

function names(text: string, corpus: PortfolioCorpus, config: PortfolioChatConfig): string[] {
  const lower = text.normalize("NFKC").toLocaleLowerCase();
  const known = new Set(corpus.chunks.map((chunk) => chunk.projectId).filter((id): id is string => Boolean(id)));
  return [...known].filter((id) => {
    const terms = projectLabels(id, corpus, config);
    return terms.some((term) => {
    term = term.toLocaleLowerCase();
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return /[a-z]/u.test(term)
      ? new RegExp("(?<![a-z0-9])" + escaped + "(?![a-z0-9])", "iu").test(lower)
      : lower.includes(term);
    });
  });
}

function isContextualFollowUp(query: string) {
  return reference.test(query) || pluralProjectReference(query) || validationFollowUp.test(query.trim()) || /\b(?:how (?:did|was|were) (?:the team|they|he|she|that)|why (?:did|was|were) (?:they|he|she|that)|(?:validate|test|design|choose) that|what about|tell me more)\b|为什么(?:这么做|这样做)|それはなぜ|(?:团队|他们).{0,10}(?:如何验证|如何测试)|どうやって(?:検証|テスト)/iu.test(query);
}

// Only an explicit plural reference may carry all subjects of an earlier
// comparison. Singular "it" remains ambiguous after multiple projects.
function pluralProjectReference(query: string) {
  return /\b(?:both projects?|both of (?:the )?projects?|both of them|(?:the|these|those) two projects?|their (?:research|stud(?:y|ies)|tests?|testing|designs?|roles?|participants?|projects?))\b|(?:两个|兩個|两项|兩項)(?:项目|項目|專案)|(?:两者|兩者)(?:的|分别|分別)|(?:両方|両者|それぞれ)の(?:プロジェクト|作品)/iu.test(query);
}

const countNumber = String.raw`(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;
// Require the human noun phrase to end before a modifier/action; e.g. six
// user accounts must not be interpreted as six users.
const countedPeople = countNumber + String.raw`\s+(?:[a-z-]+\s+){0,2}` + countedPeopleNouns + String.raw`\b` + nonHumanCountSuffix + String.raw`(?:\s+members?)?(?=\s*(?:[.,;:!?)\]—-]|$)|\s+(?:in|at|on|during|who|that|from|participated|tested|tried|evaluated|used|took|were|was|are|is|and|or|to|for|of)\b)`;
const testedWithCountedPeople = new RegExp(String.raw`\b(?:test(?:ed|ing)?|validat(?:ed|ing)?|evaluat(?:ed|ing)?|trial(?:led|ed)?)\b[^.!?;]{0,140}\b(?:with|among)\s+(?:(?:a\s+group\s+of|approximately|about|around)\s+)?` + countedPeople,"iu");
const countedPeopleTesting = new RegExp(String.raw`\b` + countedPeople + String.raw`\s+(?:tested|tried|evaluated|participated)\b`,"iu");
function hasCountedTestParticipants(sentence:string):boolean {
  return testedWithCountedPeople.test(sentence) || countedPeopleTesting.test(sentence) ||
    /(?:[零〇一二三四五六七八九十百千万\d]+)(?:人|名)(?:で|が|を対象に).{0,40}(?:検証|テスト|試験|测试|測試|验证|驗證)|(?:検証|テスト|試験|测试|測試|验证|驗證).{0,40}(?:[零〇一二三四五六七八九十百千万\d]+)(?:人|名)(?:で|が参加|参加)/iu.test(sentence);
}

// A carried multi-project comparison must keep every explicit topic word in
// each source body. Unknown terms are matched literally; a small multilingual
// map covers common testing vocabulary. This is conservative, not entailment.
export function comparisonTopicMatcher(query: string): { hasTopic: boolean; tooManyTerms: boolean; matches: (source: string) => boolean } {
  const stop = new Set(["what","how","were","was","are","is","did","do","does","both","the","these","those","projects","project","of","them","they","their","about","and","or","in","on","with","each","respectively","compare","different","difference","比较","比較","对比","對比","区别","區別","差异","差異","比べ","違い","这","這","那","呢","个","個","项","項","项目","項目","專案","两者","兩者","分别","分別","的","如何","怎么","怎麼","什么","什麼","両方","両者","それぞれ","プロジェクト","作品","の","は","が","を","に","て","どう","どの","よう","し","しま","まし","した","です","ます","か"]);
  const testWords = new Set(["test","tests","tested","testing","validate","validated","validation","验证","驗證","测试","測試","検証","テスト"]);
  const locationWords = new Set(["where","哪里","哪裡","何处","何處","地点","地點","どこ","場所"]);
  const timeWords = new Set(["when","何时","何時","何年","什么时候","什麼時候","いつ"]);
  const personWords = new Set(["who","谁","誰"]);
  const reasonWords = new Set(["why","为什么","為什麼","为何","為何","なぜ"]);
  const methodWords = new Set(["方法","方式","手法","手段"]);
  const personCountWords = new Set(["何人","几人","幾人","多少人"]);
  const rawQuery=query.normalize("NFKC").toLocaleLowerCase();
  const asksGenericTestingMethod=/(?:どのような|どんな)方法で[^?？]{0,80}(?:検証|テスト)/u.test(rawQuery);
  const queryText=rawQuery
    .replace(/\b(?:the|these|those) two projects?\b/gu,"both projects")
    .replace(/(?:这|這)?(?:两个|兩個|两项|兩項)(?:项目|項目|專案)/gu,"项目")
    .replace(/(?:どのような|どんな)方法で(?=[^?？]{0,80}(?:検証|テスト))/gu,"どう")
    .replace(/(何人|几人|幾人|多少人)で(?=検証|テスト)/gu,"$1")
    .replace(/(検証|テスト)に参加した人は(?=何人)/gu,"$1 ")
    // Normalise only affirmative Japanese passive endings. Negation remains
    // in the topic terms and must never be silently removed.
    .replace(/(検証|テスト)(?:されていました|されました|されています|されます|された)/gu,"$1");
  const asksTestingPurpose=/\bwhat\b[^?]{0,100}\btest(?:ed|ing)?\s+for\b/iu.test(queryText);
  const asksNegativeTest=/(?:\b(?:not|never|no|without|didn['’]t|doesn['’]t|wasn['’]t|weren['’]t)\b|(?:未|没有|沒有|不曾|从未|從未).{0,8}(?:测试|測試|验证|驗證)|(?:検証|テスト).{0,15}(?:なかった|ない|ません|未実施)|未(?:検証|テスト))/iu.test(queryText);
  const asksAffirmativeTesting=!asksNegativeTest && /(?:\btest(?:s|ed|ing)?\b|検証|テスト|测试|測試)/iu.test(queryText);
  const language=/[\u3040-\u30ff]/u.test(queryText)?"ja":/[\u3400-\u9fff]/u.test(queryText)?"zh":"en";
  const terms=[...new Set([...new Intl.Segmenter(language,{granularity:"word"}).segment(queryText)]
    .filter(part=>part.isWordLike).map(part=>part.segment).filter(term=>!stop.has(term)))];
  const matches=(source:string)=>{
    // Do not discard extra attributes merely to satisfy a resource limit.
    if (terms.length > 32) return false;
    const sourceBody=source.normalize("NFKC").toLocaleLowerCase().split("\n").slice(1).join("\n");
    // Avoid combining anchors across clearly distinct clauses. This still
    // does not establish a semantic relationship within one clause.
    const sentences=sourceBody.split(/(?<=[。！？])|(?<=[.!?])\s+|\n+|[;；]|\b(?:and|or|but|however|whereas|although|while)\b|但是|然而|一方|ただし/iu).filter(Boolean);
    return sentences.some(sentence=>(!asksTestingPurpose || /\btest(?:ed|ing)?\s+for\b/iu.test(sentence)) &&
    (!asksGenericTestingMethod || /\b(?:test(?:ed|ing)?|validat(?:ed|ing)?|evaluat(?:ed|ing)?)\b[^.!?;]{0,140}\b(?:with|using|via|through|by)\s+(?!no\b)\S+|\b(?:test(?:ed|ing)?|validat(?:ed|ing)?|evaluat(?:ed|ing)?)\b[^.!?;]{0,100}\bduring\s+(?:(?:an?|the)\s+)?(?:interview(?:\s+session)?|workshop|usability\s+(?:study|session|test))\b|(?:テスト|検証|试验|試驗|测试|測試).{0,40}(?:用いて|使用|使って|参加者)|(?:用いて|使用して|使って|参加者).{0,40}(?:テスト|検証|试验|試驗|测试|測試)/iu.test(sentence)) &&
    (!asksAffirmativeTesting || !/\b(?:(?:plans?|planned|hopes?|hoped|intends?|intended|proposes?|proposed|expects?|expected)\s+to|will|would|may|might|could)\s+(?:test|validate|evaluate)\b/iu.test(sentence)) &&
    (!asksAffirmativeTesting || !/(?:\b(?:(?:did|does|do|was|were|is|are|has|have|had)\s+not|not|never|didn['’]t|doesn['’]t|hasn['’]t|haven['’]t|wasn['’]t|weren['’]t)\s+(?:(?:be|been)\s+)?(?:test(?:ed|ing)?|validat(?:e|ed|ing)|evaluat(?:e|ed|ing))\b|\b(?:no|without)\s+(?:user\s+)?(?:testing|validation|tests?)\b|(?:未|没有|沒有|不曾|从未|從未).{0,8}(?:测试|測試|验证|驗證)|(?:検証|テスト).{0,12}(?:しなかった|されなかった|されていない|されません|未実施)|未(?:検証|テスト))/iu.test(sentence)) && terms.every(term=>{
    if(testWords.has(term)) return /\b(?:test(?:s|ed|ing)?|validat(?:e|ed|ion|ing)|evaluat(?:e|ed|ion|ing))\b|验证|驗證|测试|測試|検証|テスト/iu.test(sentence);
    if(locationWords.has(term)) return /\b(?:location|venue|located|site)\b|地点|地點|場所|位于|位於/iu.test(sentence);
    if(timeWords.has(term)) return /\b(?:19|20)\d{2}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{2,4}年/iu.test(sentence);
    if(personWords.has(term)) return /\b(?:people|person|users?|participants?|volunteers?|researchers?|team|staff|they|we|i)\b|参与者|參與者|志愿者|志願者|参加者|チーム|担当者/iu.test(sentence);
    if(reasonWords.has(term)) return /\b(?:because|since|therefore|so that|in order to)\b|因为|因為|所以|ため|理由/iu.test(sentence);
    if(methodWords.has(term)) return /\b(?:methods?|methodology|techniques?|procedures?|approaches?)\b|方法|方式|手法|手段/iu.test(sentence);
    if(personCountWords.has(term)) return hasCountedTestParticipants(sentence);
    if (/^\d+$/u.test(term)) return new RegExp("(?<!\\d)"+term+"(?!\\d)","u").test(sentence);
    if (/^[a-z]+$/u.test(term)) {
      const stem=term.length>4 ? term.replace(/(?:ing|ed|es|s)$/u,"") : term;
      return new RegExp("(?<![a-z])"+stem+"(?:s|es|ed|ing)?(?![a-z])","iu").test(sentence);
    }
    return sentence.includes(term);
    }));
  };
  return {hasTopic:terms.length>0,tooManyTerms:terms.length>32,matches};
}

// A bare reference cannot identify a project on its own. Keep this narrow so
// ordinary global questions and questions with a named subject still search.
export function unresolvedProjectReference(query: string) {
  return /^(?:(?:what|where|when|why|how|who)\s+(?:was|is|did|does|can|will|were)\s+(?:it|that|this)(?:\s+[\p{L}\p{N}'-]+){0,8}|(?:它|该项目|这个项目|这个(?=是|有|怎么|如何|为什么|什么)|这(?=是|有|怎么|如何|为什么|什么))(?:是|有|被|在)?[^?？。!！]{0,30}(?:什么|什么样|怎么|如何|为什么|何时|哪里|哪儿|谁)[^?？。!！]{0,15}|(?:它|该项目|这个项目|这(?=是|怎么|如何|为什么))(?:是)?(?:怎么|如何|为什么).{0,30}|(?:それ|そのプロジェクト|このプロジェクト)(?:は|を|が)?(?:どう|どのように|なぜ|何|どこ|いつ|誰).{0,30}|どうやって(?:検証|テスト)しましたか)[?？。!！\s]*$/iu.test(query.trim());
}

export function resolveContext(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig) {
  const query = messages.at(-1)?.content ?? "";
  const explicit = names(query, corpus, config);
  const precedingAssistant = messages.at(-2), precedingUser = messages.at(-3);
  const topicClarificationReply = precedingAssistant?.role === "assistant" &&
    Object.values(comparisonTopicClarification).some(text => text === precedingAssistant.content.trim()) &&
    precedingUser?.role === "user" && pluralProjectReference(precedingUser.content);
  const contextual = isContextualFollowUp(query) || topicClarificationReply;
  const priorQuestions = contextual ? messages.slice(0, -1).reverse().filter(message => message.role === "user") : [];
  const priorQuestion = priorQuestions.find(message => names(message.content, corpus, config).length > 0);
  const prior = priorQuestion ? names(priorQuestion.content, corpus, config) : [];
  const comparesPrior = explicit.length === 1 && prior.length === 1 && prior[0] !== explicit[0] &&
    comparisonQuestion.test(query) && reference.test(query);
  const selectsOneProject = /\b(?:which (?:one|of)|which project|either project)\b|(?:哪一个|哪一個|哪个|哪個|哪项|哪項)|(?:どちら|どのプロジェクト)/iu.test(query);
  const carryComparison = !explicit.length && prior.length > 1 && Boolean(priorQuestion && comparisonQuestion.test(priorQuestion.content)) &&
    (pluralProjectReference(query) || topicClarificationReply) && !reference.test(query.replace(/それぞれ/gu, "")) && !selectsOneProject;
  const projects = comparesPrior ? [prior[0], explicit[0]] : explicit.length ? explicit : prior.length === 1 || carryComparison ? prior : [];
  const ambiguous = !explicit.length && (contextual && prior.length > 1 && !carryComparison || prior.length === 0 && unresolvedProjectReference(query));
  const previous = priorQuestions[0]?.content;
  // Carry a small topic hint only for elliptical questions. A fresh named
  // project or a specific follow-up can be retrieved from its own wording.
  const topic = previous && !explicit.length && !ambiguous &&
    (validationFollowUp.test(query.trim()) || /\b(?:why (?:was|were|did) (?:it|that|they)|tell me more|what about (?:it|that))\b|为什么(?:这么做|这样做)|それはなぜ/iu.test(query))
    ? searchTerms(previous, projects, corpus, config)
      .replace(/\b(?:problems?|solve|addresses?|did|use|uses)\b/giu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) : "";
  return { projects, explicit, ambiguous, topic, carryComparison, multiplePriorProjects: contextual && !explicit.length && prior.length > 1 && !carryComparison };
}

export function resolveProjects(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig): string[] {
  return resolveContext(messages, corpus, config).projects;
}

export type RetrievalResult = {
  candidates: PortfolioChunk[];
  qualifiedMatches: PortfolioChunk[];
  /** Only qualified matches have scoring priority. */
  scores: Map<string, number>;
  fallback: boolean;
};

export function removeProjectLabels(query: string, projects: readonly string[], corpus: PortfolioCorpus, config: PortfolioChatConfig): string {
  let terms = query.normalize("NFKC");
  for (const id of projects) {
    for (const label of projectLabels(id, corpus, config)) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      terms = terms.replace(new RegExp(/[a-z]/iu.test(label)
        ? "(?<![a-z0-9])" + escaped + "(?![a-z0-9])" : escaped, "giu"), " ");
    }
  }
  return terms.replace(/\s+/gu, " ").trim();
}

function searchTerms(query: string, projects: string[], corpus: PortfolioCorpus, config: PortfolioChatConfig): string {
  return removeProjectLabels(query, projects, corpus, config).replace(/\b(?:what|how|why|which|did|does|the|and|about|compare|tell|project|projects|is|it)\b/giu, " ")
    .replace(/(?:什么|如何|为什么|哪些|这个项目|那个项目|比较|介绍|教えて|について|ですか|何ですか|プロジェクト|違い|比較)/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

function createIndex(language: "en" | "zh" | "ja") {
  const schema = { chunkId: "string", text: "string", title: "string" } as const;
  return language === "en" ? create({ schema, language: "english" })
    : create({ schema, components: { tokenizer: language === "zh" ? chinese() : japanese() } });
}
type Index = ReturnType<typeof createIndex>;
let keywordCache: { key: string; indexes: Map<string, Index> } | undefined;

function keywordIndexes(chunks: PortfolioChunk[], key: string) {
  if (keywordCache?.key === key) return keywordCache.indexes;
  const indexes = new Map<string, Index>();
  for (const chunk of chunks) {
    const group = (chunk.projectId ?? "") + "|" + chunk.language;
    if (!indexes.has(group)) indexes.set(group, createIndex(chunk.language));
    insert(indexes.get(group)!, {
      chunkId: chunk.chunkId, text: chunk.content, title: chunk.sectionTitle,
    });
  }
  keywordCache = { key, indexes };
  return indexes;
}

async function scoreKeywords(indexes: Map<string, Index>, terms: string, projects: string[], limit: number) {
  const scores = new Map<string, number>();
  for (const [key, index] of indexes) {
    const projectId = key.split("|")[0];
    if (!terms || (projects.length && !projects.includes(projectId))) continue;
    const results = await search(index, {
      term: terms, mode: "fulltext", properties: ["text", "title"], boost: { title: 1.25 },
      limit, threshold: 1,
    });
    const best = results.hits[0]?.score ?? 0;
    for (const hit of results.hits) scores.set(hit.document.chunkId, best > 0 ? hit.score / best : 0);
  }
  return scores;
}

function exactMatch(candidates: PortfolioChunk[], terms: string, question: string, keywords: Map<string, number>, requireUnique = false) {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const phrase = normalize(terms);
  const literal = phrase.includes(" ") || (phrase.length >= 2 && phrase === normalize(question));
  if (!literal || !/\p{L}/u.test(phrase)) return;
  const matches = candidates.filter(chunk => ` ${normalize(chunk.content)} `.includes(` ${phrase} `));
  if (requireUnique && (phrase.length < 8 || matches.length !== 1)) return undefined;
  return matches.sort((a, b) => (keywords.get(b.chunkId) ?? 0) - (keywords.get(a.chunkId) ?? 0))[0];
}

const wordSplit = new Intl.Segmenter(undefined, { granularity: "word" });
function keywordEvidence(terms: string, passage: string) {
  const words = (text: string) => new Set(Array.from(wordSplit.segment(text.toLowerCase()), part => part.isWordLike ? part.segment : "").filter(Boolean));
  const queryWords = words(terms);
  const passageWords = words(passage);
  const matches = [...queryWords].filter(term => passageWords.has(term)).length;
  return matches >= 2 && matches >= Math.ceil(queryWords.size / 2);
}

/** Combine ranked lists after the evidence thresholds have been applied. */
function fuseRanks(chunks: PortfolioChunk[], dense: Map<string, number>, lexical: Map<string, number>) {
  const byDense = chunks.slice().sort((a, b) => dense.get(b.chunkId)! - dense.get(a.chunkId)!);
  const byKeyword = chunks.filter(c => lexical.has(c.chunkId))
    .sort((a, b) => lexical.get(b.chunkId)! - lexical.get(a.chunkId)!);
  const rank = new Map(byDense.map((c, index) => [c.chunkId, 1 / (61 + index)]));
  byKeyword.forEach((c, index) => rank.set(c.chunkId, rank.get(c.chunkId)! + 0.5 / (61 + index)));
  return byDense.sort((a, b) => rank.get(b.chunkId)! - rank.get(a.chunkId)!);
}

export type RetrievalPhase = "keyword" | "indexLoad" | "corpusEmbedding" | "queryEmbedding" | "semantic" | "rankFusion";
export type RetrievalTiming = (phase: RetrievalPhase, milliseconds: number) => void;

export function createEvidenceRetriever(provider: EmbeddingProvider | null) {
  let cache: { key: string; vectors: ReturnType<typeof embedPassageVectors> } | undefined;
  return async (corpus: PortfolioCorpus, messages: ChatMessage[], config = defaultPortfolioChatConfig, timing?: RetrievalTiming, scopedProjects?: readonly string[]): Promise<RetrievalResult> => {
    const context = resolveContext(messages, corpus, config);
    const projects = scopedProjects ? [...scopedProjects] : context.projects;
    const { topic } = context;
    const currentQuestion = messages.at(-1)?.content ?? "";
    const question = topic ? currentQuestion + " " + topic : currentQuestion;
    const terms = searchTerms(question, projects, corpus, config) || (!provider ? question.trim() : "");
    const pages = new Set(corpus.pages.map(page => page.url));
    const approved = corpus.chunks.filter(chunk => chunk.accessLevel === "public" &&
      chunk.buildVersion === corpus.contentHash && pages.has(chunk.sourceUrl.split("#")[0]) && searchable(chunk));
    const key = [corpus.contentHash, ...approved.map(chunk => chunk.chunkId)].join("|");
    const passages = approved.filter(isSubstantivePassage);
    const candidates = passages.filter(chunk => (!projects.length || projects.includes(chunk.projectId ?? "")) && sourceMatchesSpecificIntent(currentQuestion, chunk.content));
    const scores = new Map<string, number>();
    if (!question || !candidates.length) return { candidates, scores, qualifiedMatches: [], fallback: true };

    const keywordStarted = timing ? performance.now() : 0;
    const keywords = await scoreKeywords(keywordIndexes(approved, key), terms, projects, approved.length);
    timing?.("keyword", performance.now() - keywordStarted);
    if (!provider) {
      const exact = exactMatch(candidates, terms, question, keywords);
      const chunks = candidates.filter(chunk => chunk === exact ||
        (keywords.has(chunk.chunkId) && keywordEvidence(terms, chunk.content)));
      for (const chunk of chunks) scores.set(chunk.chunkId, chunk === exact ? 2 : keywords.get(chunk.chunkId)!);
      chunks.sort((a, b) => scores.get(b.chunkId)! - scores.get(a.chunkId)!);
      return { candidates, scores, qualifiedMatches: chunks, fallback: !chunks.length };
    }
    if (cache?.key !== key) {
      const started = performance.now();
      const published = publishedPassageVectors(corpus, passages, provider);
      if (published) timing?.("indexLoad", performance.now() - started);
      const vectors = published ? Promise.resolve(published) :
        embedPassageVectors(passages, texts => provider.embed(texts, "passage"))
          .finally(() => timing?.("corpusEmbedding", performance.now() - started))
          .catch(error => {
            if (cache?.vectors === vectors) cache = undefined;
            throw error;
          });
      cache = { key, vectors };
    }
    let vectors: Awaited<ReturnType<typeof embedPassageVectors>>;
    let query: number[];
    try {
      const pending = cache.vectors;
      vectors = await pending;
      const queryStarted = timing ? performance.now() : 0;
      [query] = await provider.embed([question], "query");
      timing?.("queryEmbedding", performance.now() - queryStarted);
      if (!query?.length || candidates.some(chunk => vectors.get(chunk.chunkId)?.length !== query.length)) {
        if (cache?.vectors === pending) cache = undefined;
        throw new Error("Invalid portfolio embedding dimensions");
      }
    } catch {
      // When the encoder is unavailable, only a unique verbatim phrase is safe.
      const literal = exactMatch(candidates, terms, currentQuestion, keywords, true);
      const chunks = literal ? [literal] : [];
      if (literal) scores.set(literal.chunkId, 2);
      return { candidates, scores, qualifiedMatches: chunks, fallback: true };
    }
    const semanticStarted = timing ? performance.now() : 0;
    const { cosine, assistedCosine, fused, keywordWeight = 0.20 } = provider.calibration;
    const dense = new Map<string, number>();
    for (const { chunkId } of candidates) {
      const vector = vectors.get(chunkId)!;
      const similarity = vector.reduce((sum, component, index) => sum + component * query[index], 0);
      const score = similarity + keywordWeight * (keywords.get(chunkId) ?? 0);
      // Full-text support can admit a match just below the semantic cutoff.
      if (similarity >= cosine || (similarity >= assistedCosine && score >= fused)) {
        scores.set(chunkId, score);
        dense.set(chunkId, similarity);
      }
    }
    timing?.("semantic", performance.now() - semanticStarted);
    const exact = exactMatch(candidates, terms, question, keywords);
    const fusionStarted = timing ? performance.now() : 0;
    const qualified = candidates.filter(chunk => scores.has(chunk.chunkId) && chunk !== exact);
    const chunks = fuseRanks(qualified, dense, keywords);
    if (exact) chunks.unshift(exact);
    if (exact) scores.set(exact.chunkId, 2);
    timing?.("rankFusion", performance.now() - fusionStarted);
    return { candidates, scores, qualifiedMatches: chunks, fallback: !chunks.length };
  };
}

const keywordRetriever = createEvidenceRetriever(null);
const providerRetrievers = new WeakMap<EmbeddingProvider, ReturnType<typeof createEvidenceRetriever>>();

export function retrieveEvidence(corpus: PortfolioCorpus, messages: ChatMessage[], config = defaultPortfolioChatConfig,
  timing?: RetrievalTiming, scopedProjects?: readonly string[]) {
  const provider = embeddingProvider(config.embedding);
  if (!provider) return keywordRetriever(corpus, messages, config, timing, scopedProjects);
  let retrieve = providerRetrievers.get(provider);
  if (!retrieve) {
    retrieve = createEvidenceRetriever(provider);
    providerRetrievers.set(provider, retrieve);
  }
  return retrieve(corpus, messages, config, timing, scopedProjects);
}
