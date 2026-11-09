// A Google Doc as numbered passages for answering questions about it: paragraphs and list items with their heading
// trail, tables as rows. Retrieval is code (Russian word stems, heading words count too); the model answers from the
// passages it is given and must quote them word for word — `verify` keeps only quotes that are really in the text.
const norm=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[«»"“”„'’`]/g,'"').replace(/[‐-―]/g,'-').replace(/\s+/g,' ').trim();
const STOP=new Set('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это документ документе документа документу сказано написано говорится какие какая каков какое ли там'.split(' '));
const words=t=>norm(t).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>1&&!STOP.has(w));
// A crude Russian stem: the word without its ending, at least 4 letters (enough for prefix matching).
const ENDING=/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ия|ие|ий|ой|ей|ый|ая|ое|ые|ую|юю|ам|ям|ах|ях|ом|ем|ов|ев|ет|ит|ут|ют|ат|ят|ть|ся|ы|и|а|я|о|е|у|ю|ь)$/u;
const stem=w=>{if(w.length<=4)return w;const s=w.replace(ENDING,'');return s.length>=4?s:w.slice(0,4);};

// docText(...) blocks → [{n, text, path, kind}] (numbered from 1). Long paragraphs stay whole; tables become one
// passage per row «Столбец: значение; …» (first row taken as the header when the table has more than one row).
function passages(doc,{max=600}={}){
 const out=[];
 for(const b of doc.blocks||[]){
  if(out.length>=max)break;
  if(b.type==='heading')continue;
  if(b.type==='table'){
   const [head,...rows]=b.rows;
   if(!rows.length){out.push({text:head.filter(Boolean).join(' | '),path:b.path,kind:'table'});continue;}
   for(const r of rows){if(out.length>=max)break;const t=r.map((v,i)=>v?(head[i]?head[i]+': ':'')+v:'').filter(Boolean).join('; ');if(t)out.push({text:t,path:b.path,kind:'table'});}
   continue;
  }
  out.push({text:b.text,path:b.path,kind:b.type});
 }
 return out.map((p,i)=>({n:i+1,...p}));
}
// The passages that fit a question best: shared stems in the text (and half for heading words), ties by order.
function relevant(list,question,{k=14,around=1}={}){
 const q=[...new Set(words(question).map(stem))];
 if(!q.length)return {picked:list.slice(0,k),score:new Map(),terms:q};
 const score=new Map();
 for(const p of list){
  const own=new Set(words(p.text).map(stem)),head=new Set(words(p.path).map(stem));
  let sc=0;for(const t of q){if([...own].some(w=>w.startsWith(t)||t.startsWith(w)&&w.length>=4))sc+=1;else if([...head].some(w=>w.startsWith(t)))sc+=0.5;}
  if(sc>0)score.set(p.n,sc/q.length);
 }
 const top=[...score.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,k).map(([n])=>n);
 // Neighbours give the model the sentence before and after.
 const keep=new Set();for(const n of top)for(let d=-around;d<=around;d++)if(n+d>=1&&n+d<=list.length)keep.add(n+d);
 return {picked:list.filter(p=>keep.has(p.n)).slice(0,k*2),score,terms:q};
}
// Quotes from the model → only those really in the document. A quote may name the wrong passage: it is searched in
// all passages; it may be shortened with «…»: every part must be in the same passage, in order. Returns the
// passage's exact wording around the quote.
function verify(list,quotes){
 const out=[],seen=new Set();
 for(const q of Array.isArray(quotes)?quotes:[]){
  const text=String(q?.text||q||'').trim();if(text.length<4)continue;
  const parts=norm(text).replace(/^"+|"+$/g,'').split(/\s*(?:\.\.\.|…)\s*/).map(s=>s.trim()).filter(s=>s.length>=3);
  if(!parts.length)continue;
  const order=[...list].sort((a,b)=>(a.n===Number(q?.n)?-1:0)-(b.n===Number(q?.n)?-1:0));
  for(const p of order){
   const hay=norm(p.text);let at=0,ok=true;
   for(const part of parts){const i=hay.indexOf(part,at);if(i<0){ok=false;break;}at=i+part.length;}
   if(!ok)continue;
   if(!seen.has(p.n)){seen.add(p.n);out.push({n:p.n,text:exact(p.text,parts),path:p.path});}
   break;
  }
 }
 return out;
}
// The passage's own wording for the quoted span (whole passage when short).
function exact(text,parts){
 const t=String(text);if(t.length<=320)return t;
 const n=norm(t),start=n.indexOf(parts[0]),last=parts.at(-1),end=n.indexOf(last,start)+last.length;
 if(start<0||end<start)return t.slice(0,320)+'…';
 // norm() only collapses spaces and swaps quote marks, so positions shift by the collapsed spaces; widen to word bounds.
 const ratio=t.length/n.length,from=Math.max(0,Math.floor(start*ratio)-40),to=Math.min(t.length,Math.ceil(end*ratio)+40);
 return (from>0?'…':'')+t.slice(from,to).trim()+(to<t.length?'…':'');
}
module.exports={passages,relevant,verify,words,stem,norm};
