import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before execution. Same-reviewer fictional corpus and no model calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/orchid',title:'Orchid',language:'en',kind:'case-study',projectId:'orchid'},sections:[{title:'Trial',anchor:'trial',text:'The team tested Orchid with three teachers in 2022.'}]},
 {access:'public',format:'rendered',page:{url:'/work/tern',title:'Tern',language:'en',kind:'case-study',projectId:'tern'},sections:[{title:'Trial',anchor:'trial',text:'The team tested Tern with four gardeners in 2022.'}]},
 {access:'public',format:'rendered',page:{url:'/work/birch',title:'Birch',language:'en',kind:'case-study',projectId:'birch'},sections:[{title:'Trial',anchor:'trial',text:'The team tested Birch with five musicians in 2022.'}]},
],'localized-comparison-history-v1',async()=>{});
const cases=[
 {id:'p1',language:'zh',prior:'对比 Orchid 和 Tern',q:'这两个项目如何测试？',kind:'supported'},
 {id:'p2',language:'ja',prior:'Orchid と Tern を比べて',q:'両方のプロジェクトはどうテストしましたか？',kind:'supported'},
 {id:'p3',language:'en',prior:'Compare Orchid and Tern',q:'How were both projects tested?',kind:'supported'},
 {id:'n1',language:'zh',prior:'对比 Orchid 和 Tern',q:'这两个项目的测试地点在哪里？',kind:'unsupported'},
 {id:'n2',language:'ja',prior:'Orchid と Tern を比べて',q:'両方のプロジェクトのテスト料金は？',kind:'unsupported'},
 {id:'n3',language:'en',prior:'Compare Orchid and Tern',q:'When were both projects tested in 2021?',kind:'unsupported'},
 {id:'t1',language:'zh',prior:'对比 Orchid 和 Tern',q:'那两个项目呢？',kind:'topic-ambiguous'},
 {id:'t2',language:'ja',prior:'Orchid と Tern を比べて',q:'それぞれのプロジェクトは？',kind:'topic-ambiguous'},
 {id:'a1',language:'zh',prior:'对比 Orchid 和 Tern',q:'它是怎么测试的？',kind:'singular-ambiguous'},
 {id:'a2',language:'ja',prior:'Orchid と Tern を比べて',q:'それはどうテストされましたか？',kind:'singular-ambiguous'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.prior},{role:'assistant',content:'Two distinct projects.'},{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,item.language);rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:result.answer===null,clarification:result.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),excerptAnswer:excerpt.answer,elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
