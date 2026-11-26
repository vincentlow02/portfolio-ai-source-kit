import {performance} from 'node:perf_hooks';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
// Frozen before first execution; same-reviewer fictional sources; no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT??process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/orion',title:'Orion',language:'en',kind:'case-study',projectId:'orion'},sections:[{title:'Research',anchor:'research',text:'The team not only interviewed six nurses but also published a study report.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cairn',title:'Cairn',language:'en',kind:'case-study',projectId:'cairn'},sections:[{title:'Research',anchor:'research',text:'Researchers interviewed eight teachers during the study.'}]},
 {access:'public',format:'rendered',page:{url:'/work/snow',title:'Snow',language:'en',kind:'case-study',projectId:'snow'},sections:[{title:'Research',anchor:'research',text:'The team never interviewed six visitors during the study.'}]},
 {access:'public',format:'rendered',page:{url:'/work/wave',title:'Wave',language:'en',kind:'case-study',projectId:'wave'},sections:[{title:'Research',anchor:'research',text:'Researchers had not interviewed eight gardeners during the study.'}]},
 {access:'public',format:'rendered',page:{url:'/work/crest',title:'Crest',language:'en',kind:'case-study',projectId:'crest'},sections:[{title:'Research',anchor:'research',text:'The team would have interviewed six visitors during the study.'}]},
 {access:'public',format:'rendered',page:{url:'/work/fir',title:'Fir',language:'en',kind:'case-study',projectId:'fir'},sections:[{title:'Research',anchor:'research',text:'Researchers might have interviewed eight gardeners during the study.'}]},
 {access:'public',format:'rendered',page:{url:'/work/ferry',title:'Ferry',language:'en',kind:'case-study',projectId:'ferry'},sections:[{title:'Research',anchor:'research',text:'The report denied that the team interviewed six visitors during the study.'}]},
 {access:'public',format:'rendered',page:{url:'/work/dale',title:'Dale',language:'en',kind:'case-study',projectId:'dale'},sections:[{title:'Research',anchor:'research',text:'The report denied that researchers interviewed eight teachers during the study.'}]},
],'participant-polarity-confirmation-v1',async()=>{});
const cases=[
 {id:'p1',q:'Compare Orion and Cairn participants.',kind:'supported'},
 {id:'n1',q:'Compare Snow and Wave participants.',kind:'negated'},
 {id:'n2',q:'Compare Crest and Fir participants.',kind:'conditional'},
 {id:'n3',q:'Compare Ferry and Dale participants.',kind:'denied-report'},
 {id:'n4',q:'Compare Orion and Snow participants.',kind:'one-sided'},
 {id:'n5',q:'Compare Orion and Cairn participant names.',kind:'unknown-names'},
];
const rows=[];for(const item of cases){const messages=[{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'en',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'en');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
