import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before execution, after the clarification-continuation change.
// Same-reviewer fictional sources; no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/reed',title:'Reed',language:'en',kind:'case-study',projectId:'reed'},sections:[{title:'Field study',anchor:'study',text:'The test methods for Reed included sessions with librarians.'}]},
 {access:'public',format:'rendered',page:{url:'/work/vale',title:'Vale',language:'en',kind:'case-study',projectId:'vale'},sections:[{title:'Field study',anchor:'study',text:'The test methods for Vale included sessions with gardeners.'}]},
 {access:'public',format:'rendered',page:{url:'/work/marsh',title:'Marsh',language:'en',kind:'case-study',projectId:'marsh'},sections:[{title:'Field study',anchor:'study',text:'The test methods for Marsh included sessions with musicians.'}]},
],'clarification-continuation-holdout-v1',async()=>{});
const prompts={en:'What would you like to compare about the projects?',zh:'你想比较这些项目的哪方面？',ja:'これらのプロジェクトの何を比較しますか？'};
const cases=[
 {id:'p1',language:'en',vague:'And both of them?',topic:'Test methods',kind:'supported'},
 {id:'p2',language:'zh',vague:'那两个项目呢？',topic:'测试方法',kind:'supported'},
 {id:'p3',language:'ja',vague:'それぞれのプロジェクトは？',topic:'テスト方法',kind:'supported'},
 {id:'n1',language:'en',vague:'And both of them?',topic:'Participant names',kind:'unsupported'},
 {id:'n2',language:'zh',vague:'那两个项目呢？',topic:'测试费用',kind:'unsupported'},
 {id:'n3',language:'ja',vague:'それぞれのプロジェクトは？',topic:'参加者の名前',kind:'unsupported'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:'Compare Reed and Vale'},{role:'assistant',content:'They are different projects.'},{role:'user',content:item.vague},{role:'assistant',content:prompts[item.language]},{role:'user',content:item.topic}];const started=performance.now();const prepared=await prepareAnswer({corpus,messages,language:item.language,config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,item.language);rows.push({...item,projects:prepared.pack.projects,evidence:prepared.pack.entries.map(e=>e.chunk.sourceUrl),needsGeneration:prepared.answer===null,clarification:prepared.answer?.clarification??false,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-started});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
