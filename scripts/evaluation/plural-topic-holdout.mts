import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Newly authored after the first set was promoted to development. Frozen
// before execution; synthetic same-reviewer sample, no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const sources=[
 {access:'public',format:'rendered',page:{url:'/work/harbor',title:'Harbor',language:'en',kind:'case-study',projectId:'harbor'},sections:[{title:'Field trial',anchor:'trial',text:'The team tested the Harbor navigation prototype with cyclists in 2023.'},{title:'Purpose',anchor:'purpose',text:'The concept helps people plan safer bicycle routes.'}]},
 {access:'public',format:'rendered',page:{url:'/work/meadow',title:'Meadow',language:'en',kind:'case-study',projectId:'meadow'},sections:[{title:'Field trial',anchor:'trial',text:'Researchers tested the Meadow music prototype with musicians in 2023.'},{title:'Purpose',anchor:'purpose',text:'The concept helps people organise their music practice.'}]},
 {access:'public',format:'rendered',page:{url:'/work/cove',title:'Cove',language:'en',kind:'case-study',projectId:'cove'},sections:[{title:'Field trial',anchor:'trial',text:'The team tested a separate gardening journal with teachers.'}]},
];
const cases=[{'id': 'p1', 'q': 'How did both projects test?', 'language': 'en', 'kind': 'supported'}, {'id': 'p2', 'q': '两个项目怎么测试？', 'language': 'zh', 'kind': 'supported'}, {'id': 'p3', 'q': 'それぞれのプロジェクトはどう検証されましたか？', 'language': 'ja', 'kind': 'supported'}, {'id': 'n1', 'q': 'Where did both projects test?', 'language': 'en', 'kind': 'unsupported'}, {'id': 'n2', 'q': 'When were both projects tested in 2021?', 'language': 'en', 'kind': 'unsupported'}, {'id': 'n3', 'q': '両方のプロジェクトのテスト料金は？', 'language': 'ja', 'kind': 'unsupported'}, {'id': 't1', 'q': 'And both of them?', 'language': 'en', 'kind': 'topic-ambiguous'}, {'id': 't2', 'q': '那两个项目呢？', 'language': 'zh', 'kind': 'topic-ambiguous'}, {'id': 't3', 'q': 'それぞれのプロジェクトは？', 'language': 'ja', 'kind': 'topic-ambiguous'}, {'id': 'a1', 'q': 'How was it tested?', 'language': 'en', 'kind': 'singular-ambiguous'}, {'id': 'a2', 'q': '它是怎么测试的？', 'language': 'zh', 'kind': 'singular-ambiguous'}, {'id': 'a3', 'q': 'それはどうテストされましたか？', 'language': 'ja', 'kind': 'singular-ambiguous'}];
const corpus=await buildKnowledgeCorpus(sources,'plural-topic-holdout-v1',async()=>{});const rows=[];
for(const item of cases){const messages=[{role:'user',content:'Compare Harbor and Meadow'},{role:'assistant',content:'These are two distinct projects.'},{role:'user',content:item.q}];const started=performance.now();const prepared=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,item.language);rows.push({...item,projects:prepared.pack.projects,evidence:prepared.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:prepared.answer===null,clarification:prepared.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),excerptAnswer:excerpt.answer,elapsedMs:performance.now()-started});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
