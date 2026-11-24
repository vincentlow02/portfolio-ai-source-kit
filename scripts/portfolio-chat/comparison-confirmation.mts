import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Frozen before running either version. The examples use fictional public pages;
// this is a small same-reviewer confirmation, not a population estimate.
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
 {id:'p1',q:'Compare Harbor and Orchard study participants.',expected:['/work/harbor#evaluation','/work/orchard#discovery'],kind:'supported'},
 {id:'p2',q:'Compare the accessibility of Harbor and Orchard.',expected:['/work/harbor#accessibility','/work/orchard#accessibility'],kind:'supported'},
 {id:'p3',q:'Compare Grove and Lantern offline audio storage.',expected:['/work/grove#storage','/work/lantern#storage'],kind:'supported'},
 {id:'p4',q:'Compare Grove and Lantern prototype materials.',expected:['/work/grove#construction','/work/lantern#construction'],kind:'supported'},
 {id:'n1',q:'Compare Harbor and Orchard submarine engine fuel capacity.',expected:[],kind:'unsupported'},
 {id:'n2',q:'Compare Grove and Lantern subscription prices.',expected:[],kind:'unsupported'},
 {id:'n3',q:'Compare Harbor and Orchard annual salaries for gardeners.',expected:[],kind:'unsupported'},
 {id:'n4',q:'Compare Grove and Lantern rocket launch dates.',expected:[],kind:'unsupported'},
 {id:'a1',q:'Compare Harbor and Orchard participants.',expected:['/work/harbor#evaluation','/work/orchard#discovery'],kind:'ambiguous-topic'},
];
const corpus=await buildKnowledgeCorpus(sources,'comparison-confirmation-v1',async()=>{});
const rows=[];
for(const item of cases){const start=performance.now();const result=await prepareAnswer({corpus,messages:[{role:'user',content:item.q}],language:'en',config:{ownerName:'Example'}});rows.push({...item,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId,reason:e.reason})),needsGeneration:result.answer===null,insufficient:result.answer?.insufficient??false,clarification:result.answer?.clarification??false,preparationMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
