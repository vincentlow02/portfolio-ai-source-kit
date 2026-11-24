import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Diagnostic follow-up using the already observed confirmation corpus.
// These cases are not an independent holdout or a population estimate.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const sources=[
 {access:'public',format:'rendered',page:{url:'/work/harbor',title:'Harbor',language:'en',kind:'case-study',projectId:'harbor'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Seven librarians tried the wayfinding prototype and noted where the signage confused them.'},{title:'Accessibility',anchor:'accessibility',text:'Large type and tactile buttons help visitors operate the kiosk.'}]},
 {access:'public',format:'rendered',page:{url:'/work/orchard',title:'Orchard',language:'en',kind:'case-study',projectId:'orchard'},sections:[{title:'Discovery',anchor:'discovery',text:'The team interviewed four community gardeners about sharing tools.'},{title:'Accessibility',anchor:'accessibility',text:'The instructions use large type and strong colour contrast.'}]},
 {access:'public',format:'rendered',page:{url:'/work/grove',title:'Grove',language:'en',kind:'case-study',projectId:'grove'},sections:[{title:'Storage',anchor:'storage',text:'Audio files remain on the device and work without internet access.'},{title:'Construction',anchor:'construction',text:'The team made the enclosure from cardboard and plywood.'}]},
 {access:'public',format:'rendered',page:{url:'/work/lantern',title:'Lantern',language:'en',kind:'case-study',projectId:'lantern'},sections:[{title:'Storage',anchor:'storage',text:'The application saves the recorded stories locally for offline playback.'},{title:'Construction',anchor:'construction',text:'The early model used recycled cardboard and wooden panels.'}]},
];
const cases=[
 {id:'x1',q:'Compare Harbor and Orchard research questions.',expected:[],kind:'unsupported'},
 {id:'x2',q:'Compare Grove and Lantern audio storage costs.',expected:[],kind:'unsupported'},
 {id:'x3',q:'Compare Harbor and Orchard research participant ages.',expected:[],kind:'unsupported'},
 {id:'x4',q:'Compare Grove and Lantern ecological impacts.',expected:[],kind:'unsupported'},
 {id:'x5',q:'Compare Harbor and Orchard research findings.',expected:[],kind:'unsupported'},
];
const corpus=await buildKnowledgeCorpus(sources,'comparison-confirmation-v1',async()=>{});
const rows=[];
for(const item of cases){const start=performance.now();const result=await prepareAnswer({corpus,messages:[{role:'user',content:item.q}],language:'en',config:{ownerName:'Example'}});rows.push({...item,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId,reason:e.reason})),needsGeneration:result.answer===null,insufficient:result.answer?.insufficient??false,clarification:result.answer?.clarification??false,preparationMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
