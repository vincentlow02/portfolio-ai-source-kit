import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before execution after the affirmative-negation guard. Same-reviewer
// fictional data; query patterns overlap development tests. No provider call.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/atoll',title:'Atoll',language:'en',kind:'case-study',projectId:'atoll'},sections:[{title:'Research',anchor:'trial',text:'The team tested a wayfinding prototype with three caretakers.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cedar',title:'Cedar',language:'en',kind:'case-study',projectId:'cedar'},sections:[{title:'Research',anchor:'trial',text:'Researchers tested an audio guide prototype with five librarians.'}]},
 {access:'public',format:'rendered',page:{url:'/work/firth',title:'Firth',language:'en',kind:'case-study',projectId:'firth'},sections:[{title:'Research',anchor:'trial',text:'The team did not test a wayfinding prototype with three caretakers.'}]},
 {access:'public',format:'rendered',page:{url:'/work/larch',title:'Larch',language:'en',kind:'case-study',projectId:'larch'},sections:[{title:'Research',anchor:'trial',text:'Researchers never tested an audio guide prototype with five librarians.'}]},
],'japanese-negation-holdout-v1',async()=>{});
const cases=[
 {id:'p1',prior:'Compare Atoll and Cedar',q:'両方のプロジェクトはどう検証されましたか？',kind:'supported'},
 {id:'p2',prior:'Compare Atoll and Cedar',q:'それぞれのプロジェクトはどのように検証されましたか？',kind:'supported'},
 {id:'p3',prior:'Compare Atoll and Cedar',q:'両方のプロジェクトは何人で検証されましたか？',kind:'supported'},
 {id:'n1',prior:'Compare Firth and Larch',q:'両方のプロジェクトはどう検証されましたか？',kind:'contradicted-assertion'},
 {id:'n2',prior:'Compare Firth and Larch',q:'How were both projects tested?',kind:'contradicted-assertion'},
 {id:'n3',prior:'Compare Atoll and Cedar',q:'両方のプロジェクトは火星でどう検証されましたか？',kind:'unsupported'},
 {id:'n4',prior:'Compare Atoll and Cedar',q:'両方のプロジェクトの検証費用はいくらですか？',kind:'unsupported'},
 {id:'n5',prior:'Compare Atoll and Cedar',q:'両方のプロジェクトはどこで検証されましたか？',kind:'unsupported'},
];
const rows=[];
for(const item of cases){const language=item.id==='n2'?'en':'ja';const messages=[{role:'user',content:item.prior},{role:'assistant',content:'Two distinct projects.'},{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,language);rows.push({...item,language,projects:result.pack.projects,evidence:result.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:result.answer===null,clarification:result.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
