// Petya always speaks to the user on «ты». A small model still slips into «вы»/«ваш»/«проверьте»;
// this rewrites the second person of model answers. Quotes and code are left as they are.
const POSSESSIVE={ваш:'твой',ваша:'твоя',ваше:'твоё',ваши:'твои',вашего:'твоего',вашей:'твоей',вашему:'твоему',вашим:'твоим',ваших:'твоих',вашими:'твоими',вашу:'твою',вашем:'твоём',вас:'тебя',вам:'тебе',вами:'тобой'};
const IRREGULAR={хотите:'хочешь',можете:'можешь',будете:'будешь',даёте:'даёшь',даете:'даёшь',едите:'ешь',бежите:'бежишь'};
const NOT_VERB=new Set(['сайте','лайте','мойте','майте','чайте']);
const keepCase=(from,to)=>from[0]===from[0].toUpperCase()?to[0].toUpperCase()+to.slice(1):to;
function verb(word){
 const w=word.toLowerCase();
 if(IRREGULAR[w])return keepCase(word,IRREGULAR[w]);
 if(/[её]тесь$/u.test(w)||/итесь$/u.test(w))return word.slice(0,-4)+'шься';
 if(/[её]те$/u.test(w)&&w.length>4)return word.slice(0,-2)+'шь';
 if(/ите$/u.test(w)&&w.length>4)return word.slice(0,-2)+'шь';
 if(/лись$/u.test(w)&&w.length>5)return word.slice(0,-4)+'лся';
 if(/ли$/u.test(w)&&w.length>3)return word.slice(0,-1);
 return null;
}
function imperative(word){
 const w=word.toLowerCase();if(IRREGULAR[w])return keepCase(word,IRREGULAR[w]);if(w.length<6||NOT_VERB.has(w))return null;
 if(/(?:[ьйи])тесь$/u.test(w))return word.slice(0,-4)+'сь';
 if(/[ьй]те$/u.test(w))return word.slice(0,-2);
 if(/ите$/u.test(w))return word.slice(0,-2);
 return null;
}
function line(text){
 let out=text.replace(/(^|[^\p{L}])(ваш(?:а|е|и|его|ей|ему|им|их|ими|у|ем)?|вас|вам|вами)(?![\p{L}])/giu,(m,pre,w)=>pre+keepCase(w,POSSESSIVE[w.toLowerCase()]));
 // «вы» + verb within two words: «вы можете» → «ты можешь», «вы уже знаете» → «ты уже знаешь».
 out=out.replace(/(^|[^\p{L}])(вы)((?:\s+[\p{L}-]+){1,2})/giu,(m,pre,pronoun,rest)=>{const words=rest.split(/(\s+)/);for(let i=0;i<words.length;i++){if(!/\p{L}/u.test(words[i]))continue;const v=verb(words[i]);if(v){words[i]=v;return pre+keepCase(pronoun,'ты')+words.join('');}}return pre+keepCase(pronoun,'ты')+rest;});
 // Sentence-initial polite imperative: «Проверьте подключение» → «Проверь подключение».
 out=out.replace(/(^|[.!?:;]\s+|[—•-]\s+|\n\s*(?:\d+[.)]\s*)?)([\p{Lu}\p{Ll}][\p{L}]+)([^.!?\n]*)/gu,(m,pre,w,rest)=>{const v=imperative(w);if(!v)return m;
  // «Проверьте подключение и повторите» — the rest of the same sentence follows the first imperative.
  return pre+v+rest.replace(/(\s(?:и|или|затем|потом|а потом)\s+)([\p{L}]+)/gu,(x,join,next)=>{const n=imperative(next);return n&&!IRREGULAR[next.toLowerCase()]?join+n:x;});});
 return out;
}
function informal(text){
 if(typeof text!=='string'||!/(?:^|[^\p{L}])(?:вы|ваш|вас|вам|вами)|[ьйи]те(?:сь)?(?:[^\p{L}]|$)/iu.test(text))return text;
 // Leave code blocks, inline code and quotations untouched.
 return text.split(/(```[\s\S]*?```|`[^`]*`|«[^»]*»|"[^"]*")/u).map((part,i)=>i%2?part:line(part)).join('');
}
module.exports={informal};
