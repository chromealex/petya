// «Счётчик слов»: the smallest complete external extension (docs/extensions.md). A chat turn that is clearly
// for it («посчитай слова: …») is answered with a card; everything else returns null so Petya answers.
// `require('../app-kit.cjs')` resolves to Petya's shared helpers both here and in src/extensions/<id>/.
const kit=require('../app-kit.cjs');
const ID='word-count',BY='Счётчик слов';
const ASK=/^(?:посчитай|сосчитай|сколько)\s+слов(?:а)?(?:\s+в\s+(?:этом\s+)?тексте)?\s*[:—-]\s*/iu;

// Words and their counts, most frequent first: [{word, count}].
function count(text){
 const words=String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)||[];
 const counts=new Map();for(const w of words)counts.set(w,(counts.get(w)||0)+1);
 return {total:words.length,unique:counts.size,top:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([word,count])=>({word,count}))};
}
async function turn(s,command){
 const text=String(command||'');
 const match=ASK.exec(text.trim());
 if(!match||!kit.installed(s,ID))return null;
 const body=text.trim().slice(match[0].length);
 if(!body.trim())return kit.reply(s,command,{by:BY,question:true,text:'Пришлите текст после двоеточия: «Посчитай слова: …».'});
 const result=count(body);
 return kit.reply(s,command,{by:BY,text:'Слов: '+result.total+', разных: '+result.unique+'.',data:{wordCard:result}});
}
let timer=null;
module.exports={name:'wordCount',defaults:{['extension_'+ID]:'false'},validate(){},
 setup(){timer=null;return {};},
 turn,count,
 // Called when the extension is removed or reloaded: stop everything setup started.
 teardown(){clearInterval(timer);timer=null;}};
