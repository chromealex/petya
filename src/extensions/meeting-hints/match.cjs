// «Подсказки на встрече»: what in the last minute of talk matches what Petya already knows — a decision of an earlier
// meeting, a promise from a summary, a glossary term. Pure functions over plain data (tested with stubs):
// `knowledge` is {decisions:[{text,at,title,sessionId}], promises:[{who,what,due,at,title,sessionId}],
// terms:[{term,synonyms,definition,project}]}. Keyword matching by word stems is the fallback; when the semantic
// index (the `search` hook, see docs/apps/meeting-hints.md) answers, its decision matches come first.
const STOP=new Set(('это этот эта эти тот как так что чтобы если или для при без над под про после перед через между когда где куда '+
 'там тут здесь уже еще ещё вот вам нам они она оно его ее её их мне меня тебя тебе себя всё все всех весь вся было был была были будет '+
 'будем будут быть есть нет даже очень надо нужно можно может могу давай давайте давайте тогда сейчас потом просто вообще значит '+
 'короче типа ладно хорошо окей кстати вопрос вопросы решили решение решения решаем задача задачи встреча встречи встрече '+
 'сделать сделаем делаем говорю говорит сказал сказала понял поняла думаю кажется наверное либо также тоже который которая которые '+
 'один одна два три раз день неделю недели сегодня завтра вчера чем кто нибудь чего чему своих свой своя наш наша наши ваш ваша '+
 'the and for with that this from have will about').split(/\s+/));
const ENDING=/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ешь|ете|ишь|ите|ться|тся|ые|ие|ая|яя|ое|ее|ую|юю|ой|ей|ий|ый|ом|ем|ах|ях|ам|ям|ов|ев|ет|ит|ут|ют|ат|ят|ть|а|я|о|е|и|ы|у|ю|ь|й)$/u;
const lower=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
function stem(word){const w=lower(word);if(w.length<=4)return w;const s=w.replace(ENDING,'');return (s.length>=4?s:w.slice(0,4)).slice(0,5);}
// Significant stems of a text: words of three letters or more that are not filler.
function stems(text){return new Set((lower(text).match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!STOP.has(w)).map(stem).filter(s=>s.length>=3));}
// How much of `item` the talk covers: shared stems, and their share of the item's stems.
function overlap(itemStems,talk){let shared=0;for(const s of itemStems)if(talk.has(s))shared++;return {shared,ratio:itemStems.size?shared/itemStems.size:0};}
// Two shared stems covering half of the item, or three covering a third: one common word is never enough.
const covers=o=>o.shared>=3&&o.ratio>=0.34||o.shared>=2&&o.ratio>=0.5;
// Case endings of a Russian noun after its stem: «мана» → «маны», «ману», «маной», never «манера».
const FORMS='(?:а|я|ы|и|у|ю|е|о|ь|й|ой|ей|ом|ем|ам|ям|ах|ях|ами|ями|ов|ев|ью)?';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// A term as a whole word in any Russian form: «мана», «маны», «ману».
function termPattern(term){
 const t=lower(term).trim();if(t.length<2)return null;
 const words=t.split(/\s+/).map(w=>/^[\p{Script=Cyrillic}]{3,}$/u.test(w)?escape(w.replace(/[аяоеиыуюьй]$/u,''))+FORMS:escape(w));
 return new RegExp('(?:^|[^\\p{L}\\p{N}])'+words.join('\\s+')+'(?=$|[^\\p{L}\\p{N}])','iu');
}
// Who a promise belongs to, against the meeting's attendees: the user («Я»), someone taking part, or nobody here.
const own=who=>/^(?:я|мне|меня|мной)$/iu.test(String(who||'').trim());
function present(who,attendees){const name=lower(who).split(/\s+/)[0];return !!name&&name.length>=2&&(attendees||[]).some(a=>lower(a).split(/[\s@.]+/).includes(name));}

// The candidate hints for `talk` (the last finals joined), best first. `seen` holds the keys already shown in this
// meeting, `muted` the kinds the user turned off, `meetingId` excludes what this meeting itself produced.
function candidates(talk,knowledge,{seen=new Set(),muted=new Set(),meetingId='',attendees=[],semantic=[]}={}){
 const text=String(talk||'');if(!text.trim())return [];
 const words=stems(text),out=[];
 const fresh=(kind,key)=>!muted.has(kind)&&!seen.has(kind+':'+key);
 if(!muted.has('decision')){
  for(const r of semantic||[])if(r&&r.text&&Number(r.score)>=0.78&&r.sessionId!==meetingId&&fresh('decision',lower(r.text)))
   out.push({kind:'decision',key:'decision:'+lower(r.text),text:String(r.text).slice(0,300),at:Number(r.at)||0,cite:String(r.title||'').slice(0,160),score:1+Number(r.score),by:'semantic'});
  for(const d of knowledge?.decisions||[]){
   if(!d?.text||d.sessionId===meetingId||!fresh('decision',lower(d.text)))continue;
   const ds=stems(d.text),o=overlap(ds,words);
   if(covers(o))out.push({kind:'decision',key:'decision:'+lower(d.text),text:String(d.text).slice(0,300),at:Number(d.at)||0,cite:String(d.title||'').slice(0,160),score:o.ratio+o.shared/10,by:'keywords'});
  }
 }
 if(!muted.has('promise'))for(const p of knowledge?.promises||[]){
  if(!p?.what||p.sessionId===meetingId||!fresh('promise',lower(p.who+':'+p.what)))continue;
  const mine=own(p.who);if(!mine&&!present(p.who,attendees))continue;
  const ps=stems(p.what),o=overlap(ps,words);
  if(covers(o))out.push({kind:'promise',key:'promise:'+lower(p.who+':'+p.what),who:mine?'':String(p.who).slice(0,60),text:String(p.what).slice(0,300),due:String(p.due||'').slice(0,40),at:Number(p.at)||0,cite:String(p.title||'').slice(0,160),score:0.9*o.ratio+o.shared/10});
 }
 if(!muted.has('term'))for(const t of knowledge?.terms||[]){
  if(!t?.term||!t.definition||!fresh('term',lower(t.term)))continue;
  const hit=[t.term,...(t.synonyms||[])].some(w=>termPattern(w)?.test(text));
  if(hit)out.push({kind:'term',key:'term:'+lower(t.term),term:String(t.term).slice(0,60),text:String(t.definition).slice(0,300),at:0,cite:String(t.project||'').slice(0,80),score:0.5});
 }
 const rank={decision:3,promise:2,term:1};
 return out.sort((a,b)=>rank[b.kind]-rank[a.kind]||b.score-a.score);
}

// At most one hint per `interval` (30 s by default): `ready(now)` says whether a hint may be shown now.
class RateLimit{
 constructor(interval=30000){this.interval=interval;this.last=-Infinity;}
 ready(now){return now-this.last>=this.interval;}
 take(now){if(!this.ready(now))return false;this.last=now;return true;}
 reset(){this.last=-Infinity;}
}
module.exports={stems,stem,overlap,termPattern,candidates,RateLimit,own,present};
