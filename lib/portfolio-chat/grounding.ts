import type { PortfolioCorpus } from "../portfolio-knowledge";
import type { ModelClaims } from "./answer-schema";
import type { buildB2Pack } from "./b2";
import { resolveRecommendations, validateAnswer } from "./core";
import { audienceEvidenceTerms, projectPath, replaceOwnerMentions, sourcePath as pathnameOf } from "./engine-config";

export const audienceStatement = /(?:\b(?:designed|built|intended)\s+for\b|\bfor\s+(?:students?|researchers?|designers?|users?|people|teams?)\b|対象(?:ユーザー|者|として|に)|(?:学生|研究者|利用者|ユーザー).{0,12}(?:のため|向け)|(?:面向|针对).{0,12}(?:用户|使用者|学生|研究者))/iu;
export const personalRoleLabel = /(?:^|\n)\s*(?:my role|我的职责|担当)\s*(?:[:：]|\n)/iu;

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
    const attribution = /(?:\b(?:portfolioowner|he)\b|他|他本人)/iu.test(replaceOwnerMentions(claim.text, config)) && /(?:\b(?:responsible|created|directed|led|designed|built|developed|imagined|envisioned|conceived|conceptualized|provided|contributed)\b|负责|创作|主导|設計|担当|制作)/iu.test(claim.text);
    const translatedPersonalRole = citedChunks.some(chunk => chunk.language === "ja" && chunk.projectId && chunk.sectionId && personalRoleLabel.test(chunk.content) && corpus.chunks.some(other => other.language === "en" && other.projectId === chunk.projectId && other.sectionId === chunk.sectionId && pathnameOf(other.sourceUrl) === pathnameOf(chunk.sourceUrl) && corpus.pages.some(page => page.url === other.sourceUrl.split("#")[0]) && personalRoleLabel.test(other.content)));
    if (attribution && !translatedPersonalRole && !cited.some(text => /(?:\b(?:I|my)\s+(?:was responsible|led|created|designed|built|developed|imagined|envisioned|conceived|conceptualized|provided|contributed|work|role)\b|\bportfolioowner\s+(?:was responsible|led|created|designed|built|developed|imagined|envisioned|conceived|conceptualized|provided|contributed)\b|我的职责|我负责|我设计|私の役割|私が担当)/iu.test(replaceOwnerMentions(text, config)))) return false;
    // A first-person concept statement alone does not establish other work.
    if (attribution && /\b(?:provided|contributed)\b/iu.test(claim.text) && !cited.some(text => /\b(?:I|portfolioowner)\s+(?:provided|contributed|was responsible)\b|\bmy role\b|我的职责|我负责|私の役割|私が担当/iu.test(replaceOwnerMentions(text, config)))) return false;
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
