import { embedTexts } from "../../lib/portfolio-chat/embeddings";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { retrieveEvidence } from "../../lib/portfolio-chat/retrieval";
// Development-only diagnostic, not a holdout and not an end-to-end retriever.
const passage="Workshop kit\nThe kit contains removable panels that educators can rearrange to create different lesson plans.";
const cases:[string,"supported"|"unsupported"][]=[
 ["Loom のパネルを別の順序にできますか？","supported"],
 ["Loom の授業キットは組み替え可能ですか？","supported"],
 ["Loom のキットは授業準備にどう役立ちますか？","supported"],
 ["Loom の部材は自由に配置を変えられますか？","supported"],
 ["Loom では構成要素を自分で動かせますか？","supported"],
 ["Loom では先生が学習活動を組み立て直せますか？","supported"],
 ["Loom の部品を別の構成に並べ替えられますか？","supported"],
 ["Loom のツールは教師が組み合わせを変更できますか？","supported"],
 ["Loom のパネルは金属ですか？","unsupported"],
 ["Loom の教材は何年に発売されましたか？","unsupported"],
 ["Loom の部材は何色ですか？","unsupported"],
 ["Loom は小学生によってテストされましたか？","unsupported"],
 ["Loom の設計者はどこの大学を卒業しましたか？","unsupported"],
 ["Loom はオンラインで販売されていますか？","unsupported"],
 ["Loom の教材は故障しやすいですか？","unsupported"],
 ["Loom の授業キットはいつから使われていますか？","unsupported"],
 ["Loom には何枚のパネルが入っていますか？","unsupported"],
 ["Loom の授業は何分かかりますか？","unsupported"],
 ["Loom のパネルは洗濯機で洗えますか？","unsupported"],
 ["Loom のパネルは水に溶けますか？","unsupported"],
 ["Loom の教材はどこで作られましたか？","unsupported"],
 ["Loom のパネルを積み重ねると何センチですか？","unsupported"],
 ["Loom の教材は何歳から使えますか？","unsupported"],
 ["Loom の部品を毎月取り替える必要がありますか？","unsupported"],
 ["Loom の教材は音を出せますか？","unsupported"],
 ["Loom の授業キットは屋外で使えますか？","unsupported"],
 ["Loom は計画を自動的に印刷できますか？","unsupported"],
 ["Loom の授業計画は英語と日本語に対応しますか？","unsupported"],
];
const inputs=cases.flatMap(([question])=>[question,question.replace(/^Loom\s*/u,"")]);
const corpus=await buildKnowledgeCorpus([{access:"public",format:"rendered",page:{url:"/work/loom",title:"Loom",language:"en",kind:"case-study",projectId:"loom"},sections:[{title:"Workshop kit",anchor:"kit",text:"The kit contains removable panels that educators can rearrange to create different lesson plans."}]}],"scope-development",async()=>{});
// Mirror production's single-query encoder call; the source is the only
// passage in this fixture. Embedding all texts in one padded batch can yield
// different quantized outputs and is not equivalent to the request path.
const [sourceVector]=await embedTexts([passage]);
const dot=(a:number[],b:number[])=>a.reduce((total,x,i)=>total+x*b[i],0);
const rows=[];
for (const [i,[question,label]] of cases.entries()) {
  const [named]=await embedTexts([question]);
  const [withoutName]=await embedTexts([inputs[i*2+1]]);
  // This one-project fixture preserves the intended scope for the stripped
  // version; a production fallback would need an explicit trusted scope.
  const namedResult=await retrieveEvidence(corpus,[{role:"user",content:question}],{ownerName:"Example"});
  const strippedResult=await retrieveEvidence(corpus,[{role:"user",content:inputs[i*2+1]}],{ownerName:"Example"});
  rows.push({question,label,withoutName:inputs[i*2+1],namedCosine:dot(sourceVector,named),withoutNameCosine:dot(sourceVector,withoutName),namedQualified:namedResult.chunks.map(c=>c.sourceUrl),withoutNameQualified:strippedResult.chunks.map(c=>c.sourceUrl)});
}
console.log(JSON.stringify({passage,scope:"development-only one-project retrieval diagnostic; assembly and multiple-project scoping are not measured",corpusHash:corpus.contentHash,rows},null,2));
