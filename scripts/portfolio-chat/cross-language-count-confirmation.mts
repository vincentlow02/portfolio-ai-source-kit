import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before first execution; fictional sources, same-reviewer, no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {prepareAnswer}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/answer-engine.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
 {access:'public',format:'rendered',page:{url:'/work/willow',title:'Willow',language:'en',kind:'case-study',projectId:'willow'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Nine librarians tested the library display during a workshop in 2021.'}]},
 {access:'public',format:'rendered',page:{url:'/work/coral',title:'Coral',language:'en',kind:'case-study',projectId:'coral'},sections:[{title:'Evaluation',anchor:'evaluation',text:'Four nurses tested the paper planner during an interview session in 2020.'}]},
 {access:'public',format:'rendered',page:{url:'/work/silver',title:'Silver',language:'en',kind:'case-study',projectId:'silver'},sections:[{title:'Trial',anchor:'trial',text:'The team plans to test the system with nine librarians during a workshop.'}]},
 {access:'public',format:'rendered',page:{url:'/work/amber',title:'Amber',language:'en',kind:'case-study',projectId:'amber'},sections:[{title:'Trial',anchor:'trial',text:'Researchers will test the tool with four nurses during an interview session.'}]},
 {access:'public',format:'rendered',page:{url:'/work/delta',title:'Delta',language:'en',kind:'case-study',projectId:'delta'},sections:[{title:'Trial',anchor:'trial',text:'The team tested the system with nine user accounts.'}]},
 {access:'public',format:'rendered',page:{url:'/work/summit',title:'Summit',language:'en',kind:'case-study',projectId:'summit'},sections:[{title:'Trial',anchor:'trial',text:'The team tested the tool with four volunteer devices.'}]},
 {access:'public',format:'rendered',page:{url:'/work/stone',title:'Stone',language:'en',kind:'case-study',projectId:'stone'},sections:[{title:'Trial',anchor:'trial',text:'The team did not test the prototype with nine librarians.'}]},
 {access:'public',format:'rendered',page:{url:'/work/bramble',title:'Bramble',language:'en',kind:'case-study',projectId:'bramble'},sections:[{title:'Trial',anchor:'trial',text:'Researchers never tested the prototype with four nurses.'}]},
],'cross-language-count-confirmation-v1',async()=>{});
const cases=[
 {id:'p1',prior:'Compare Willow and Coral',q:'両方のプロジェクトは何人で検証されましたか？',kind:'supported'},
 {id:'p2',prior:'Willow と Coral を比べて',q:'両方のプロジェクトの検証に参加した人は何人ですか？',kind:'supported'},
 {id:'p3',prior:'Compare Willow and Coral',q:'それぞれのプロジェクトは何人で検証されましたか？',kind:'supported'},
 {id:'n1',prior:'Compare Silver and Amber',q:'両方のプロジェクトは何人で検証されましたか？',kind:'planned'},
 {id:'n2',prior:'Compare Delta and Summit',q:'両方のプロジェクトは何人で検証されましたか？',kind:'nonhuman-count'},
 {id:'n3',prior:'Compare Stone and Bramble',q:'両方のプロジェクトは何人で検証されましたか？',kind:'negated'},
 {id:'n4',prior:'Compare Willow and Coral',q:'両方のプロジェクトは何人で火星で検証されましたか？',kind:'unknown-place'},
 {id:'n5',prior:'Compare Willow and Coral',q:'両方のプロジェクトの潜水艦の検証に参加した人は何人ですか？',kind:'unknown-subject'},
 {id:'n6',prior:'Compare Willow and Coral',q:'両方のプロジェクトの検証参加者の名前は何ですか？',kind:'unknown-names'},
 {id:'n7',prior:'Compare Willow and Coral',q:'両方のプロジェクトの検証に参加した子供は何人ですか？',kind:'unknown-age'},
 {id:'n8',prior:'Compare Willow and Coral',q:'両方のプロジェクトの検証に参加した人の給料はいくらですか？',kind:'unknown-salary'},
 {id:'n9',prior:'Compare Willow and Coral',q:'両方のプロジェクトは何人で検証されませんでしたか？',kind:'opposite-polarity'},
];
const rows=[];
for(const item of cases){const messages=[{role:'user',content:item.prior},{role:'assistant',content:'Two different projects.'},{role:'user',content:item.q}];const start=performance.now();const result=await prepareAnswer({corpus,messages,language:'ja',config:{ownerName:'Example'}});const excerpt=await excerptReply(corpus,messages,'ja');rows.push({...item,projects:result.pack.projects,evidence:result.pack.entries.map(e=>({url:e.chunk.sourceUrl,id:e.chunk.chunkId})),needsGeneration:result.answer===null,excerptSources:excerpt.sources.map(s=>s.url),elapsedMs:performance.now()-start});}
console.log(JSON.stringify({corpusHash:corpus.contentHash,rows},null,2));
