import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before execution. Same-reviewer fictional corpus; no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/vera',title:'Vera',language:'en',kind:'case-study',projectId:'vera'},sections:[{title:'Trial',anchor:'trial',text:'Six visitors tested a tactile prototype during an interview session.'}]},
 {access:'public',format:'rendered',page:{url:'/work/pine',title:'Pine',language:'en',kind:'case-study',projectId:'pine'},sections:[{title:'Trial',anchor:'trial',text:'Four gallery staff tested an audio-guide prototype during a workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/moor',title:'Moor',language:'en',kind:'case-study',projectId:'moor'},sections:[{title:'Trial',anchor:'trial',text:'Researchers tested nine sensors in 2020.'}]},
 {access:'public',format:'rendered',page:{url:'/work/dale',title:'Dale',language:'en',kind:'case-study',projectId:'dale'},sections:[{title:'Trial',anchor:'trial',text:'Five clinicians designed a prototype that tested seven devices.'}]},
 {access:'public',format:'rendered',page:{url:'/work/quay',title:'Quay',language:'en',kind:'case-study',projectId:'quay'},sections:[{title:'Trial',anchor:'trial',text:'The team did not test a prototype with eight volunteers.'}]},
 {access:'public',format:'rendered',page:{url:'/work/lumen',title:'Lumen',language:'en',kind:'case-study',projectId:'lumen'},sections:[{title:'Trial',anchor:'trial',text:'Researchers never tested a prototype with six visitors.'}]},
],'participant-method-fresh-v1',async()=>{});
const cases=[
 {id:'p1',prior:'Vera と Pine を比べて',q:'それぞれのプロジェクトは何人で検証されましたか？',kind:'supported'},
 {id:'p2',prior:'Compare Vera and Pine',q:'それぞれのプロジェクトはどんな方法で検証されたのですか？',kind:'supported'},
 {id:'p3',prior:'Compare Vera and Pine',q:'両方のプロジェクトの検証に参加した人は何人ですか？',kind:'supported'},
 {id:'n1',prior:'Compare Moor and Dale',q:'両方のプロジェクトは何人で検証されましたか？',kind:'unsupported'},
 {id:'n2',prior:'Compare Quay and Lumen',q:'両方のプロジェクトは何人で検証されましたか？',kind:'contradicted-assertion'},
 {id:'n3',prior:'Compare Vera and Pine',q:'両方のプロジェクトは何人で火星で検証されましたか？',kind:'unsupported'},
 {id:'n4',prior:'Compare Vera and Pine',q:'両方のプロジェクトの検証費用はいくらですか？',kind:'unsupported'},
 {id:'n5',prior:'Compare Vera and Pine',q:'両方のプロジェクトの検証参加者の名前は？',kind:'unsupported'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.prior},{role:'assistant',content:'Two distinct projects.'},{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'ja',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'ja');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,clarification:result.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
