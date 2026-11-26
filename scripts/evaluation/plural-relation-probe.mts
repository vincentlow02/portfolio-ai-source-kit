import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Diagnostic using an already observed corpus and an adversarial sentence.
// The case was inspected during development and is not a blind holdout.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const sources=[
 {access:'public',format:'rendered',page:{url:'/work/orbit',title:'Orbit',language:'en',kind:'case-study',projectId:'orbit'},sections:[{title:'Field trial',anchor:'trial',text:'The team tested the Orbit navigation prototype, but the venue location for an unrelated conference is not known.'},{title:'Purpose',anchor:'purpose',text:'The concept helps people plan safer bicycle routes.'}]},
 {access:'public',format:'rendered',page:{url:'/work/quartz',title:'Quartz',language:'en',kind:'case-study',projectId:'quartz'},sections:[{title:'Field trial',anchor:'trial',text:'Researchers tested the Quartz music prototype, but the venue location for an unrelated conference is not known.'},{title:'Purpose',anchor:'purpose',text:'The concept helps people organise their music practice.'}]},
 {access:'public',format:'rendered',page:{url:'/work/spruce',title:'Spruce',language:'en',kind:'case-study',projectId:'spruce'},sections:[{title:'Field trial',anchor:'trial',text:'The team tested a separate gardening journal with teachers.'}]},
];
const cases=[{id:'x1',q:'Where were both projects tested?',language:'en',kind:'unsupported'}];
const corpus=await buildKnowledgeCorpus(sources,'plural-context-fresh-confirmation-v1',async()=>{});const rows=[];
for(const item of cases){const messages=[{role:'user',content:'Compare Orbit and Quartz'},{role:'assistant',content:'These are two distinct projects.'},{role:'user',content:item.q}];const started=performance.now();const prepared=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,item.language);rows.push({...item,projects:prepared.pack.projects,evidence:prepared.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:prepared.answer===null,clarification:prepared.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),excerptAnswer:excerpt.answer,elapsedMs:performance.now()-started});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
