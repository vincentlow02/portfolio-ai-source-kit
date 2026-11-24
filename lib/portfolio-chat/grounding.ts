import type { PortfolioCorpus } from "../portfolio-knowledge";
import type { ModelClaims } from "./answer-schema";
import type { buildB2Pack } from "./b2";
import { resolveRecommendations, validateAnswer } from "./core";
import { audienceEvidenceTerms, projectPath, replaceOwnerMentions, sourcePath as pathnameOf } from "./engine-config";
import { resolveProjects } from "./retrieval";

export const audienceStatement = /(?:\b(?:designed|built|intended)\s+for\b|\bfor\s+(?:students?|researchers?|designers?|users?|people|teams?)\b|対象(?:ユーザー|者|として|に)|(?:学生|研究者|利用者|ユーザー).{0,12}(?:のため|向け)|(?:面向|针对).{0,12}(?:用户|使用者|学生|研究者))/iu;
export const personalRoleLabel = /(?:^|\n)\s*(?:my role|我的职责|我的職責|担当)\s*(?:[:：]|\n)/iu;

const genericTerms = new Set("about also been being came could design does during from found have having helped interviews interview just made more most much project research same said show take team testing that their them then there these they this those through tool used uses using very were what when where which will with work would your".split(" "));

function evidenceWords(text: string) {
  return (text.toLowerCase().match(/[a-z]{4,}/gu) ?? []).map(word => word.replace(/ies$/u, "y").replace(/s$/u, ""));
}

// Digits must be present in cited prose. Normalize common written numbers so
// a model may write "6" when the source says "six". This is a necessary
// consistency check, not proof that a number has the same meaning or unit.
const numberWords: Record<string, string> = { zero:"0", one:"1", two:"2", three:"3", four:"4", five:"5", six:"6", seven:"7", eight:"8", nine:"9", ten:"10", eleven:"11", twelve:"12", thirteen:"13", fourteen:"14", fifteen:"15", sixteen:"16", seventeen:"17", eighteen:"18", nineteen:"19", twenty:"20" };
function normalizedNumbers(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gu, word => numberWords[word]);
}
function digits(text: string) {
  return normalizedNumbers(text).match(/(?<![a-z0-9])\d+(?:[.,]\d+)*(?![0-9])/gu) ?? [];
}
// Recognize limited Chinese/Japanese numerals only when followed by a count
// or date unit. Bare characters such as 一 in ordinary words are not counts.
const cjkDigits: Record<string, number> = { "零":0, "〇":0, "一":1, "二":2, "两":2, "兩":2, "三":3, "四":4, "五":5, "六":6, "七":7, "八":8, "九":9 };
const cjkUnits: Record<string, number> = { "十":10, "百":100, "千":1000 };
function countedCjkNumbers(text: string): string[] {
  const values: string[] = [];
  const pattern = /(?<![零〇一二两兩三四五六七八九十百千])([零〇一二两兩三四五六七八九十百千]{1,8})(?=(?:人(?!称|稱)|位|名(?!詞)|个|個|台|件|次|年|个月|個月|か月|ヶ月|月|日|周|週|小时|小時|時間|分|站|駅|所|円|元))/gu;
  for (const match of text.normalize("NFKC").matchAll(pattern)) {
    const token = match[1];
    if (![...token].some(char => char in cjkUnits)) {
      values.push([...token].map(char => cjkDigits[char]).join(""));
      continue;
    }
    let total = 0, current = 0, previousUnit = Infinity, valid = true;
    for (const char of token) {
      if (char in cjkDigits) { if (current) { valid = false; break; } current = cjkDigits[char]; }
      else {
        const unit = cjkUnits[char];
        if (unit >= previousUnit) { valid = false; break; }
        total += (current || 1) * unit; current = 0; previousUnit = unit;
      }
    }
    if (valid) values.push(String(total + current));
  }
  return values;
}
// Check a deliberately limited class of numeric associations: explicit
// counts of people. Other units and the relationship between a count and an
// event still require semantic review.
function peopleCounts(text: string): string[] {
  const values: string[] = [];
  const pattern = /(?<![a-z0-9零〇一二两兩三四五六七八九十百千])(\d+|[零〇一二两兩三四五六七八九十百千]{1,8})\s*(?:(?:[a-z-]+\s+){0,2}(?:people|participants?|visitors?|users?|passengers?|volunteers?|gardeners?|nurses?|teachers?|researchers?|curators?|archivists?|commuters?)\b|人(?!称|稱)|名(?!詞)|位(?=访客|訪客|来访者|來訪者|用户|用戶|来場者|参加者|利用者))/giu;
  for (const match of normalizedNumbers(text).matchAll(pattern)) {
    const value = /^\d+$/u.test(match[1]) ? match[1] : countedCjkNumbers(match[1] + "人")[0];
    if (value !== undefined) values.push(value);
  }
  return values;
}
function actionStem(word: string) {
  return word.toLowerCase().replace(/(?:ed|ing|s)$/u, "");
}

/** Conservative lexical check for English claims and explicitly named research subjects. */
export function hasEnglishEvidenceAnchor(text: string, sources: string[], ignored: string[] = []) {
  const generic = new Set([...genericTerms, ...evidenceWords([...genericTerms, ...ignored].join(" "))]);
  const terms = evidenceWords(text).filter(word => !generic.has(word));
  if (!terms.length) return true;
  const cited = new Set(sources.flatMap(evidenceWords));
  return terms.some(word => cited.has(word));
}

export function validateB2(output: ModelClaims, corpus: PortfolioCorpus, pack: Awaited<ReturnType<typeof buildB2Pack>>) {
  const { config } = pack;
  const approvedChunks = new Map(corpus.chunks.map(chunk => [chunk.chunkId, chunk]));
  const pages = new Set(corpus.pages.map(page => page.url));
  const evidence = new Map(pack.entries.map(entry => [entry.key, entry.chunk]));
  const valid = output.claims.filter(claim => claim.evidenceKeys.length && claim.evidenceKeys.every(key => {
    const chunk = evidence.get(key);
    const sourcePath = chunk && pathnameOf(chunk.sourceUrl);
    const inScope = chunk && (pack.intent !== "PERSONAL_OVERVIEW" ||
      sourcePath === config.profilePath || pack.allowProjectEvidence && chunk.projectId !== null &&
      (sourcePath === projectPath(corpus, config, chunk.projectId, chunk.language) || sourcePath === config.publicOverviewPath));
    const approved = chunk && approvedChunks.get(chunk.chunkId);
    return chunk && inScope && approved && approved.accessLevel === "public" && chunk.accessLevel === "public" &&
      approved.content === chunk.content && approved.sourceUrl === chunk.sourceUrl && approved.projectId === chunk.projectId &&
      chunk.buildVersion === corpus.contentHash && approved.buildVersion === corpus.contentHash && pages.has(chunk.sourceUrl.split("#")[0]) &&
      (!pack.projects.length || pack.projects.includes(chunk.projectId ?? "") ||
        pack.intent === "PERSONAL_OVERVIEW" && pack.allowProjectEvidence && chunk.projectId !== null);
  }) && !/(?:https?:\/\/|www\.|\]\s*\(|\/(?:api|projects|images|private)\/)/iu.test(claim.text)).filter(claim => {
    const citedChunks = claim.evidenceKeys.map(key => evidence.get(key)!);
    const cited = citedChunks.map(chunk => chunk.content);
    const sourceNumbers = new Set(cited.flatMap(text => [...digits(text), ...countedCjkNumbers(text)]));
    // "One" is often a discourse marker ("one approach"); other written
    // numbers and digits require matching cited evidence.
    const claimNumbers = [...digits(claim.text.replace(/\bone\b/giu, "")), ...countedCjkNumbers(claim.text)];
    if (claimNumbers.some(number => !sourceNumbers.has(number))) return false;
    const citedPeopleCounts = new Set(cited.flatMap(peopleCounts));
    if (citedPeopleCounts.size && peopleCounts(claim.text).some(count => !citedPeopleCounts.has(count))) return false;
    // Very short or generic project IDs can coincide with ordinary prose
    // (for example, project "a" and the article "a"). Do not infer an
    // attribution from those ambiguous names.
    const namedProjects = resolveProjects([{ role: "user", content: claim.text }], corpus, config)
      .filter(id => id.length >= 3 && !genericTerms.has(id.toLowerCase()));
    if (namedProjects.some(id => !citedChunks.some(chunk => chunk.projectId === id))) return false;
    const negation = /\b(?:not|never|cannot|can't|didn't|doesn't|wasn't|weren't|without)\b/iu;
    if (output.language === "en" && citedChunks.every(chunk => chunk.language === "en") && negation.test(claim.text)) {
      const negativeSentences = cited.flatMap(text => text.split(/[.!?\n]/u)).filter(sentence => negation.test(sentence));
      const labels = citedChunks.flatMap(chunk => [chunk.pageTitle, chunk.projectId ?? "", ...(chunk.projectId ? config.projectAliases?.[chunk.projectId] ?? [] : [])]);
      if (!negativeSentences.length || !hasEnglishEvidenceAnchor(claim.text, negativeSentences, [config.ownerName, ...(config.ownerAliases ?? []), ...labels])) return false;
    }
    if (output.language === "en" && citedChunks.every(chunk => chunk.language === "en") && !negation.test(claim.text)) {
      const claimActions = new Set((claim.text.match(/\b[a-z]{4,}\b/giu) ?? []).map(actionStem));
      const negatedActions = cited.flatMap(text => [...text.matchAll(/\b(?:not|never|didn't|doesn't|wasn't|weren't)\s+([a-z]{4,})\b/giu)]
        .map(match => actionStem(match[1])).filter(word => !genericTerms.has(word) && word !== "only"));
      if (negatedActions.some(action => claimActions.has(action))) return false;
    }
    if (output.language === "en" && citedChunks.every(chunk => chunk.language === "en")) {
      const projectLabels = citedChunks.flatMap(chunk => [chunk.pageTitle, chunk.projectId ?? "", ...(chunk.projectId ? config.projectAliases?.[chunk.projectId] ?? [] : [])]);
      if (!hasEnglishEvidenceAnchor(claim.text, cited, [config.ownerName, ...(config.ownerAliases ?? []), ...projectLabels])) return false;
    }
    const attribution = /(?:\b(?:portfolioowner|he|she|i)\b|他|她|我(?!们|們)|私(?:は|が|の)|彼女(?:は|が|の))/iu.test(replaceOwnerMentions(claim.text, config)) && /(?:\b(?:responsible|created|directed|led|designed|built|developed|imagined|envisioned|conceived|conceptualized|provided|contributed)\b|负责|負責|創作|创作|主导|主導|設計|担当|制作)/iu.test(claim.text);
    const translatedPersonalRole = citedChunks.some(chunk => chunk.language === "ja" && chunk.projectId && chunk.sectionId && personalRoleLabel.test(chunk.content) && corpus.chunks.some(other => other.language === "en" && other.projectId === chunk.projectId && other.sectionId === chunk.sectionId && pathnameOf(other.sourceUrl) === pathnameOf(chunk.sourceUrl) && corpus.pages.some(page => page.url === other.sourceUrl.split("#")[0]) && personalRoleLabel.test(other.content)));
    if (attribution && !translatedPersonalRole && !cited.some(text => /(?:\b(?:I|my)\s+(?:was responsible|led|created|designed|built|developed|imagined|envisioned|conceived|conceptualized|provided|contributed|work|role)\b|\bportfolioowner\s+(?:was responsible|led|created|designed|built|developed|imagined|envisioned|conceived|conceptualized|provided|contributed)\b|我的职责|我的職責|我负责|我負責|我设计|我設計|私の役割|私が担当)/iu.test(replaceOwnerMentions(text, config)))) return false;
    // A first-person concept statement alone does not establish other work.
    if (attribution && /\b(?:provided|contributed)\b/iu.test(claim.text) && !cited.some(text => /\b(?:I|portfolioowner)\s+(?:provided|contributed|was responsible)\b|\bmy role\b|我的职责|我的職責|我负责|我負責|私の役割|私が担当/iu.test(replaceOwnerMentions(text, config)))) return false;
    const studentBeta = /(?:beta|ベータ|测试|测试版)/iu.test(claim.text) && /(?:students?|学生)/iu.test(claim.text);
    if (studentBeta && !cited.some(text => text.split(/[。.!?\n]/u).some(sentence => /(?:beta|ベータ|测试|测试版)/iu.test(sentence) && /(?:students?|学生)/iu.test(sentence)))) return false;
    // An interactive exhibit or prototype does not itself establish that
    // visitors actually used it. Require an explicit observation in the citation.
    const visitor = /(?:\b(?:visitors?|attendees?)\b|来場者|訪問者|观众|觀眾|参观者|參觀者)/iu;
    const interaction = /(?:\b(?:interact(?:ed|ing)?|tried|used|touched|engaged)\b|触れ|体験し|操作し|互动|互動|体验|體驗|操作)/iu;
    if (visitor.test(claim.text) && interaction.test(claim.text) && !cited.some(text => text.split(/[。.!?\n]/u).some(sentence => visitor.test(sentence) && interaction.test(sentence)))) return false;
    if (config.exactClaimEvidence?.some(pattern => new RegExp(pattern).test(claim.text) && !cited.some(text => new RegExp(pattern).test(text)))) return false;
    // Interviewees using a named tool are not automatically the product's target audience.
    const targetAudience = /(?:target(?:ed)?\s+(?:audience|users?|customers?)|designed\s+for|対象(?:ユーザー|者|として|に)|(?:面向|针对).{0,12}(?:用户|使用者))/iu;
    const tools = audienceEvidenceTerms(config).filter(tool => claim.text.toLowerCase().includes(tool));
    if (targetAudience.test(claim.text) && !cited.some(text => text.split(/[。.!?\n]/u).some(sentence => audienceStatement.test(sentence) && tools.every(tool => sentence.toLowerCase().includes(tool))))) return false;
    const generalizes = /(?:\busers?\b|\bresearchers?\b|用户|使用者|ユーザー)/iu.test(claim.text) && /(?:\b(?:struggle|difficult|problem|cannot|can't)\b|难以|困难|问题|困難|課題)/iu.test(claim.text);
    if (!generalizes) return true;
    return !cited.every(text => /(?:\bI\b|\bmy\b|我|私)/u.test(text) && !/(?:interview|participants|survey|访谈|調査|采访|受访|インタビュー)/iu.test(text));
  });
  const covered = new Set(valid.flatMap(c => c.evidenceKeys.map(k => evidence.get(k)?.projectId)));
  if (output.insufficient || !valid.length || (pack.projects.length > 1 && pack.projects.some(id => !covered.has(id)))) return { ...validateAnswer({ answer:"", language:output.language, insufficient:true, sourceIds:[], recommendedProjectIds:[] }, corpus, config.ownerName), claims:[], insufficient:true };
  const ids = [...new Set(valid.flatMap(c => c.evidenceKeys.map(k => evidence.get(k)!.chunkId)))];
  const base = validateAnswer({ answer:valid.map(c => c.text).join("\n\n"), language:output.language, insufficient:false, sourceIds:ids, recommendedProjectIds:[] }, corpus, config.ownerName);
  let recommendations: ReturnType<typeof resolveRecommendations> = [];
  try { recommendations = resolveRecommendations(output.recommendedProjectIds, corpus, output.language); } catch { /* Drop invalid recommendations. */ }
  return { ...base, recommendations, claims: valid, insufficient:false };
}
