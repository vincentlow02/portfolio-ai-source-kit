import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
// Fresh synthetic usage/count cases frozen after the prior diagnostic case was
// promoted to development. No provider call or threshold sweep is performed.
const sources:KnowledgeSource[]=[
 {access:"public",format:"rendered",page:{url:"/work/maple",title:"Maple",language:"en",kind:"case-study",projectId:"maple"},sections:[{title:"Use",anchor:"use",text:"Volunteers have used the Maple tool since 2020 at the clinic."}]},
 {access:"public",format:"rendered",page:{url:"/work/birch",title:"Birch",language:"en",kind:"case-study",projectId:"birch"},sections:[{title:"Trial",anchor:"trial",text:"Six nurses tested the Birch prototype during a workshop."}]},
 {access:"public",format:"rendered",page:{url:"/work/hazel",title:"Hazel",language:"en",kind:"case-study",projectId:"hazel"},sections:[{title:"Design",anchor:"design",text:"Hazel was designed in 2019 for use in a community centre."}]},
 {access:"public",format:"rendered",page:{url:"/work/cedar",title:"Cedar",language:"en",kind:"case-study",projectId:"cedar"},sections:[{title:"History",anchor:"history",text:"The Cedar concept was created in 2021 for a local museum."}]},
];
const cases=[
 {id:"p1",q:"Maple の道具はいつから使われていますか？",expected:"/work/maple#use"},
 {id:"p2",q:"Birch の試作品は何人の看護師がテストしましたか？",expected:"/work/birch#trial"},
 {id:"n1",q:"Hazel の道具はいつから使われていますか？",expected:null},
 {id:"n2",q:"Cedar の展示には何人が参加しましたか？",expected:null},
];
const corpus=await buildKnowledgeCorpus(sources,"usage-confirmation-v1",async()=>{});const rows=[];
for(const item of cases){const messages=[{role:"user" as const,content:item.q}];const result=await prepareAnswer({corpus,messages,language:"ja",config:{ownerName:"Example"}});rows.push({...item,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),insufficient:result.answer?.insufficient ?? false,needsGeneration:result.answer===null});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
