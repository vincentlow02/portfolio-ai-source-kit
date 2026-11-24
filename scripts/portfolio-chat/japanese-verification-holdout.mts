import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before either run. Synthetic same-reviewer data; no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/orion',title:'Orion',language:'en',kind:'case-study',projectId:'orion'},sections:[{title:'Trial',anchor:'trial',text:'The team tested an accessible display with six museum staff in 2023.'},{title:'Outcome',anchor:'outcome',text:'Visitors can adjust the type size on the display.'}]},
 {access:'public',format:'rendered',page:{url:'/work/beacon',title:'Beacon',language:'en',kind:'case-study',projectId:'beacon'},sections:[{title:'Trial',anchor:'trial',text:'Researchers tested an audio guide with seven commuters in 2023.'},{title:'Outcome',anchor:'outcome',text:'The guide groups recordings into short chapters.'}]},
 {access:'public',format:'rendered',page:{url:'/work/dune',title:'Dune',language:'en',kind:'case-study',projectId:'dune'},sections:[{title:'Trial',anchor:'trial',text:'The team tested an unrelated school journal with teachers.'}]},
],'japanese-verification-holdout-v1',async()=>{});
const cases=[
 {id:'p1',q:'両方のプロジェクトはどう検証されましたか？',kind:'supported'},
 {id:'p2',q:'両方のプロジェクトはどのような方法で検証されましたか？',kind:'supported'},
 {id:'p3',q:'両方のプロジェクトは何人で検証されましたか？',kind:'supported'},
 {id:'n1',q:'両方のプロジェクトは火星でどう検証されましたか？',kind:'unsupported'},
 {id:'n2',q:'両方のプロジェクトの検証費用はいくらですか？',kind:'unsupported'},
 {id:'n3',q:'両方のプロジェクトはどこで検証されましたか？',kind:'unsupported'},
 {id:'n4',q:'両方のプロジェクトは2021年に検証されましたか？',kind:'unsupported'},
 {id:'n5',q:'両方のプロジェクトの検証参加者の名前は？',kind:'unsupported'},
 {id:'n6',q:'両方のプロジェクトは子供の安全についてどう検証されましたか？',kind:'unsupported'},
 {id:'n7',q:'両方のプロジェクトは検証されませんでしたか？',kind:'negative-question'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:'Orion と Beacon を比べて'},{role:'assistant',content:'Two distinct projects.'},{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'ja',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'ja');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId,reason:e.reason})),needsGeneration:result.answer===null,clarification:result.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
