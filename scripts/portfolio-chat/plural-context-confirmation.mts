import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen after implementation and before any version is run. Synthetic,
// same-reviewer cases; no LLM calls and no claim of population generality.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const sources=[
 {access:'public',format:'rendered',page:{url:'/work/willow',title:'Willow',language:'en',kind:'case-study',projectId:'willow'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Researchers tested the Willow prototype with six residents in 2023.'},{title:'Product',anchor:'product',text:'The tool gives residents a reusable checklist.'}]},
 {access:'public',format:'rendered',page:{url:'/work/fjord',title:'Fjord',language:'en',kind:'case-study',projectId:'fjord'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Researchers tested the Fjord prototype with nine volunteers in 2023.'},{title:'Product',anchor:'product',text:'The tool organises local community events.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cedar',title:'Cedar',language:'en',kind:'case-study',projectId:'cedar'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Researchers tested Cedar with an unrelated collection of archival photographs.'}]},
];
const cases=[
 {id:'p1',q:'What about their testing?',language:'en',kind:'supported'},
 {id:'p2',q:'两者分别怎么测试？',language:'zh',kind:'supported'},
 {id:'p3',q:'それぞれのプロジェクトのテストは？',language:'ja',kind:'supported'},
 {id:'p4',q:'When were both projects tested?',language:'en',kind:'supported'},
 {id:'p5',q:'How were both projects validated?',language:'en',kind:'supported'},
 {id:'n1',q:'Where were both projects tested?',language:'en',kind:'unsupported'},
 {id:'n2',q:'What are their testing costs?',language:'en',kind:'unsupported'},
 {id:'n3',q:'What were both projects’ test participant names?',language:'en',kind:'unsupported'},
 {id:'n4',q:'How were both projects tested without consent?',language:'en',kind:'unsupported'},
 {id:'n5',q:'How were both projects tested in 2024?',language:'en',kind:'unsupported'},
 {id:'n6',q:'What materials did both projects use?',language:'en',kind:'unsupported'},
 {id:'n7',q:'这两个项目的测试地点是哪里？',language:'zh',kind:'unsupported'},
 {id:'n8',q:'両方のプロジェクトのテストの場所は？',language:'ja',kind:'unsupported'},
 {id:'n9',q:'What about their research salaries?',language:'en',kind:'unsupported'},
 {id:'a1',q:'How was it tested?',language:'en',kind:'singular-ambiguous'},
 {id:'a2',q:'它是怎么测试的？',language:'zh',kind:'singular-ambiguous'},
 {id:'a3',q:'それはどうテストされましたか？',language:'ja',kind:'singular-ambiguous'},
];
const corpus=await buildKnowledgeCorpus(sources,'plural-context-confirmation-v1',async()=>{});
const rows=[];
for(const item of cases){const messages=[{role:'user',content:'Compare Willow and Fjord'},{role:'assistant',content:'These are two distinct projects.'},{role:'user',content:item.q}];const started=performance.now();const prepared=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,item.language);rows.push({...item,projects:prepared.pack.projects,evidence:prepared.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:prepared.answer===null,clarification:prepared.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),excerptAnswer:excerpt.answer,elapsedMs:performance.now()-started});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
