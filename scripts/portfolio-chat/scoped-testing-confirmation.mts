import {performance} from 'node:perf_hooks';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
// Frozen before first execution; same-reviewer fictional data; no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT??process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/aurora',title:'Aurora',language:'en',kind:'case-study',projectId:'aurora'},sections:[{title:'Research',anchor:'research',text:'The team tested a tactile guide with six visitors at a museum.'}]},
 {access:'public',format:'rendered',page:{url:'/work/pine',title:'Pine',language:'en',kind:'case-study',projectId:'pine'},sections:[{title:'Research',anchor:'research',text:'Researchers tested a paper timetable with four commuters at a station.'}]},
 {access:'public',format:'rendered',page:{url:'/work/larch',title:'Larch',language:'en',kind:'case-study',projectId:'larch'},sections:[{title:'Study',anchor:'study',text:'Seven gardeners tested the seed planner during a workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/pearl',title:'Pearl',language:'en',kind:'case-study',projectId:'pearl'},sections:[{title:'Study',anchor:'study',text:'The team plans to test the prototype with nine teachers.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cove',title:'Cove',language:'en',kind:'case-study',projectId:'cove'},sections:[{title:'Study',anchor:'study',text:'The team did not test the prototype with seven visitors.'}]},
],'scoped-bare-testing-confirmation-v1',async()=>{});
const cases=[
 {id:'p1',prior:'Compare Aurora and Pine',q:'Testing',kind:'supported'},
 {id:'p2',prior:'Compare Aurora and Pine',q:'Test?',kind:'supported'},
 {id:'p3',prior:'Compare Aurora and Larch',q:'Testing.',kind:'supported'},
 {id:'n1',prior:'Compare Aurora and Pine',q:'Testing on Mars',kind:'unknown-place'},
 {id:'n2',prior:'Compare Aurora and Pine',q:'Testing participant names',kind:'unknown-names'},
 {id:'n3',prior:'Compare Pearl and Cove',q:'Testing',kind:'planned-negated'},
 {id:'n4',prior:'Compare Aurora and Pine',q:'Testing submarines',kind:'unknown-subject'},
 {id:'n5',prior:'Compare Aurora and Pearl',q:'Testing',kind:'one-sided'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.prior},{role:'assistant',content:'Two projects.'},{role:'user',content:'What about both projects?'},{role:'assistant',content:'What would you like to compare about the projects?'},{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'en',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'en');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
