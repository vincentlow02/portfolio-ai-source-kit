import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { buildB2Pack, validateB2 } from "../../lib/portfolio-chat/b2";

const config = { ownerName: "Morgan", projectAliases: { beacon: ["Beacon"], orchard: ["Orchard"] } };
const corpus = await buildKnowledgeCorpus([
  { access:"public", format:"rendered", page:{url:"/work/beacon",title:"Beacon",language:"en",kind:"case-study",projectId:"beacon"}, sections:[{title:"Trial",anchor:"trial",text:"The Beacon team tested the prototype with six visitors in 2021. The team did not launch the service."}] },
  { access:"public", format:"rendered", page:{url:"/work/orchard",title:"Orchard",language:"en",kind:"case-study",projectId:"orchard"}, sections:[{title:"Trial",anchor:"trial",text:"The Orchard team tested a prototype with eight gardeners in 2022."}] },
  { access:"public", format:"rendered", page:{url:"/work/a",title:"A",language:"en",kind:"case-study",projectId:"a"}, sections:[{title:"Overview",anchor:"overview",text:"A is a fictional short project name."}] },
], "adversarial", async () => {});
const initial = await buildB2Pack(corpus, [{role:"user",content:"Tell me about Beacon testing"}], null, "en", undefined, undefined, config);
const beacon = corpus.chunks.find(chunk => chunk.projectId === "beacon")!;
const pack = { ...initial, projects:["beacon"], entries:[{key:"E1",chunk:beacon,reason:"qualified-match"}] };
function check(text:string, evidenceKeys = ["E1"], language:"en"|"zh"|"ja" = "en") {
  return validateB2({language,insufficient:false,claims:[{text,evidenceKeys}],recommendedProjectIds:[]},corpus,pack);
}

test("adversarial claims reject numeric and date substitutions, forged citations and wrong projects", () => {
  assert.equal(check("Beacon tested the prototype with 6 visitors in 2021.").insufficient,false);
  assert.equal(check("Beacon tested a prototype with 6 visitors in 2021.").insufficient,false);
  for (const text of ["Beacon tested the prototype with 9 visitors in 2021.", "Beacon tested the prototype with nine visitors in 2021.", "Beacon tested the prototype with 6 visitors in 2024.", "Orchard tested the prototype with 6 visitors in 2021."]) assert.equal(check(text).insufficient,true,text);
  assert.equal(check("Beacon tested the prototype with 6 visitors.",["E999"]).insufficient,true);
  assert.equal(check("Beacon 于2024年测试了原型。",["E1"],"zh").insufficient,true);
  assert.equal(check("Beacon は2024年に試作品をテストしました。",["E1"],"ja").insufficient,true);
});

test("negative claim requires some explicit negative evidence for same-language sources", () => {
  assert.equal(check("Beacon did not launch the service.").insufficient,false);
  assert.equal(check("Beacon never tested the prototype.",["E1"]).insufficient,true);
  const positiveOnly = {...pack, entries:[{...pack.entries[0],chunk:{...beacon,content:"Trial\nThe Beacon team tested the prototype with six visitors in 2021."}}]};
  // A tampered chunk is rejected by corpus integrity before any polarity check.
  assert.equal(validateB2({language:"en",insufficient:false,claims:[{text:"Beacon never tested the prototype.",evidenceKeys:["E1"]}],recommendedProjectIds:[]},corpus,positiveOnly).insufficient,true);
});

test("positive claim is rejected when cited sentence explicitly negates the same action", () => {
  assert.equal(check("Beacon launched the service.").insufficient,true);
  assert.equal(check("Beacon tested the prototype with 6 visitors.").insufficient,false);
});

test("cross-language counted numbers cannot silently change", () => {
  assert.equal(check("Beacon は六人の来場者と試作品をテストしました。", ["E1"], "ja").insufficient, false);
  assert.equal(check("Beacon は九人の来場者と試作品をテストしました。", ["E1"], "ja").insufficient, true);
  assert.equal(check("Beacon 与六位访客测试了原型。", ["E1"], "zh").insufficient, false);
  assert.equal(check("Beacon 与九位访客测试了原型。", ["E1"], "zh").insufficient, true);
  assert.equal(check("Beacon は二千二十一年にテストしました。", ["E1"], "ja").insufficient, false);
  assert.equal(check("Beacon は二千二十四年にテストしました。", ["E1"], "ja").insufficient, true);
});

test("a year cannot be swapped with the visitor count", () => {
  assert.equal(check("Beacon tested the prototype with 6 visitors in 2021.").insufficient,false);
  assert.equal(check("Beacon tested the prototype with 2021 visitors in year 6.").insufficient,true);
  assert.equal(check("Beacon は二千二十一人の来場者と六年に試作品をテストしました。", ["E1"], "ja").insufficient,true);
  assert.equal(check("Beacon 与二千二十一位访客在六年测试了原型。", ["E1"], "zh").insufficient,true);
});

test("Japanese numeric evidence can support equivalent Arabic numerals", async () => {
  const japanese = await buildKnowledgeCorpus([
    {access:"public",format:"rendered",page:{url:"/work/hoshi",title:"Hoshi",language:"ja",kind:"case-study",projectId:"hoshi"},sections:[{title:"調査",anchor:"study",text:"二十人が二千二十一年に試作品をテストしました。"}]},
  ],"japanese-numeric",async()=>{});
  const initial = await buildB2Pack(japanese,[{role:"user",content:"Hoshi の調査は？"}],null,"ja",undefined,undefined,{ownerName:"Morgan"});
  const source=japanese.chunks[0];
  const scoped={...initial,projects:["hoshi"],entries:[{key:"E1",chunk:source,reason:"qualified-match"}]};
  const validate=(text:string)=>validateB2({language:"en",insufficient:false,claims:[{text,evidenceKeys:["E1"]}],recommendedProjectIds:[]},japanese,scoped);
  assert.equal(validate("Hoshi tested a prototype with 20 people in 2021.").insufficient,false);
  assert.equal(validate("Hoshi tested a prototype with 21 people in 2021.").insufficient,true);
});
