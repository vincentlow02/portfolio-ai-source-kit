import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
// New multi-section confirmation authored before this evaluation. One reader
// authored both corpus and questions; it is not a blinded external benchmark.
const sources:KnowledgeSource[]=[
 {access:"public",format:"rendered",page:{url:"/work/nimbus",title:"Nimbus",language:"en",kind:"case-study",projectId:"nimbus"},sections:[
  {title:"Offline access",anchor:"offline",text:"The installation saves spoken captions on its device so they remain available without connectivity."},
  {title:"Materials",anchor:"materials",text:"The team built the enclosure from recycled plywood with a soft fabric surface."},
  {title:"Testing",anchor:"testing",text:"Four residents tried the installation at a public library."}]},
 {access:"public",format:"rendered",page:{url:"/work/quartz",title:"Quartz",language:"en",kind:"case-study",projectId:"quartz"},sections:[
  {title:"Frame",anchor:"frame",text:"The prototype uses a frame made from recycled copper tubing."},
  {title:"Workshops",anchor:"workshop",text:"The team facilitated two workshops for local volunteers at a school."},
  {title:"Purpose",anchor:"purpose",text:"The display explains how rainwater travels through the neighbourhood."}]},
 {access:"public",format:"rendered",page:{url:"/work/bramble",title:"Bramble",language:"en",kind:"case-study",projectId:"bramble"},sections:[
  {title:"Research",anchor:"research",text:"Five residents discussed accessibility barriers in interviews during an early research session."},
  {title:"Construction",anchor:"construction",text:"The mobile cart uses wheels to move between community spaces."},
  {title:"Trial",anchor:"trial",text:"The prototype was trialled in a garden over three afternoons."}]},
];
const cases=[
 {id:"p1",q:"Nimbus の音声はネット接続がない時どこに保存されますか？",expected:"/work/nimbus#offline"},
 {id:"p2",q:"Quartz の試作品の骨組みにはどんな素材が使われていますか？",expected:"/work/quartz#frame"},
 {id:"p3",q:"Bramble は地域の人たちに何を聞きましたか？",expected:"/work/bramble#research"},
 {id:"n1",q:"Nimbus のパネルは何色の金属でできていますか？",expected:null},
 {id:"n2",q:"Quartz の授業キットはいつから使われていますか？",expected:null},
 {id:"n3",q:"Bramble の車輪は何個使われていますか？",expected:null},
];
const corpus=await buildKnowledgeCorpus(sources,"scope-multisection-v1",async()=>{});
const rows=[];
for(const item of cases){const messages=[{role:"user" as const,content:item.q}];const result=await prepareAnswer({corpus,messages,language:"ja",config:{ownerName:"Example"}});rows.push({...item,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId,reason:e.reason})),needsGeneration:result.answer===null,insufficient:result.answer?.insufficient ?? false});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
