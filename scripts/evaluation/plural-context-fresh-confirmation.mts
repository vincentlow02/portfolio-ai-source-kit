import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Newly authored after the first set was promoted to development. Frozen
// before execution; synthetic same-reviewer sample, no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const sources=[
 {access:'public',format:'rendered',page:{url:'/work/orbit',title:'Orbit',language:'en',kind:'case-study',projectId:'orbit'},sections:[{title:'Field trial',anchor:'trial',text:'The team tested the Orbit navigation prototype with cyclists in 2022.'},{title:'Purpose',anchor:'purpose',text:'The concept helps people plan safer bicycle routes.'}]},
 {access:'public',format:'rendered',page:{url:'/work/quartz',title:'Quartz',language:'en',kind:'case-study',projectId:'quartz'},sections:[{title:'Field trial',anchor:'trial',text:'Researchers tested the Quartz music prototype with musicians in 2022.'},{title:'Purpose',anchor:'purpose',text:'The concept helps people organise their music practice.'}]},
 {access:'public',format:'rendered',page:{url:'/work/spruce',title:'Spruce',language:'en',kind:'case-study',projectId:'spruce'},sections:[{title:'Field trial',anchor:'trial',text:'The team tested a separate gardening journal with teachers.'}]},
];
const cases=[
 {id:'p1',q:'What about their testing?',language:'en',kind:'supported'},
 {id:'p2',q:'When were both projects tested?',language:'en',kind:'supported'},
 {id:'p3',q:'这两个项目如何测试？',language:'zh',kind:'supported'},
 {id:'p4',q:'両方のプロジェクトはどうテストしましたか？',language:'ja',kind:'supported'},
 {id:'n1',q:'Where were both projects tested?',language:'en',kind:'unsupported'},
 {id:'n2',q:'What were both projects’ participant names?',language:'en',kind:'unsupported'},
 {id:'n3',q:'How were both projects tested in 2021?',language:'en',kind:'unsupported'},
 {id:'n4',q:'How were both projects tested without consent?',language:'en',kind:'unsupported'},
 {id:'n5',q:'What materials did both projects use?',language:'en',kind:'unsupported'},
 {id:'n6',q:'这两个项目的测试地点在哪里？',language:'zh',kind:'unsupported'},
 {id:'n7',q:'両方のプロジェクトの参加者の名前は？',language:'ja',kind:'unsupported'},
 {id:'a1',q:'How was it tested?',language:'en',kind:'singular-ambiguous'},
 {id:'a2',q:'它是怎么测试的？',language:'zh',kind:'singular-ambiguous'},
 {id:'a3',q:'それはどうテストされましたか？',language:'ja',kind:'singular-ambiguous'},
];
const corpus=await buildKnowledgeCorpus(sources,'plural-context-fresh-confirmation-v1',async()=>{});const rows=[];
for(const item of cases){const messages=[{role:'user',content:'Compare Orbit and Quartz'},{role:'assistant',content:'These are two distinct projects.'},{role:'user',content:item.q}];const started=performance.now();const prepared=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,item.language);rows.push({...item,projects:prepared.pack.projects,evidence:prepared.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:prepared.answer===null,clarification:prepared.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),excerptAnswer:excerpt.answer,elapsedMs:performance.now()-started});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
