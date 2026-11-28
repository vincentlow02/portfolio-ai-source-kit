import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { sourceMatchesSpecificIntent } from "../../lib/portfolio-chat/retrieval";
import { createModelReply, excerptReply, validateWidgetQuestion } from "../../lib/portfolio-chat/source-reply";

const corpus=await buildKnowledgeCorpus([
 {access:"public",format:"rendered",page:{url:"/work/compass",title:"Compass",language:"en",kind:"case-study",projectId:"compass"},sections:[{title:"Data storage",anchor:"storage",text:"The instrument records temperature measurements on an SD card inside the device."}]},
 {access:"public",format:"rendered",page:{url:"/work/marsh",title:"Marsh",language:"en",kind:"case-study",projectId:"marsh"},sections:[{title:"Interviews",anchor:"interviews",text:"Eight nurses described how they hand over patient information during research interviews."}]},
 {access:"public",format:"rendered",page:{url:"/work/loom",title:"Loom",language:"en",kind:"case-study",projectId:"loom"},sections:[{title:"Workshop kit",anchor:"kit",text:"The kit contains removable panels that educators can rearrange to create lesson plans."}]},
],"intent-gate-fixture",async()=>{});
const user=(content:string)=>[{role:"user" as const,content}];

test("specific factual intent requires corresponding evidence, including cross-language evidence",()=>{
 for(const [q,negative,positive] of [
  ["教材を購入するにはいくらかかりますか？","The kit contains removable panels.","The kit price is 50 dollars."],
  ["看護師の給料はいくらですか？","Eight nurses described patient handover.","The nurses' salary is 5000 dollars."],
  ["SDカードを製造している会社はどこですか？","The instrument records measurements on an SD card.","The card was manufactured by Acme."],
  ["What is the price?","The project has a prototype.","It is free to use."],
  ["工资是多少？","护理人员参加了访谈。","护理人员的工资是每月5000元。"],
  ["購入にはいくらかかりますか？","元々この道具は紙でできています。","月額５００円です。"],
  ["Loom のパネルは何枚ありますか？","The kit contains removable panels.","The kit includes eight panels."],
  ["Moss の教材はいつから使われていますか？","Teachers use the kit for workshops.","The kit has been in use since 2022."],
  ["How many gardeners tested Moss?","Moss has a garden.","Moss was tested by five gardeners."],
  ["How many gardeners tested Moss?","Moss launched in 2021.","In 2021, five gardeners tested Moss."],
  ["Loom の道具はいつから使われていますか？","The tool was designed in 2020.","The tool has been used by teachers since 2021."],
 ] as const){assert.equal(sourceMatchesSpecificIntent(q,negative),false,q);assert.equal(sourceMatchesSpecificIntent(q,positive),true,q);}
 assert.equal(sourceMatchesSpecificIntent("How much experience does the team have?","The team has five years of experience."),true);
 assert.equal(sourceMatchesSpecificIntent("When humidity falls, what happens?","When humidity falls, the sensor warns the gardener."),true);
});

test("unsupported price, salary, manufacturer, count and date questions skip quota and generation",async()=>{
 const model=createModelReply(corpus,{PORTFOLIO_AI_PROVIDER:"qwen",QWEN_API_KEY:"fixture-only",QWEN_BASE_URL:"https://fixture.invalid/v1",QWEN_MODEL:"qwen3.7-flash"});
 let reservations=0;
 for(const q of ["SDカードを製造している会社はどこですか？","病院の看護師は何時に給料を受け取りますか？","授業用のパネルを購入するにはいくらかかりますか？","Loom のパネルは何枚ありますか？","Loom の教材はいつから使われていますか？"]){
  const reply=await model(user(q),"ja",undefined,{reserve:async()=>{reservations++;return false;}});
  assert.deepEqual(reply.sources,[],q);
  const excerpt=await excerptReply(corpus,user(q),"ja");
  assert.deepEqual(excerpt.sources,[],q);
 }
 const selection=validateWidgetQuestion({messages:user("What does it cost?"),selectionContext:{pagePath:"/work/loom",sectionId:"kit",text:"removable panels"}},corpus);
 const selectedReply=await model(selection.messages,"en",selection.quote,{reserve:async()=>{reservations++;return false;}});
 assert.deepEqual(selectedReply.sources,[]);
 assert.deepEqual((await excerptReply(corpus,selection.messages,"en",selection.quote)).sources,[]);
 assert.equal(reservations,0);
});
