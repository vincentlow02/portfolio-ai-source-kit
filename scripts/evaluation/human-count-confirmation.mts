import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Frozen before evaluation; fictional cases and no provider calls.
const root=process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const {buildKnowledgeCorpus}=await import(pathToFileURL(resolve(root,'lib/knowledge/contract.ts')).href);
const {buildB2Pack,validateB2}=await import(pathToFileURL(resolve(root,'lib/portfolio-chat/b2.ts')).href);
const cases=[
 {id:'a',source:'The team tested the prototype with 4 user accounts.',claim:'The team tested the prototype with 4 users.',accept:false},
 {id:'b',source:'The team tested the prototype with 9 volunteer devices.',claim:'The team tested the prototype with 9 volunteers.',accept:false},
 {id:'c',source:'The team tested the prototype with 5 staff roles.',claim:'The team tested the prototype with 5 staff.',accept:false},
 {id:'d',source:'The team tested the prototype with 7 user profiles.',claim:'The team tested the prototype with 7 users.',accept:false},
 {id:'e',source:'The team tested the prototype with 6 visitors.',claim:'The team tested the prototype with 6 visitors.',accept:true},
 {id:'f',source:'The team tested the prototype with 8 staff members.',claim:'The team tested the prototype with 8 staff.',accept:true},
 {id:'g',source:'The team tested the prototype with 4 user accounts.',claim:'The team tested the prototype with 4 user accounts.',accept:true},
 {id:'h',source:'The team tested the prototype with 3 visitors in 2022.',claim:'The team tested the prototype with 2022 visitors in 3.',accept:false},
];
const rows=[];
for (const item of cases){const corpus=await buildKnowledgeCorpus([{access:'public',format:'rendered',page:{url:'/work/audit',title:'Audit',language:'en',kind:'case-study',projectId:'audit'},sections:[{title:'Trial',anchor:'trial',text:item.source}]}],'human-count-confirmation-v1',async()=>{});const initial=await buildB2Pack(corpus,[{role:'user',content:'Audit trial'}],null,'en',undefined,undefined,{ownerName:'Example'});const pack={...initial,projects:['audit'],entries:[{key:'E1',chunk:corpus.chunks[0],reason:'qualified-match'}]};const actual=!validateB2({language:'en',insufficient:false,claims:[{text:item.claim,evidenceKeys:['E1']}],recommendedProjectIds:[]},corpus,pack).insufficient;rows.push({...item,actual,correct:actual===item.accept});}
console.log(JSON.stringify({rows},null,2));
