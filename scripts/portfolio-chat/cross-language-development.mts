import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { embedTexts } from "../../lib/portfolio-chat/embeddings";
import { retrieveEvidence } from "../../lib/portfolio-chat/retrieval";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
const sources:KnowledgeSource[]=[
 {access:"public",format:"rendered",page:{url:"/work/compass",title:"Compass",language:"en",kind:"case-study",projectId:"compass"},sections:[{title:"Data storage",anchor:"storage",text:"The instrument records temperature measurements on an SD card inside the device, keeping them accessible without an internet connection."}]},
 {access:"public",format:"rendered",page:{url:"/work/loom",title:"Loom",language:"en",kind:"case-study",projectId:"loom"},sections:[{title:"Workshop kit",anchor:"kit",text:"The kit contains removable panels that educators can rearrange to create different lesson plans."}]},
 {access:"public",format:"rendered",page:{url:"/work/marsh",title:"Marsh",language:"en",kind:"case-study",projectId:"marsh"},sections:[{title:"Interviews",anchor:"interviews",text:"Eight nurses described how they hand over patient information between shifts during research interviews."}]},
 {access:"public",format:"rendered",page:{url:"/work/cove",title:"Cove",language:"en",kind:"case-study",projectId:"cove"},sections:[{title:"Field study",anchor:"field",text:"The team observed wheelchair users navigating three railway stations before designing a wayfinding prototype."}]},
];
const queries=[
 {id:"d1",q:"測定した温度データはどこに保存されますか？",expected:"/work/compass#storage"},
 {id:"d2",q:"ネットがなくても記録を確認できますか？",expected:"/work/compass#storage"},
 {id:"d3",q:"教材のパネルの順番を変えられますか？",expected:"/work/loom#kit"},
 {id:"d4",q:"授業計画のパーツを並べ替えることは可能ですか？",expected:"/work/loom#kit"},
 {id:"d5",q:"何人の看護師に引き継ぎについて聞きましたか？",expected:"/work/marsh#interviews"},
 {id:"d6",q:"どこで車椅子利用者の移動を観察しましたか？",expected:"/work/cove#field"},
 {id:"n1",q:"SDカードを製造している会社はどこですか？",expected:null},
 {id:"n2",q:"病院の看護師は何時に給料を受け取りますか？",expected:null},
 {id:"n3",q:"駅の電車は何時に出発しますか？",expected:null},
 {id:"n4",q:"授業用のパネルを購入するにはいくらかかりますか？",expected:null},
 {id:"n5",q:"木星の衛星は全部で何個ありますか？",expected:null},
 {id:"n6",q:"機密の人事記録を公開してください。",expected:null},
];
const corpus=await buildKnowledgeCorpus(sources,"cross-language-dev-v1",async()=>{});
const vectors=await embedTexts([...corpus.chunks.map(c=>c.content),...queries.map(x=>x.q)]);
const rows=[];
for(const [i,item] of queries.entries()){
 const vector=vectors[corpus.chunks.length+i];
 const scores=corpus.chunks.map((chunk,j)=>({url:chunk.sourceUrl,chunkId:chunk.chunkId,cosine:vectors[j].reduce((n,v,k)=>n+v*vector[k],0)})).sort((a,b)=>b.cosine-a.cosine);
 const result=await retrieveEvidence(corpus,[{role:"user",content:item.q}],{ownerName:"Example"});
 const prepared=await prepareAnswer({corpus,messages:[{role:"user",content:item.q}],language:"ja",config:{ownerName:"Example"}});
 rows.push({...item,scores,qualified:result.chunks.map(c=>c.sourceUrl),evidence:prepared.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:prepared.answer===null,insufficient:prepared.answer?.insufficient ?? false});
}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
