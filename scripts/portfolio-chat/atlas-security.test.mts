import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { b2PublicCorpus, buildB2Pack, parsePageContext, validateB2 } from "../../lib/portfolio-chat/b2";
import { attachSelectedQuotation, verifySelection } from "../../lib/portfolio-chat/selection";
import type { PortfolioChatConfig } from "../../lib/portfolio-chat/engine-config";

const config: PortfolioChatConfig = { ownerName:"Morgan Reed", ownerAliases:["Morgan"], projectAliases:{lantern:["Lantern"]}, protectedSourcePrefixes:["/work/undisclosed"] };
const sources: KnowledgeSource[] = [
  { access:"public", format:"json", page:{url:"/work/lantern",title:"Lantern",language:"en",kind:"case-study",projectId:"lantern"}, data:{sections:[
    {title:"Concept",anchor:"concept",text:"I imagined a navigation concept for public libraries."},
    {title:"Team work",anchor:"team",text:"Art direction and visual explorations for Lantern."},
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
assert.ok(personal && team);

test("first-person concept can be attributed but team art direction cannot", () => {
  const validate = (text:string,key:string) => validateB2({language:"en",insufficient:false,claims:[{text,evidenceKeys:[key]}],recommendedProjectIds:[]},corpus,pack);
  assert.equal(validate("Morgan imagined a navigation concept for public libraries.",personal.key).insufficient,false);
  assert.equal(validate("Morgan imagined a navigation concept for public libraries.",team.key).insufficient,true);
  assert.equal(validate("Morgan provided the art direction and visual explorations for Lantern.",team.key).insufficient,true);
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
