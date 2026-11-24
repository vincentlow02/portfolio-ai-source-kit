import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before first execution; synthetic same-reviewer data; no LLM calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/beacon',title:'Beacon',language:'en',kind:'case-study',projectId:'beacon'},sections:[{title:'Discovery',anchor:'discovery',text:'Six transit workers described accessibility barriers during interviews at a railway station.'}]},
 {access:'public',format:'rendered',page:{url:'/work/linden',title:'Linden',language:'en',kind:'case-study',projectId:'linden'},sections:[{title:'Trial',anchor:'trial',text:'Four teachers tested the paper lesson cards during a workshop at a community centre.'}]},
 {access:'public',format:'rendered',page:{url:'/work/river',title:'River',language:'en',kind:'case-study',projectId:'river'},sections:[{title:'Trial',anchor:'trial',text:'The team plans to test the prototype with eight librarians during a workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/lake',title:'Lake',language:'en',kind:'case-study',projectId:'lake'},sections:[{title:'Trial',anchor:'trial',text:'Researchers will test the guide with five nurses during interviews.'}]},
 {access:'public',format:'rendered',page:{url:'/work/castle',title:'Castle',language:'en',kind:'case-study',projectId:'castle'},sections:[{title:'Trial',anchor:'trial',text:'The team tested the prototype with eight user accounts.'}]},
 {access:'public',format:'rendered',page:{url:'/work/meadow',title:'Meadow',language:'en',kind:'case-study',projectId:'meadow'},sections:[{title:'Trial',anchor:'trial',text:'The team tested the guide with five volunteer devices.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cloud',title:'Cloud',language:'en',kind:'case-study',projectId:'cloud'},sections:[{title:'Trial',anchor:'trial',text:'The team did not test the prototype with six visitors.'}]},
 {access:'public',format:'rendered',page:{url:'/work/vale',title:'Vale',language:'en',kind:'case-study',projectId:'vale'},sections:[{title:'Trial',anchor:'trial',text:'Researchers never interviewed four teachers.'}]},
 {access:'public',format:'rendered',page:{url:'/work/sun',title:'Sun',language:'en',kind:'case-study',projectId:'sun'},sections:[{title:'Audience',anchor:'audience',text:'The studio has six designers and makes useful tools for schools.'}]},
],'single-turn-participant-confirmation-v1',async()=>{});
const cases=[
 {id:'p1',q:'Compare Beacon and Linden participants.',kind:'supported',expected:['/work/beacon#discovery','/work/linden#trial']},
 {id:'p2',q:'Compare Beacon and Linden study participants.',kind:'supported',expected:['/work/beacon#discovery','/work/linden#trial']},
 {id:'n1',q:'Compare Beacon and Linden study participant names.',kind:'unsupported-names'},
 {id:'n2',q:'Compare Beacon and Linden participants from Mars.',kind:'unsupported-place'},
 {id:'n3',q:'Compare Beacon and Linden participant salaries.',kind:'unsupported-salary'},
 {id:'n4',q:'Compare River and Lake participants.',kind:'planned'},
 {id:'n5',q:'Compare Castle and Meadow participants.',kind:'nonhuman-count'},
 {id:'n6',q:'Compare Cloud and Vale participants.',kind:'negated'},
 {id:'n7',q:'Compare Beacon and Sun participants.',kind:'one-sided'},
 {id:'n8',q:'Compare Beacon and Linden child participants.',kind:'unsupported-age'},
 {id:'n9',q:'Compare Beacon and Linden participants of submarine testing.',kind:'unsupported-subject'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'en',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'en');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
