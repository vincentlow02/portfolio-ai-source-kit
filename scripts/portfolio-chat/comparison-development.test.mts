import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { buildB2Pack } from "../../lib/portfolio-chat/b2";
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
