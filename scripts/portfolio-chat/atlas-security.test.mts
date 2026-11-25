import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { b2PublicCorpus, buildB2Pack, parsePageContext, validateB2 } from "../../lib/portfolio-chat/b2";
import { attachSelectedQuotation, verifySelection } from "../../lib/portfolio-chat/selection";
import { configureModel } from "../../lib/portfolio-chat/provider";
import type { PortfolioChatConfig } from "../../lib/portfolio-chat/engine-config";

const config: PortfolioChatConfig = { ownerName:"Morgan Reed", ownerAliases:["Morgan"], projectAliases:{lantern:["Lantern"]}, protectedSourcePrefixes:["/work/undisclosed"] };
const sources: KnowledgeSource[] = [
  { access:"public", format:"json", page:{url:"/work/lantern",title:"Lantern",language:"en",kind:"case-study",projectId:"lantern"}, data:{sections:[
    {title:"Concept",anchor:"concept",text:"I imagined a navigation concept for public libraries."},
    {title:"Team work",anchor:"team",text:"Art direction and visual explorations for Lantern."},
    {title:"Contribution",anchor:"contribution",text:"I provided art direction for Lantern."},
  ]} },
  { access:"protected", url:"/work/undisclosed" },
];
const built = await buildKnowledgeCorpus(sources, "fixture-build", async () => {});
const corpus = b2PublicCorpus(built, "fixture-build", config);
const page = parsePageContext({pathname:"/work/lantern",lang:"en"},corpus,config);
const messages = [{role:"user" as const, content:"What was Morgan responsible for in Lantern?"}];
const pack = await buildB2Pack(corpus,messages,page,"en",undefined,undefined,config);
const personal = pack.entries.find(entry => entry.chunk.content.includes("I imagined"));
const team = pack.entries.find(entry => entry.chunk.content.includes("Art direction"));
const direct = pack.entries.find(entry => entry.chunk.content.includes("I provided"));
assert.ok(personal && team && direct);

test("first-person concept can be attributed but team art direction cannot", () => {
  const validate = (text:string,key:string) => validateB2({language:"en",insufficient:false,claims:[{text,evidenceKeys:[key]}],recommendedProjectIds:[]},corpus,pack);
  assert.equal(validate("Morgan imagined a navigation concept for public libraries.",personal.key).insufficient,false);
  assert.equal(validate("Morgan imagined a navigation concept for public libraries.",team.key).insufficient,true);
  assert.equal(validate("Morgan provided the art direction and visual explorations for Lantern.",team.key).insufficient,true);
  assert.equal(validate("Morgan provided the art direction and visual explorations for Lantern.",personal.key).insufficient,true);
  assert.equal(validate("Morgan provided art direction for Lantern.",direct.key).insufficient,false);
  const combined = validateB2({ language: "en", insufficient: false, claims: [
    { text: "Morgan imagined the visual explorations for Lantern.", evidenceKeys: [personal.key, team.key] },
  ], recommendedProjectIds: [] }, corpus, pack);
  assert.equal(combined.insufficient, true);
  assert.equal(validate("I provided art direction for Lantern.",team.key).insufficient,true);
  assert.equal(validate("I provided art direction for Lantern.",direct.key).insufficient,false);
  assert.equal(validate("She provided art direction for Lantern.",team.key).insufficient,true);
  assert.equal(validate("She provided art direction for Lantern.",direct.key).insufficient,false);
  for (const [language, text] of [["zh", "我负责了 Lantern 的艺术指导。"], ["zh", "我負責 Lantern 的藝術指導。"], ["zh", "她负责了 Lantern 的艺术指导。"], ["ja", "私は Lantern のアートディレクションを担当しました。"], ["ja", "彼女は Lantern のアートディレクションを担当しました。"]] as const) {
    const firstPerson = (key:string) => validateB2({language,insufficient:false,claims:[{text,evidenceKeys:[key]}],recommendedProjectIds:[]},corpus,pack);
    assert.equal(firstPerson(team.key).insufficient,true);
    assert.equal(firstPerson(direct.key).insufficient,false);
  }
  assert.equal(validate("An invented fact.","E999").insufficient,true);
});

test("verified selections are separately attributed and private selections fail", () => {
  const selection = verifySelection({pagePath:"/work/lantern",text:"I imagined a navigation concept for public libraries.",sectionId:"concept"},corpus,page);
  const response: Parameters<typeof attachSelectedQuotation>[0] = {answer:"The team explored visuals.", insufficient:false, sources:[], claims:[{text:"The team explored visuals.",evidenceKeys:[team.key]}]};
  const result = attachSelectedQuotation(response,selection,personal.key,"en");
  assert.equal(result.sources[0].url,"/work/lantern#concept");
  assert.deepEqual(result.claims[0].evidenceKeys,[personal.key]);
  assert.deepEqual(result.claims[1].evidenceKeys,[team.key]);
  assert.throws(() => verifySelection({pagePath:"/work/undisclosed",text:"private data",sectionId:null},corpus,page));
  assert.throws(() => parsePageContext({pathname:"/work/undisclosed"},corpus,config));
});

test("traditional Chinese personal-role evidence is recognized across languages", async () => {
  const traditional = await buildKnowledgeCorpus([
    {access:"public",format:"rendered",page:{url:"/work/lantern",title:"Lantern",language:"zh",kind:"case-study",projectId:"lantern"},sections:[{title:"我的職責",anchor:"role",text:"我負責藝術指導。"}]},
  ],"traditional-role",async()=>{});
  const result = await buildB2Pack(traditional,[{role:"user",content:"Lantern 的职责是什么？"}],null,"zh",undefined,undefined,config);
  const scoped={...result,projects:["lantern"],entries:[{key:"E1",chunk:traditional.chunks[0],reason:"qualified-match"}]};
  const answer=validateB2({language:"en",insufficient:false,claims:[{text:"Morgan provided art direction for Lantern.",evidenceKeys:["E1"]}],recommendedProjectIds:[]},traditional,scoped);
  assert.equal(answer.insufficient,false);
});

test("Qwen configuration accepts a compatible HTTPS endpoint and rejects unsafe settings without network calls", () => {
  const env = { PORTFOLIO_AI_PROVIDER:"qwen", QWEN_API_KEY:"fixture-key", QWEN_BASE_URL:"https://qwen.fixture.invalid/v1", QWEN_MODEL:"qwen3.7-flash", QWEN_JSON_MODE:"schema" };
  assert.equal(configureModel(env)?.modelId,"qwen3.7-flash");
  assert.equal(configureModel({...env,QWEN_JSON_MODE:"object"})?.provider,"qwen");
  assert.equal(configureModel({...env,QWEN_BASE_URL:"http://qwen.fixture.invalid/v1"}),null);
  assert.equal(configureModel({...env,QWEN_BASE_URL:"https://qwen.fixture.invalid/v1/chat/completions"}),null);
  assert.equal(configureModel({...env,QWEN_JSON_MODE:"invalid"}),null);
  assert.equal(configureModel({...env,QWEN_API_KEY:""}),null);
});
