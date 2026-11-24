import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before first run. Fictional same-reviewer sources. No model calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/atlas',title:'Atlas',language:'en',kind:'case-study',projectId:'atlas'},sections:[{title:'Field trial',anchor:'field',text:'Seven commuters tested the route display during an interview session at a railway station.'}]},
 {access:'public',format:'rendered',page:{url:'/work/harbor',title:'Harbor',language:'en',kind:'case-study',projectId:'harbor'},sections:[{title:'Field trial',anchor:'field',text:'Three gardeners tested a planting guide during a workshop at the community garden.'}]},
 {access:'public',format:'rendered',page:{url:'/work/echo',title:'Echo',language:'en',kind:'case-study',projectId:'echo'},sections:[{title:'Trial',anchor:'trial',text:'Researchers plan to test a prototype with six visitors during a workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/grove',title:'Grove',language:'en',kind:'case-study',projectId:'grove'},sections:[{title:'Trial',anchor:'trial',text:'The team will test the prototype with nine patients during an interview session.'}]},
 {access:'public',format:'rendered',page:{url:'/work/moss',title:'Moss',language:'en',kind:'case-study',projectId:'moss'},sections:[{title:'Trial',anchor:'trial',text:'The team tested a prototype and later attended an unrelated workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/wave',title:'Wave',language:'en',kind:'case-study',projectId:'wave'},sections:[{title:'Trial',anchor:'trial',text:'The team tested the display and observed a separate interview session.'}]},
 {access:'public',format:'rendered',page:{url:'/work/river',title:'River',language:'en',kind:'case-study',projectId:'river'},sections:[{title:'Trial',anchor:'trial',text:'The team did not test the exhibit with eight visitors during a workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/leaf',title:'Leaf',language:'en',kind:'case-study',projectId:'leaf'},sections:[{title:'Trial',anchor:'trial',text:'Researchers never tested the guide with five staff during an interview session.'}]},
],'participant-method-confirmation-v1',async()=>{});

const {retrieveEvidence,comparisonTopicMatcher}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/retrieval.ts')).href);
for(const q of ['両方のプロジェクトは何人で検証されましたか？','両方のプロジェクトの検証に参加した人は何人ですか？']){for(const search of [q,q.replace(/検証/gu,'テスト'),'How many people tested the prototype?','participants tested prototype research']){const r=await retrieveEvidence(corpus,[{role:'user',content:search}],{ownerName:'Example'},undefined,['atlas','harbor']); console.log(JSON.stringify({q,search,match:corpus.chunks.filter(c=>['atlas','harbor'].includes(c.projectId)).map(c=>({url:c.sourceUrl,topic:comparisonTopicMatcher(q).matches(c.content),score:r.scores.get(c.chunkId)})),candidates:r.candidates.map(c=>c.sourceUrl),qualified:r.qualifiedMatches.map(c=>c.sourceUrl)}));}}
