import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.PORTFOLIO_EVAL_ROOT??process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {buildB2Pack}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/b2.ts')).href);
const {retrieveEvidence}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/retrieval.ts')).href);
const {excerptReply}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/source-reply.ts')).href);
const corpus=await buildKnowledgeCorpus([
{access:'public',format:'rendered',page:{url:'/work/lantern',title:'Lantern',language:'en',projectId:'lantern',kind:'case-study'},sections:[{title:'Research',anchor:'research',text:'The Lantern team tested tactile signs at six libraries.'}]},
{access:'public',format:'rendered',page:{url:'/work/spruce',title:'Spruce',language:'en',projectId:'spruce',kind:'case-study'},sections:[{title:'Research',anchor:'research',text:'The Spruce team tested paper maps with five volunteers.'}]},
{access:'public',format:'rendered',page:{url:'/work/haven',title:'Haven',language:'en',projectId:'haven',kind:'case-study'},sections:[{title:'Discovery',anchor:'discovery',text:'Six transit workers described accessibility barriers during interviews at a railway station.'}]},
{access:'public',format:'rendered',page:{url:'/work/vale',title:'Vale',language:'en',projectId:'vale',kind:'case-study'},sections:[{title:'Trial',anchor:'trial',text:'Four teachers tested paper lesson cards during a workshop at a community centre.'}]},
],'hosted',async()=>{});
const messages=[{role:'user',content:'Compare Lantern and Spruce'},{role:'assistant',content:'They are different projects.'},{role:'user',content:'What about both projects?'},{role:'assistant',content:'What would you like to compare about the projects?'},{role:'user',content:'Testing'}];
for(const q of ['Testing','Testing project research','Testing study']){const r=await retrieveEvidence(corpus,[{role:'user',content:q}],{ownerName:'Example'},undefined,['lantern','spruce']);console.log(JSON.stringify({q,qualified:r.qualifiedMatches.map(c=>c.sourceUrl),scores:[...r.scores]}));}
const pack=await buildB2Pack(corpus,messages,null,'en',undefined,undefined,undefined,true);const reply=await excerptReply(corpus,messages,'en');console.log(JSON.stringify({projects:pack.projects,entries:pack.entries.map(e=>e.chunk.sourceUrl),reply},null,2));
