import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Diagnostic created after examining the holdout; not blind. No provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/orion',title:'Orion',language:'en',kind:'case-study',projectId:'orion'},sections:[{title:'Trial',anchor:'trial',text:'The team tested an accessible display with six museum staff in 2023.'},{title:'Outcome',anchor:'outcome',text:'Visitors can adjust the type size on the display.'}]},
 {access:'public',format:'rendered',page:{url:'/work/beacon',title:'Beacon',language:'en',kind:'case-study',projectId:'beacon'},sections:[{title:'Trial',anchor:'trial',text:'Researchers tested an audio guide with seven commuters in 2023.'},{title:'Outcome',anchor:'outcome',text:'The guide groups recordings into short chapters.'}]},
 {access:'public',format:'rendered',page:{url:'/work/dune',title:'Dune',language:'en',kind:'case-study',projectId:'dune'},sections:[{title:'Trial',anchor:'trial',text:'The team tested an unrelated school journal with teachers.'}]},
],'japanese-verification-holdout-v1',async()=>{});
const {retrieveEvidence,comparisonTopicMatcher}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/retrieval.ts')).href);
for(const q of ['両方のプロジェクトはどう検証されましたか？','両方のプロジェクトはどのような方法で検証されましたか？','両方のプロジェクトは何人で検証されましたか？']){const r=await retrieveEvidence(corpus,[{role:'user',content:q.replace(/検証/gu,'テスト')}],{ownerName:'Example'},undefined,['orion','beacon']);console.log(JSON.stringify({q,qualified:r.qualifiedMatches.map(c=>({url:c.sourceUrl,score:r.scores.get(c.chunkId),topic:comparisonTopicMatcher(q).matches(c.content)})),candidates:r.candidates.map(c=>({url:c.sourceUrl,topic:comparisonTopicMatcher(q).matches(c.content)}))}));}
