// Document text helpers shared by «Что изменилось в документе», «Геймдизайн-документ» and «Вики из обсуждений»
// (no I/O here):
// - words and stems, with a small Russian ↔ English dictionary of game systems («лиги» ↔ leagues, «экономика» ↔
//   economy), so «спека лиг» finds `docs/leagues.md` and a `LeagueConfig` asset finds the GDD's «Лиги»;
// - Markdown sections by headings (fences are not headings);
// - a word diff (common prefix/suffix trimmed, then LCS over word tokens) and a section-level comparison of two
//   versions, whose changed sections are the «hunks» a summary may talk about;
// - `grounded()`: whether a summary sentence describes only the hunks it cites (numbers and words must be there);
// - Confluence storage XHTML ↔ Markdown, and the sections of a storage body (to replace one section's body in place).
const md=require('../google-drive/markdown.cjs');

// --- Words ----------------------------------------------------------------------------------------------------------
// Words that never decide a match (one '|'-joined literal: a pattern, not interface text).
const STOP=new Set('про|для|как|что|это|или|при|над|под|без|его|они|мы|наш|наши|нашем|нашей|какие|какое|тот|эта|этот|эти|так|там|тут|был|были|будет|если|чтобы|после|перед|через|также|ещё|еще|уже|все|всё|всех|the|and|for|with|from|into|раздел|раздела|разделе|документ|документа|документе|спек|спека|спеку|спеке|спецификац|страниц|страница|страницу|gdd|гдд|вики|wiki|версия|версии|версией|прошлой|предыдущей|неделю|неделя|месяц|день|дня|дней|система|системы|систему|системе|опиши|обнови|добавь|вместо|теперь|кроме|между|только|очень|стали|стало|было|будут|можно|нужно|один|одна|два|три|сейчас|снова'.split('|'));
const norm=t=>String(t||'').toLowerCase().replace(/ё/g,'е');
// Words of at least three letters/digits; camelCase and snake_case split («LeagueConfig» → league, config).
function words(text){
 const t=String(text||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_\-./]+/g,' ');
 return [...new Set((norm(t).match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!STOP.has(w)&&!/^\d+$/.test(w)))];
}
// A short stem: the word without its ending (at least three letters); English plurals lose the final s.
const stem=w=>/^[a-z]+$/.test(w)?w.replace(/(?:ies)$/,'y').replace(/(?<=[a-z]{3})s$/,''):w.length<=4?w.slice(0,3):w.slice(0,Math.max(4,w.length-2));
// Game systems: a Russian stem → English words used in code and file names.
// (one '|'-joined literal «ru:en,en|…»: data, not interface text)
const TOPICS='лиг:league,division,tier|экономик:economy,currency,gold,coin,price,cost,wallet|матчмейк:matchmaking,matchmaker,mmr|юнит:unit|предмет:item|оруж:weapon|волн:wave|магазин:shop,store,offer|сундук:chest|квест:quest,mission|задани:quest,mission,task|достижен:achievement|наград:reward|инвентар:inventory|крафт:craft,recipe|клан:clan,guild|гильди:guild,clan|обучени:tutorial,onboarding|туториал:tutorial|навык:skill,talent|способн:ability,skill|геро:hero|враг:enemy,enemies,mob|уровн:level,levels|боев:battle,combat|бой:battle,combat,fight|рейтинг:rating,elo,rank|сезон:season|пропуск:pass,battlepass|энерги:energy,stamina|прокачк:upgrade,progression|прогресс:progression,progress|реклам:ads,advert|покупк:purchase,iap|ивент:event|событи:event|карт:map,card|добыч:loot,drop|лут:loot|турнир:tournament|арен:arena|друз:friend,social|почт:mail,inbox|ежедневн:daily|бонус:bonus|здани:building|ресурс:resource|персонаж:character,hero|питом:pet|скин:skin,cosmetic'.split('|').map(x=>{const [ru,en]=x.split(':');return [ru,en.split(',')];});
// Stems of a text plus the dictionary's equivalents both ways.
function concepts(text){
 const out=new Set();
 for(const w of words(text)){
  const s=stem(w);out.add(s);
  for(const [ru,en] of TOPICS){
   if(w.startsWith(ru)||s.startsWith(ru))for(const e of en)out.add(stem(e));
   if(en.some(e=>stem(e)===s||w===e))out.add(ru);
  }
 }
 return out;
}
// How many of the query's concepts the text has (a stem matches a prefix of a word's stem).
function overlap(query,text){
 const q=[...concepts(query)],t=[...concepts(text)];
 return q.filter(a=>t.some(b=>b.startsWith(a)||a.startsWith(b)&&b.length>=4)).length;
}

// --- Markdown sections ------------------------------------------------------------------------------------------------
// [{level, title, path, line, end, body}] — `line` is the heading's line (0-based), `end` the first line after the
// section (the next heading of the same or a higher level). A preamble before the first heading has level 0.
function sections(markdown){
 const lines=String(markdown||'').replace(/\r\n?/g,'\n').split('\n');
 const heads=[];let fence=null;
 lines.forEach((l,i)=>{
  const f=/^\s*(```|~~~)/.exec(l);if(f){fence=fence===f[1]?null:fence||f[1];return;}
  if(fence)return;
  const m=/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);if(m)heads.push({level:m[1].length,title:m[2].trim(),line:i});
 });
 const out=[];const trail=[];
 if(!heads.length||heads[0].line>0){const body=lines.slice(0,heads.length?heads[0].line:lines.length).join('\n').trim();if(body)out.push({level:0,title:'',path:'',line:0,end:heads.length?heads[0].line:lines.length,body});}
 heads.forEach((h,k)=>{
  trail.length=h.level-1;trail[h.level-1]=h.title;
  let end=lines.length;for(const n of heads.slice(k+1))if(n.level<=h.level){end=n.line;break;}
  const next=heads[k+1]?.line??lines.length;
  out.push({level:h.level,title:h.title,path:trail.filter(Boolean).join(' › '),line:h.line,end,own:next,body:lines.slice(h.line+1,next).join('\n').trim()});
 });
 return out;
}
const key=section=>norm(section.path||section.title).replace(/^[\d.\s]+/,'').replace(/\s+/g,' ').trim();

// --- Word diff --------------------------------------------------------------------------------------------------------
const tokens=t=>String(t||'').match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu)||[];
// [{op:'eq'|'del'|'ins', text}] turning `a` into `b`. Common prefix and suffix are trimmed before the LCS; a very large
// middle falls back to «all removed, all added» rather than an unbounded table.
function wordDiff(a,b,{limit=4e6}={}){
 const x=tokens(a),y=tokens(b);
 let p=0;while(p<x.length&&p<y.length&&x[p]===y[p])p++;
 let q=0;while(q<x.length-p&&q<y.length-p&&x[x.length-1-q]===y[y.length-1-q])q++;
 const xs=x.slice(p,x.length-q),ys=y.slice(p,y.length-q);
 const ops=[];
 const push=(op,text)=>{if(!text)return;const last=ops[ops.length-1];if(last&&last.op===op)last.text+=text;else ops.push({op,text});};
 push('eq',x.slice(0,p).join(''));
 const n=xs.length,m=ys.length;
 if(n*m>limit){push('del',xs.join(''));push('ins',ys.join(''));}
 else{
  const w=m+1,t=new Uint32Array((n+1)*w);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)t[i*w+j]=xs[i]===ys[j]?t[(i+1)*w+j+1]+1:Math.max(t[(i+1)*w+j],t[i*w+j+1]);
  let i=0,j=0;
  while(i<n&&j<m){if(xs[i]===ys[j]){push('eq',xs[i]);i++;j++;}else if(t[(i+1)*w+j]>=t[i*w+j+1]){push('del',xs[i]);i++;}else{push('ins',ys[j]);j++;}}
  while(i<n)push('del',xs[i++]);while(j<m)push('ins',ys[j++]);
 }
 push('eq',x.slice(x.length-q).join(''));
 // A lone space between two changes belongs to the change (easier to read).
 for(let k=1;k<ops.length-1;k++)if(ops[k].op==='eq'&&/^\s+$/.test(ops[k].text)&&ops[k-1].op!=='eq'&&ops[k+1].op!=='eq'){ops[k-1].text+=ops[k].text;ops[k+1].text=ops[k].text+ops[k+1].text;ops.splice(k,1);k--;}
 return ops;
}
const count=text=>(String(text).match(/[\p{L}\p{N}]+/gu)||[]).length;
// Keeps only the changes and a few words around them (long unchanged runs become «…»).
function compact(ops,around=12){
 return ops.map((o,k)=>{
  if(o.op!=='eq')return o;
  const t=tokens(o.text);if(t.length<=around*2+2)return o;
  const head=k===0?[]:t.slice(0,around),tail=k===ops.length-1?[]:t.slice(-around);
  return {op:'eq',text:head.join('')+(head.length||tail.length?' … ':'…')+tail.join(''),cut:true};
 });
}

// Section-level comparison: [{n, key, title, path, level, status:'added'|'removed'|'changed', old, new, ops, added,
// removed}] in the order of the new text (removed sections after their old neighbours). Unchanged sections are left out.
function compare(oldText,newText){
 const a=sections(oldText),b=sections(newText);
 const ka=new Map(a.map(s=>[key(s),s])),kb=new Map(b.map(s=>[key(s),s]));
 const out=[];
 const add=(status,o,n)=>{
  const ops=wordDiff(o?.body||'',n?.body||'');
  if(status==='changed'&&!ops.some(x=>x.op!=='eq'))return;
  const s=n||o;
  out.push({key:key(s),title:s.title||'Начало документа',path:s.path,level:s.level,status,old:o?.body||'',new:n?.body||'',ops:compact(ops),
   added:ops.filter(x=>x.op==='ins').reduce((k,x)=>k+count(x.text),0),removed:ops.filter(x=>x.op==='del').reduce((k,x)=>k+count(x.text),0)});
 };
 for(const s of b){const o=ka.get(key(s));add(o?'changed':'added',o,s);}
 for(const s of a)if(!kb.has(key(s)))add('removed',s,null);
 out.forEach((h,i)=>{h.n=i+1;});
 return out;
}

// --- Grounding a summary in the hunks ----------------------------------------------------------------------------------
// Words that only say «something changed» and never need support in the text.
const GENERIC=new Set('добавл|добав|удал|измен|обнов|поменя|переписа|уточн|раздел|текст|описани|новы|нов|стал|было|стало|теперь|значени|правк|мелк|формулировк|част|пункт|строк|абзац|уточнен|сокращ|расшир|доба|перенес|переимен'.split('|'));
function grounded(item,hunks){
 const cited=[...new Set((item?.hunks||[]).map(Number))].filter(n=>Number.isInteger(n));
 if(!cited.length||cited.some(n=>!hunks.some(h=>h.n===n)))return false;
 const own=cited.map(n=>hunks.find(h=>h.n===n));
 const changed=own.map(h=>h.ops.filter(o=>o.op!=='eq').map(o=>o.text).join(' ')+' '+h.title+' '+h.path).join(' ');
 const all=own.map(h=>h.title+' '+h.path+' '+h.old+' '+h.new).join(' ');
 // Every number of the sentence is in the changed words (or the section's title).
 const nums=String(item.text||'').match(/\d+(?:[.,]\d+)?/g)||[];
 const have=new Set((changed.match(/\d+(?:[.,]\d+)?/g)||[]).map(v=>v.replace(',','.')));
 if(nums.some(v=>!have.has(v.replace(',','.'))))return false;
 // At least one content word of the sentence is in the cited sections; none of its words may be foreign to them
 // unless they only say «changed / added / removed».
 const own2=words(item.text).map(stem).filter(s=>!GENERIC.has(s)&&![...GENERIC].some(g=>s.startsWith(g)));
 if(!own2.length)return true;
 const text=[...concepts(all)];
 const hit=s=>text.some(t=>t.startsWith(s)||s.startsWith(t)&&t.length>=3);
 const hits=own2.filter(hit).length;
 return hits>=1&&hits>=Math.ceil(own2.length*0.6);
}

// --- Numbers in a draft ------------------------------------------------------------------------------------------------
// The numbers of a Markdown text that make a claim: not heading numbering, list numbering, citations «[file:line]»,
// dates or the «уточнить» marks themselves. → [{value, index, length}]
function numbers(text){
 const out=[];const src=String(text||'');
 const skip=[];
 for(const m of src.matchAll(/\[[^\]\n]{1,300}\]|\(уточнить\)|«уточнить»|\d{4}-\d{2}-\d{2}/gu))skip.push([m.index,m.index+m[0].length]);
 for(const m of src.matchAll(/^\s{0,3}(?:#{1,6}\s+(?:\d+(?:\.\d+)*\.?\s+)?|\d+[.)]\s+)/gmu))skip.push([m.index,m.index+m[0].length]);
 for(const m of src.matchAll(/(?<![\p{L}\p{N}_.,-])-?\d+(?:[.,]\d+)?|(?<=[\p{L}]-)\d+(?:[.,]\d+)?/gu)){
  if(skip.some(([a,b])=>m.index>=a&&m.index<b))continue;
  // A digit inside a word (Unity6, x2) is a name, not a number.
  const before=src[m.index-1]||'',after=src[m.index+m[0].length]||'';
  if(/[\p{L}_]/u.test(before)||/[\p{L}_]/u.test(after)&&!/[хx%]/iu.test(after))continue;
  out.push({value:Number(m[0].replace(',','.')),text:m[0],index:m.index,length:m[0].length});
 }
 return out;
}

// --- Confluence storage ↔ Markdown ---------------------------------------------------------------------------------------
const decode=t=>String(t).replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const strip=t=>decode(String(t).replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();
function storageToMarkdown(html){
 return decode(String(html||'')
  .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,(m,c)=>'\n```\n'+c+'\n```\n')
  .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,(m,l,t)=>'\n'+'#'.repeat(Number(l))+' '+strip(t)+'\n')
  .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi,(m,row)=>'\n| '+[...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c=>strip(c[1])).join(' | ')+' |')
  .replace(/<li[^>]*>/gi,'\n- ').replace(/<code>([\s\S]*?)<\/code>/gi,'`$1`').replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi,'**$1**')
  .replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,(m,u,t)=>'['+strip(t)+']('+u+')')
  .replace(/<(?:br|\/p|\/ul|\/ol|\/table|\/blockquote|\/pre)\b[^>]*>/gi,'\n').replace(/<blockquote[^>]*>/gi,'\n> ')
  .replace(/<[^>]+>/g,''))
  .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
// Markdown → storage XHTML (everything escaped; links only http(s)). `dropTitle` leaves out a first-level heading.
function markdownToStorage(markdown,{dropTitle=false}={}){
 const out=[];let open=null;
 const close=()=>{if(open){out.push('</'+open+'>');open=null;}};
 for(const b of md.blocks(markdown)){
  if(b.type==='heading'&&b.level===1&&dropTitle)continue;
  if(b.type==='li'){const tag=b.ordered?'ol':'ul';if(open!==tag){close();out.push('<'+tag+'>');open=tag;}out.push('<li>'+md.inline(b.text)+'</li>');continue;}
  close();
  if(b.type==='heading')out.push('<h'+b.level+'>'+md.inline(b.text)+'</h'+b.level+'>');
  else if(b.type==='code')out.push('<pre>'+md.esc(b.text)+'</pre>');
  else if(b.type==='quote')out.push('<blockquote><p>'+md.inline(b.text)+'</p></blockquote>');
  else if(b.type==='table')out.push('<table><tbody>'+b.rows.map((r,i)=>'<tr>'+r.map(c=>(i===0?'<th>':'<td>')+md.inline(c)+(i===0?'</th>':'</td>')).join('')+'</tr>').join('')+'</tbody></table>');
  else out.push('<p>'+md.inline(b.text)+'</p>');
 }
 close();
 return out.join('');
}
// Headings of a storage body: [{level, title, start (of the tag), bodyStart (after it), end (next heading of the same or
// a higher level, or the end)}].
function storageSections(html){
 const src=String(html||'');
 const heads=[...src.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m=>({level:Number(m[1]),title:strip(m[2]),start:m.index,bodyStart:m.index+m[0].length}));
 return heads.map((h,k)=>{let end=src.length;for(const n of heads.slice(k+1))if(n.level<=h.level){end=n.start;break;}return {...h,end};});
}

module.exports={STOP,TOPICS,norm,words,stem,concepts,overlap,sections,key,tokens,wordDiff,compact,compare,grounded,numbers,count,
 storageToMarkdown,markdownToStorage,storageSections,strip};
