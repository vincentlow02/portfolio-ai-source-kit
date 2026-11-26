import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
// Frozen after implementing the general count/date development checks. These
// synthetic cases are a small confirmation sample, not a production estimate.
const sources:KnowledgeSource[]=[
 {access:"public",format:"rendered",page:{url:"/work/silver",title:"Silver",language:"en",kind:"case-study",projectId:"silver"},sections:[{title:"Trial",anchor:"trial",text:"Eight volunteers tested the Silver workshop prototype."},{title:"Release",anchor:"release",text:"Silver was launched in 2022 for local community groups."}]},
 {access:"public",format:"rendered",page:{url:"/work/oak",title:"Oak",language:"en",kind:"case-study",projectId:"oak"},sections:[{title:"Materials",anchor:"materials",text:"The Oak exhibit contains removable timber panels."},{title:"Background",anchor:"background",text:"The Oak concept was created in 2021 for a museum."}]},
];
const cases=[
 {id:"p1",q:"Silver の試作品は何人のボランティアがテストしましたか？",expected:"/work/silver#trial"},
 {id:"p2",q:"Silver はいつから公開されていますか？",expected:"/work/silver#release"},
 {id:"n1",q:"Oak のパネルは何枚ありますか？",expected:null},
 {id:"n2",q:"Oak の展示はいつから使われていますか？",expected:null},
 {id:"n3",q:"Oak の展示には何人が参加しましたか？",expected:null},
];
const corpus=await buildKnowledgeCorpus(sources,"count-date-confirmation-v1",async()=>{}); const rows=[];
for(const item of cases){const messages=[{role:"user" as const,content:item.q}];const result=await prepareAnswer({corpus,messages,language:"ja",config:{ownerName:"Example"}});rows.push({...item,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),insufficient:result.answer?.insufficient ?? false,needsGeneration:result.answer===null});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
