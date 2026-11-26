import { performance } from "node:perf_hooks";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
// Frozen before the scoped fallback is evaluated. New fictional projects and
// questions; no provider calls, no threshold tuning against these cases.
const sources:KnowledgeSource[]=[
 {access:"public",format:"rendered",page:{url:"/work/reef",title:"Reef",language:"en",kind:"case-study",projectId:"reef"},sections:[{title:"Audio access",anchor:"audio",text:"The gallery kiosk keeps recorded descriptions on the device so they can be played without a network connection."}]},
 {access:"public",format:"rendered",page:{url:"/work/slate",title:"Slate",language:"en",kind:"case-study",projectId:"slate"},sections:[{title:"Planning",anchor:"planning",text:"Teachers can reorder reusable activity cards to plan a workshop sequence."}]},
 {access:"public",format:"rendered",page:{url:"/work/haven",title:"Haven",language:"en",kind:"case-study",projectId:"haven"},sections:[{title:"Study",anchor:"study",text:"Five nurses tried the handover prototype during a moderated session."}]},
 {access:"public",format:"rendered",page:{url:"/work/oriel",title:"Oriel",language:"en",kind:"case-study",projectId:"oriel"},sections:[{title:"Monitoring",anchor:"monitoring",text:"A sensor stores soil moisture readings on the device every fifteen minutes."}]},
];
const cases=[
 {id:"p1",q:"Reef の音声はネット接続なしでどこに保存されていますか？",expected:"/work/reef#audio"},
 {id:"p2",q:"Slate では活動の順序を変えることができますか？",expected:"/work/slate#planning"},
 {id:"p3",q:"Haven の調査にはどんな専門職が参加しましたか？",expected:"/work/haven#study"},
 {id:"p4",q:"Oriel は土の湿り具合をどのくらいの間隔で記録しますか？",expected:"/work/oriel#monitoring"},
 {id:"n1",q:"Reef の音声は月にいくらで購入できますか？",expected:null},
 {id:"n2",q:"Slate のカードは何色ですか？",expected:null},
 {id:"n3",q:"Haven の設計者はどこに住んでいますか？",expected:null},
 {id:"n4",q:"Oriel は火星でいつ発売されましたか？",expected:null},
];
const corpus=await buildKnowledgeCorpus(sources,"scoped-fresh-v1",async()=>{});
const rows=[];
for(const item of cases){const messages=[{role:"user" as const,content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:"ja",config:{ownerName:"Example"}});rows.push({...item,evidence:result.pack.entries.map(e=>({id:e.chunk.chunkId,url:e.chunk.sourceUrl,reason:e.reason})),insufficient:result.answer?.insufficient ?? false,needsGeneration:result.answer===null,preparationMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
