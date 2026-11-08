// Term matching and localization analysis for «Глоссарий», done by code: a term pattern that takes Russian endings
// and English plurals, the strings of localization sets (parsed by the «Локализация» parsers), frequent words as
// term candidates, the translation each language uses for a term (words that come with it far more often than
// elsewhere) and consistency checks (forbidden variants, a translation other than the approved one, several
// translations of one term).
const RU_STOP=new Set(('это этот эта эти тот как так что чтобы если или для при без над под про после перед через между когда где куда '+
 'ваш ваша ваше ваши свой своя свои наш наша ваши его её еще ещё уже вам вас нам нас они она оно мы вы ты все всё всех '+
 'нажмите нажми получить получите получи открыть откройте открой закрыть купить купите выбрать выберите продолжить вернуться '+
 'будет может можно нужно надо есть нет был была было были сейчас сегодня завтра время дней день часов часа минут '+
 'уровень уровня уровне уровней игра игры игре игру игрок игрока игроку новый новая новое новые больше меньше очень '+
 'один одна одно два две три четыре пять первый второй третий').split(/\s+/));
const EN_STOP=new Set(('the a an and or of to in on at for with from by is are be been was were you your yours our we it its this that these those '+
 'get got open close buy select continue back next tap click press here there not no yes all any more less new now today time day days hour hours '+
 'level levels game player players one two three first second up out off as if then than can will may must have has had do does did so').split(/\s+/));
const norm=s=>String(s||'').toLocaleLowerCase().replace(/ё/g,'е').trim();
const cyr=s=>/[а-яё]/i.test(s);
const ENDING=/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ые|ие|ая|яя|ое|ее|ую|юю|ой|ей|ий|ый|ом|ем|ах|ях|ам|ям|ов|ев|а|я|о|е|и|ы|у|ю|ь|й)$/u;
function stem(word){
 const w=norm(word);
 if(!/^[а-я-]+$/.test(w)||w.length<4)return w;
 const s=w.replace(ENDING,'');
 return s.length>=3?s:w;
}
// English plural and possessive forms count as the word: «chests» is «chest», «boxes» is «box».
function base(token){
 const t=norm(token).replace(/'s$/,'');
 if(cyr(t))return stem(t);
 if(/(?:x|s|sh|ch|z)es$/.test(t)&&t.length>4)return t.slice(0,-2);
 if(/[^s]s$/.test(t)&&t.length>3)return t.slice(0,-1);
 return t;
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// A pattern for a term or variant in any text: every word with its endings, words separated by spaces or hyphens.
// `compound`: a word may sit inside a longer one («Truhe» in «Heldentruhe», German and other compounding languages).
function pattern(term,{compound=false}={}){
 const words=norm(term).split(/[\s-]+/).filter(Boolean);
 if(!words.length)return null;
 const part=w=>cyr(w)?escape(stem(w))+'\\p{L}{0,3}':escape(w)+"(?:s|es|'s)?";
 if(compound&&words.length===1&&!cyr(words[0])&&words[0].length>=4)return new RegExp(escape(words[0]),'iu');
 return new RegExp('(?:^|[^\\p{L}\\p{N}])'+words.map(part).join('[\\s-]+')+'(?=$|[^\\p{L}\\p{N}])','iu');
}
// Words of a text: letters only (placeholders, tags and numbers are not words).
function tokens(text){
 const t=String(text||'').replace(/\{[^{}]*\}|%[\w$.]+|<[^>]+>|\[[^\]]*\]/g,' ');
 return (t.match(/\p{L}[\p{L}'’-]*\p{L}|\p{L}/gu)||[]).map(w=>w.replace(/’/g,"'"));
}
const stop=w=>{const n=norm(w);return n.length<3||RU_STOP.has(n)||EN_STOP.has(n);};

// Localization sets (src/extensions/localization/formats.cjs `sets`) as rows: one per key, the text per language.
function entries(sets){
 const out=[];
 for(const set of sets||[]){
  for(const key of set.keys||[]){
   if(set.skip?.has?.(key))continue;
   const texts={};
   for(const lang of set.langs||[]){const v=set.values?.[lang]?.get?.(key);if(typeof v==='string'&&v.trim())texts[lang]=v;}
   if(Object.keys(texts).length)out.push({set:set.name,file:set.file||'',key,source:set.source,texts});
  }
 }
 return out;
}
const langOf=(lang)=>String(lang||'').split('-')[0].toLowerCase();
// The language a term is written in, as the sets name it («ru», «ru-RU», «en»).
function termLang(term,rows){
 const want=cyr(term)?'ru':'en';
 const seen=new Map();for(const r of rows)for(const l of Object.keys(r.texts))if(langOf(l)===want)seen.set(l,(seen.get(l)||0)+1);
 return [...seen.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
}
// Rows whose text in the term's language contains the term (or one of its synonyms).
function matches(term,rows,{synonyms=[]}={}){
 const lang=termLang(term,rows);if(!lang)return {lang:null,rows:[]};
 const res=[term,...synonyms].map(pattern).filter(Boolean);
 return {lang,rows:rows.filter(r=>r.texts[lang]&&res.some(re=>re.test(r.texts[lang])))};
}

// What each language uses for a term. For language L: words of L-texts in the term's rows, ranked by how much more
// often they appear there than in all L-texts («chest» is in 5 of 6 rows with «сундук» and rare elsewhere; «open»
// is everywhere). Each row is then assigned the variant it uses; rows with none stay unassigned.
function translations(term,rows,{synonyms=[]}={}){
 const found=matches(term,rows,{synonyms});if(!found.lang)return {lang:null,count:0,langs:{}};
 const out={};
 const langs=new Set();for(const r of found.rows)for(const l of Object.keys(r.texts))if(l!==found.lang)langs.add(l);
 for(const lang of langs){
  const own=found.rows.filter(r=>r.texts[lang]);if(!own.length)continue;
  const all=rows.filter(r=>r.texts[lang]);
  const df=(list)=>{const m=new Map();for(const r of list){const seen=new Set();for(const t of tokens(r.texts[lang])){if(stop(t))continue;const b=base(t);if(seen.has(b))continue;seen.add(b);const x=m.get(b)||{n:0,forms:new Map()};x.n++;x.forms.set(t,(x.forms.get(t)||0)+1);m.set(b,x);}}return m;};
  const inside=df(own),every=df(all);
  const ranked=[...inside.entries()].map(([b,x])=>{const total=every.get(b)?.n||x.n;return {base:b,n:x.n,total,lift:x.n/own.length-total/all.length,spec:x.n/total,
   form:[...x.forms.entries()].sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length)[0][0]};}).filter(x=>own.length<=2?x.n===own.length&&x.spec>=0.5:x.lift>=0.2||x.spec>=0.6&&x.n>=1)
   .sort((a,b)=>b.n-a.n||b.lift-a.lift);
  if(!ranked.length){out[lang]={primary:'',count:own.length,variants:[]};continue;}
  const primary=ranked[0];
  const compound=!/^en$/i.test(langOf(lang))&&primary.base.length>=4;
  const has=(r,b,whole=false)=>tokens(r.texts[lang]).some(t=>{const x=base(t);return x===b||!whole&&compound&&b===primary.base&&norm(t).includes(b);});
  // Another word counts as a variant only when it repeats in rows without the main one («box» twice); a single
  // different row stays «другое» and is shown with its text.
  const rest=own.filter(r=>!has(r,primary.base));
  const alternatives=ranked.filter(x=>x!==primary).map(x=>({...x,k:rest.filter(r=>has(r,x.base,true)).length})).filter(x=>x.k>=2).sort((a,b)=>b.k-a.k||b.spec-a.spec);
  const counts=new Map();const assigned=[];
  for(const r of own){
   const v=has(r,primary.base)?primary:alternatives.find(x=>has(r,x.base,true))||null;
   const name=v?v.form:'';
   counts.set(name,(counts.get(name)||0)+1);assigned.push({key:r.key,set:r.set,text:r.texts[lang],variant:name});
  }
  // «battle pass»: a neighbour word that comes with the main one in every row joins it.
  const withPrimary=own.filter(r=>has(r,primary.base,true));
  for(const side of [1,-1]){
   const near=withPrimary.map(r=>{const w=tokens(r.texts[lang]),i=w.findIndex(t=>base(t)===primary.base);return i<0?null:w[i+side];});
   const first=near[0];
   if(withPrimary.length>=2&&first&&!stop(first)&&near.every(t=>t&&base(t)===base(first))&&ranked.some(x=>x.base===base(first)))primary.form=side>0?primary.form+' '+first:first+' '+primary.form;
  }
  out[lang]={primary:primary.form,count:own.length,variants:[...counts.entries()].map(([text,n])=>({text,n})).sort((a,b)=>(b.text?1:0)-(a.text?1:0)||b.n-a.n),rows:assigned};
 }
 return {lang:found.lang,count:found.rows.length,examples:found.rows.slice(0,6).map(r=>({key:r.key,set:r.set,text:r.texts[found.lang]})),langs:out};
}

// The dictionary form of a word from the forms seen in strings: «сундук» from «сундука, сундук»; «мана» from «маны, ману».
function lemma(b,forms){
 const list=[...forms.entries()].sort((a,b)=>b[1]-a[1]).map(([f])=>f);
 if(!cyr(list[0]))return list[0];
 const plain=list.find(f=>/[бвгджзклмнпрстфхцчшщь]$/.test(f)&&!/(?:ов|ев|ей|ам|ям|ом|ем|ах|ях|ми)$/.test(f));if(plain)return plain;
 const fem=list.find(f=>/[ая]$/.test(f)&&!/(?:ая|яя)$/.test(f));if(fem)return fem;
 if(list.some(f=>f===b+'у'||f===b+'ой'))return b+'а';
 if(list.some(f=>f===b+'ю'||f===b+'ей'))return b+'я';
 return list.find(f=>f===b+'ы'||f===b+'и')||list[0];
}
// Frequent words of the strings in the main language (Russian when present): term candidates for the model, or
// the candidates themselves without it. Each word keeps its commonest form and a few example strings.
function frequent(rows,{limit=60,min=2}={}){
 const lang=termLang('а',rows)||termLang('a',rows);if(!lang)return {lang:null,words:[]};
 const m=new Map();
 for(const r of rows){const t=r.texts[lang];if(!t)continue;const seen=new Set();
  for(const w of tokens(t)){if(stop(w)||w.length<4)continue;const b=base(w);if(seen.has(b))continue;seen.add(b);
   const x=m.get(b)||{n:0,forms:new Map(),examples:[]};x.n++;const f=norm(w);x.forms.set(f,(x.forms.get(f)||0)+1);if(x.examples.length<3)x.examples.push(t.slice(0,120));m.set(b,x);}}
 const words=[...m.entries()].filter(([,x])=>x.n>=min).map(([b,x])=>({word:lemma(b,x.forms),count:x.n,examples:x.examples}))
  .sort((a,b)=>b.count-a.count||a.word.localeCompare(b.word)).slice(0,limit);
 return {lang,words};
}

// Consistency of saved terms in the strings: forbidden variants anywhere, rows that do not use the approved
// translation, and terms translated several ways without an approved one. Returns {issues, summary}.
function check(terms,rows,{limit=300}={}){
 const issues=[],summary=[];
 for(const t of terms){
  const tr=translations(t.term,rows,{synonyms:t.synonyms||[]});
  for(const f of t.forbidden||[]){
   const re=pattern(f);if(!re)continue;
   for(const r of rows)for(const [lang,text] of Object.entries(r.texts))if(re.test(text))issues.push({kind:'forbidden',term:t.term,lang,key:r.key,set:r.set,text,found:f,expected:cyr(f)===cyr(t.term)?t.term:(t.translations?.[lang]||'')});
  }
  for(const [lang,info] of Object.entries(tr.langs)){
   const approved=Object.entries(t.translations||{}).find(([l])=>l===lang||langOf(l)===langOf(lang)&&!t.translations[lang])?.[1]||'';
   const re=approved?pattern(approved,{compound:!/^en$/i.test(langOf(lang))}):null;
   if(re){
    const bad=(info.rows||[]).filter(r=>!re.test(r.text));
    const ok=(info.rows||[]).length-bad.length;
    const counts=new Map();for(const r of bad)counts.set(r.variant,(counts.get(r.variant)||0)+1);
    summary.push({term:t.term,lang,expected:approved,total:info.count,variants:[{text:approved,n:ok,ok:true},...[...counts.entries()].map(([text,n])=>({text,n,ok:false}))].filter(v=>v.n)});
    for(const r of bad)issues.push({kind:'translation',term:t.term,lang,key:r.key,set:r.set,text:r.text,found:r.variant,expected:approved});
   }else{
    summary.push({term:t.term,lang,expected:'',total:info.count,variants:info.variants.map(v=>({...v,ok:v.text===info.primary}))});
    // Without an approved translation the commonest one is the norm when it covers at least half of the rows.
    const main=info.variants.find(v=>v.text===info.primary)?.n||0;
    if(info.primary&&main*2>=info.count&&main<info.count)for(const r of info.rows.filter(r=>r.variant!==info.primary))issues.push({kind:'inconsistent',term:t.term,lang,key:r.key,set:r.set,text:r.text,found:r.variant,expected:info.primary});
   }
  }
 }
 // A row with a forbidden variant is reported once, as forbidden.
 const banned=new Set(issues.filter(i=>i.kind==='forbidden').map(i=>i.term+'\n'+i.lang+'\n'+i.set+'\n'+i.key));
 const unique=issues.filter(i=>i.kind==='forbidden'||!banned.has(i.term+'\n'+i.lang+'\n'+i.set+'\n'+i.key));
 issues.length=0;issues.push(...unique);
 const order={forbidden:0,translation:1,inconsistent:2};
 return {issues:issues.sort((a,b)=>order[a.kind]-order[b.kind]).slice(0,limit),total:issues.length,summary};
}
module.exports={norm,stem,base,pattern,tokens,entries,termLang,matches,translations,frequent,check,cyr};
