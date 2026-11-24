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
const cases=[
 {id:'p1',prior:'Atlas と Harbor を比べて',q:'両方のプロジェクトは何人で検証されましたか？',kind:'supported'},
 {id:'p2',prior:'Compare Atlas and Harbor',q:'それぞれのプロジェクトはどんな方法で検証されたのですか？',kind:'supported'},
 {id:'p3',prior:'Compare Atlas and Harbor',q:'両方のプロジェクトの検証に参加した人は何人ですか？',kind:'supported'},
 {id:'p4',prior:'Compare Atlas and Harbor',q:'それぞれのプロジェクトはどう検証されましたか？',kind:'supported'},
 {id:'n1',prior:'Compare Echo and Grove',q:'両方のプロジェクトは何人で検証されましたか？',kind:'planned-not-done'},
 {id:'n2',prior:'Compare Echo and Grove',q:'それぞれのプロジェクトはどんな方法で検証されたのですか？',kind:'planned-not-done'},
 {id:'n3',prior:'Compare Moss and Wave',q:'それぞれのプロジェクトはどんな方法で検証されたのですか？',kind:'unrelated-method'},
 {id:'n4',prior:'Compare River and Leaf',q:'両方のプロジェクトは何人で検証されましたか？',kind:'negated'},
 {id:'n5',prior:'Compare Atlas and Harbor',q:'両方のプロジェクトの火星での検証に参加した人は何人ですか？',kind:'unsupported-place'},
 {id:'n6',prior:'Compare Atlas and Harbor',q:'それぞれのプロジェクトは何円かけて検証されたのですか？',kind:'unsupported-cost'},
 {id:'n7',prior:'Compare Atlas and Harbor',q:'両方のプロジェクトの検証参加者の名前は何ですか？',kind:'unsupported-names'},
 {id:'n8',prior:'Compare Atlas and Harbor',q:'それぞれのプロジェクトは火星でどんな方法で検証されたのですか？',kind:'unsupported-place-method'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.prior},{role:'assistant',content:'Two separate projects.'},{role:'user',content:item.q}];const started=performance.now();const result=await prepareAnswer({corpus,messages,language:'ja',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'ja');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-started});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
