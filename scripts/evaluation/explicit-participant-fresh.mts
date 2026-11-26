import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before first execution. Same-reviewer synthetic sources; no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/alder',title:'Alder',language:'en',kind:'case-study',projectId:'alder'},sections:[{title:'Research',anchor:'research',text:'The team interviewed eight gardeners about sharing tools in a community garden.'}]},
 {access:'public',format:'rendered',page:{url:'/work/comet',title:'Comet',language:'en',kind:'case-study',projectId:'comet'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Seven volunteers tried the wayfinding prototype during a workshop at a public library.'}]},
 {access:'public',format:'rendered',page:{url:'/work/ridge',title:'Ridge',language:'en',kind:'case-study',projectId:'ridge'},sections:[{title:'Overview',anchor:'overview',text:'The group has eight designers and builds a catalogue for local schools.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cove',title:'Cove',language:'en',kind:'case-study',projectId:'cove'},sections:[{title:'Research',anchor:'research',text:'The researchers did not interview eight gardeners about a prototype.'}]},
 {access:'public',format:'rendered',page:{url:'/work/mist',title:'Mist',language:'en',kind:'case-study',projectId:'mist'},sections:[{title:'Evaluation',anchor:'evaluation',text:'The team will test a prototype with seven volunteers during a workshop.'}]},
],'explicit-participant-fresh-v1',async()=>{});
const cases=[
 {id:'p1',q:'Compare Alder and Comet research participants.',kind:'supported',expected:['/work/alder#research','/work/comet#evaluation']},
 {id:'p2',q:'Compare Alder and Comet participants.',kind:'supported',expected:['/work/alder#research','/work/comet#evaluation']},
 {id:'n1',q:'Compare Alder and Comet participant names.',kind:'unknown-names'},
 {id:'n2',q:'Compare Alder and Comet participants by salary.',kind:'unknown-salary'},
 {id:'n3',q:'Compare Alder and Comet participants in a submarine.',kind:'unknown-subject'},
 {id:'n4',q:'Compare Alder and Ridge participants.',kind:'one-sided'},
 {id:'n5',q:'Compare Cove and Mist participants.',kind:'negated-planned'},
 {id:'n6',q:'Compare Alder and Comet child participants.',kind:'unknown-age'},
 {id:'n7',q:'Compare Alder and Comet participants from Mars.',kind:'unknown-place'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'en',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'en');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
