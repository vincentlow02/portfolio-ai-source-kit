import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { buildB2Pack } from "../../lib/portfolio-chat/b2";
import { createModelReply, excerptReply } from "../../lib/portfolio-chat/source-reply";
const corpus=await buildKnowledgeCorpus([
 {access:"public",format:"rendered",page:{url:"/work/quill",title:"Quill",language:"en",kind:"case-study",projectId:"quill"},sections:[{title:"Research interviews",anchor:"research",text:"Researchers interviewed six archivists about describing fragile photographs."},{title:"Prototype",anchor:"prototype",text:"The interface groups photographs by collection."}]},
 {access:"public",format:"rendered",page:{url:"/work/bridge",title:"Bridge",language:"en",kind:"case-study",projectId:"bridge"},sections:[{title:"Research interviews",anchor:"research",text:"The team interviewed five museum curators about tracking loan requests."},{title:"Prototype",anchor:"prototype",text:"The interface displays a timeline of artwork loans."}]}
],"comparison-dev",async()=>{});
const query=(content:string)=>[{role:"user" as const,content}];
test("topic-specific comparison needs evidence for each named project",async()=>{
 const pack=await buildB2Pack(corpus,query("Compare the Quill and Bridge research interviews."),null,"en",undefined,undefined,{ownerName:"Example"});
 assert.deepEqual(new Set(pack.entries.map(e=>e.chunk.projectId)),new Set(["quill","bridge"]));
 assert.ok(pack.entries.every(e=>e.chunk.sourceUrl.endsWith("#research")));
});
test("unrelated specific comparison cannot use generic project supplements",async()=>{
 const pack=await buildB2Pack(corpus,query("Compare Quill and Bridge submarine engine fuel capacity."),null,"en",undefined,undefined,{ownerName:"Example"});
 assert.deepEqual(pack.entries,[]);
});
test("both named projects retain evidence for a question about their interviewees",async()=>{
 const pack=await buildB2Pack(corpus,query("Who did Quill and Bridge speak to during discovery?"),null,"en",undefined,undefined,{ownerName:"Example"});
 assert.deepEqual(new Set(pack.entries.map(e=>e.chunk.projectId)),new Set(["quill","bridge"]));
 assert.ok(pack.entries.every(e=>e.chunk.sourceUrl.endsWith("#research")));
});
test("interviewee supplement cannot support an unrelated specific subject",async()=>{
 const pack=await buildB2Pack(corpus,query("Who did Quill and Bridge speak to during research about submarines?"),null,"en",undefined,undefined,{ownerName:"Example"});
 assert.deepEqual(pack.entries,[]);
});
test("unsupported participant names do not reserve model quota",async()=>{
 const fixture=await buildKnowledgeCorpus([
  {access:"public",format:"rendered",page:{url:"/work/harbor",title:"Harbor",language:"en",kind:"case-study",projectId:"harbor"},sections:[{title:"Evaluation",anchor:"evaluation",text:"Seven librarians tried the wayfinding prototype and noted where the signage confused them."},{title:"Accessibility",anchor:"accessibility",text:"Large type and tactile buttons help visitors operate the kiosk."}]},
  {access:"public",format:"rendered",page:{url:"/work/orchard",title:"Orchard",language:"en",kind:"case-study",projectId:"orchard"},sections:[{title:"Discovery",anchor:"discovery",text:"The team interviewed four community gardeners about sharing tools."},{title:"Accessibility",anchor:"accessibility",text:"The instructions use large type and strong colour contrast."}]},
  {access:"public",format:"rendered",page:{url:"/work/grove",title:"Grove",language:"en",kind:"case-study",projectId:"grove"},sections:[{title:"Storage",anchor:"storage",text:"Audio files remain on the device and work without internet access."},{title:"Construction",anchor:"construction",text:"The team made the enclosure from cardboard and plywood."}]},
  {access:"public",format:"rendered",page:{url:"/work/lantern",title:"Lantern",language:"en",kind:"case-study",projectId:"lantern"},sections:[{title:"Storage",anchor:"storage",text:"The application saves the recorded stories locally for offline playback."},{title:"Construction",anchor:"construction",text:"The early model used recycled cardboard and wooden panels."}]},
 ],"comparison-name-regression",async()=>{});
 let reservations=0;
 const model=createModelReply(fixture,{PORTFOLIO_AI_PROVIDER:"qwen",QWEN_API_KEY:"fixture-only",QWEN_BASE_URL:"https://fixture.invalid/v1",QWEN_MODEL:"qwen3.7-flash"});
 const reply=await model(query("Compare Harbor and Orchard study participant names."),"en",undefined,{reserve:async()=>{reservations++;return false;}});
 assert.deepEqual(reply.sources,[]);
 assert.equal(reservations,0);
});

test("explicit participant comparison uses evidence for each project and rejects extra attributes",async()=>{
 const fixture=await buildKnowledgeCorpus([
  {access:"public",format:"rendered",page:{url:"/work/dune",title:"Dune",language:"en",kind:"case-study",projectId:"dune"},sections:[{title:"Interviews",anchor:"research",text:"Eight care workers described difficulty finding instructions during interviews at a clinic."}]},
  {access:"public",format:"rendered",page:{url:"/work/cedar",title:"Cedar",language:"en",kind:"case-study",projectId:"cedar"},sections:[{title:"Trial",anchor:"research",text:"Five teachers tested a paper planner during a workshop at a community centre."}]},
  {access:"public",format:"rendered",page:{url:"/work/canal",title:"Canal",language:"en",kind:"case-study",projectId:"canal"},sections:[{title:"Trial",anchor:"research",text:"Six librarians tested a library catalogue."}]},
 ],"participant-comparison-development",async()=>{});
 const pack=await buildB2Pack(fixture,query("Compare Dune and Cedar participants."),null,"en",undefined,undefined,{ownerName:"Example"});
 assert.deepEqual(new Set(pack.entries.map(e=>e.chunk.sourceUrl)),new Set(["/work/dune#research","/work/cedar#research"]));
 assert.deepEqual(new Set((await excerptReply(fixture,query("Compare Dune and Cedar participants."),"en")).sources.map(source=>source.url)),new Set(["/work/dune#research","/work/cedar#research"]));
 const model=createModelReply(fixture,{PORTFOLIO_AI_PROVIDER:"qwen",QWEN_API_KEY:"fixture-only",QWEN_BASE_URL:"https://fixture.invalid/v1",QWEN_MODEL:"qwen3.7-flash"});
 for(const text of ["Compare Dune and Cedar study participant names.","Compare Dune and Cedar participants from Mars.","Compare Dune and Cedar participant salaries."]){
  let reservations=0;
  assert.deepEqual((await model(query(text),"en",undefined,{reserve:async()=>{reservations++;return false;}})).sources,[],text);
  assert.equal(reservations,0,text);
 }
});
