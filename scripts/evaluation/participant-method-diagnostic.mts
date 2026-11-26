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

const {retrieveEvidence,comparisonTopicMatcher}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/retrieval.ts')).href);
const qs=['それぞれのプロジェクトは何人で検証されましたか？','それぞれのプロジェクトはどんな方法で検証されたのですか？','両方のプロジェクトの検証に参加した人は何人ですか？'];
for(const q of qs){for(const search of [q,q.replace(/検証/gu,'テスト')]){const r=await retrieveEvidence(corpus,[{role:'user',content:search}],{ownerName:'Example'},undefined,['vera','pine']); console.log(JSON.stringify({q,search,match:corpus.chunks.filter(c=>['pine','vera'].includes(c.projectId)).map(c=>({url:c.sourceUrl,topic:comparisonTopicMatcher(q).matches(c.content),score:r.scores.get(c.chunkId)})),qualified:r.qualifiedMatches.map(c=>c.sourceUrl),candidates:r.candidates.map(c=>c.sourceUrl),segments:[...new Intl.Segmenter('ja',{granularity:'word'}).segment(q)].filter(x=>x.isWordLike).map(x=>x.segment)}));}}
