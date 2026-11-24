import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { retrieveEvidence } from "../../lib/portfolio-chat/retrieval";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
// Authored after the intent gate was fixed; no threshold or gate tuning on these results.
const sources:KnowledgeSource[]=[
 {access:"public",format:"rendered",page:{url:"/work/aurora",title:"Aurora",language:"en",kind:"case-study",projectId:"aurora"},sections:[{title:"Access",anchor:"access",text:"The Aurora workshop kit is free to use for schools."}]},
 {access:"public",format:"rendered",page:{url:"/work/beacon",title:"Beacon",language:"en",kind:"case-study",projectId:"beacon"},sections:[{title:"Sensors",anchor:"sensors",text:"Beacon sensors are manufactured by Northstar Instruments."}]},
 {access:"public",format:"rendered",page:{url:"/work/ridge",title:"Ridge",language:"en",kind:"case-study",projectId:"ridge"},sections:[{title:"Work",anchor:"work",text:"Ridge technicians earned a monthly salary of 5000 dollars."}]},
 {access:"public",format:"rendered",page:{url:"/work/grove",title:"Grove",language:"en",kind:"case-study",projectId:"grove"},sections:[{title:"Prototype",anchor:"prototype",text:"Grove is a public art display made with recycled timber and lights."}]},
];
const questions=[
 {id:"p1",q:"Aurora の利用料金はいくらですか？",expected:"/work/aurora#access",language:"ja" as const},
 {id:"p2",q:"Which company manufactures the Beacon sensors?",expected:"/work/beacon#sensors",language:"en" as const},
 {id:"p3",q:"Ridge 技术人员的工资是多少？",expected:"/work/ridge#work",language:"zh" as const},
 {id:"p4",q:"What is the Aurora price for schools?",expected:"/work/aurora#access",language:"en" as const},
 {id:"n1",q:"Grove を購入するにはいくらですか？",expected:null,language:"ja" as const},
 {id:"n2",q:"Who manufactures the Grove lights?",expected:null,language:"en" as const},
 {id:"n3",q:"Grove 工作人员的薪水是多少？",expected:null,language:"zh" as const},
 {id:"n4",q:"What does the Grove prototype cost?",expected:null,language:"en" as const},
];
const corpus=await buildKnowledgeCorpus(sources,"specific-intent-fresh-v1",async()=>{});
const rows=[];
for(const item of questions){const messages=[{role:"user" as const,content:item.q}];const r=await retrieveEvidence(corpus,messages,{ownerName:"Example"});const a=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:"Example"}});rows.push({...item,qualified:r.chunks.map(c=>({id:c.chunkId,url:c.sourceUrl,score:r.scores.get(c.chunkId)})),evidence:a.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:a.answer===null,insufficient:a.answer?.insufficient ?? false});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
