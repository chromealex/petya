// The built-in skill library: 100+ instruction skills Petya can pick for a request on its own or run as /name.
// A skill shapes how the answer is analysed and formatted; it never grants tools, access or new facts.
// Choosing is two steps: a cheap lexical shortlist over names and descriptions, then the local model picks
// one skill from that shortlist or none (src/features/skill-choice.cjs).
const {validate}=require('../instruction-skills.cjs');
const BUILTIN=[...require('./work.cjs'),...require('./team.cjs')].map(s=>({...validate(s),builtin:true,enabled:true}));
if(new Set(BUILTIN.map(s=>s.name)).size!==BUILTIN.length)throw Error('Built-in skill names must be unique');
// Words that say nothing about which skill fits: requests and descriptions are full of them.
const STOP=new Set(('и в во на с со к ко о об от до по за из у а но или ли не ни же бы то это этот эта эти этого этой этих тот так как что чтобы '+
 'кто где когда если для при про под над без мне меня мой моя мои нам нас наш наша наши тебе ты я он она они его её ее их все всё всех весь '+
 'сделай сделать напиши написать помоги помочь можешь нужно надо нужен нужна нужны пожалуйста давай петя просят просит просить '+
 'есть быть будет был была было какой какая какие каким какую сейчас теперь тут там вот ещё еще уже очень только можно хочу '+
 'дела один одна одно два три раз the a an to of for and or in on is it my me please make write').split(' '));
const words=text=>String(text||'').toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)||[];
// A rough stem: Russian endings vary, so the first five letters stand for the word.
const stem=w=>/^[a-z0-9]+$/.test(w)?w.replace(/(?:ing|es|s)$/,'').slice(0,7):w.replace(/[аеиоуыэюяйь]{1,2}$/u,'').padEnd(3,w.slice(-1)).slice(0,5);
const stems=text=>[...new Set(words(text).filter(w=>w.length>=3&&!STOP.has(w)||/^(?:ab|qa|ui|ux|pr|ci|1:1)$/.test(w)).map(stem))];
function index(skills){
 const rows=skills.map(s=>({skill:s,name:new Set(stems(s.name.replace(/-/g,' '))),text:new Set(stems(s.description))}));
 const df=new Map();for(const r of rows)for(const t of new Set([...r.name,...r.text]))df.set(t,(df.get(t)||0)+1);
 const idf=t=>Math.log((rows.length+1)/((df.get(t)||0)+0.5));
 return {rows,idf};
}
let cache=null;
// Skills Petya may pick: the built-in ones plus the user's enabled skills. A user skill with the same name
// replaces the built-in one; a disabled user skill also switches its built-in namesake off.
function library(user=[]){
 const own=user.filter(s=>!s.workflow);
 const names=new Set(own.map(s=>s.name));
 return [...own.filter(s=>s.enabled),...BUILTIN.filter(s=>!names.has(s.name))];
}
// Best skills for a request by shared words, weighted by how rare each word is across the library.
function shortlist(command,skills=BUILTIN,limit=6){
 if(!cache||cache.skills!==skills)cache={skills,...index(skills)};
 const ask=stems(command);if(!ask.length)return [];
 return cache.rows.map(r=>{let score=0;const hits=[];
  for(const t of ask){const inName=r.name.has(t),inText=r.text.has(t);if(!inName&&!inText)continue;score+=cache.idf(t)*(inName?2:1);hits.push(t);}
  return {skill:r.skill,score,hits};
 }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
module.exports={BUILTIN,library,shortlist,stems};
