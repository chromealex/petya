// «Петя-наставник»: finds what the user does by hand in Petya's own local chat history. Everything here is code over
// the chats on this computer (no model, no network): repeated requests (normalized and clustered), recurring
// sequences of app actions in one sitting, frequently pasted texts (templates) and repeated web searches.
// Each pattern gets its frequency, the days it happened on and time estimates by a fixed, shown method.
const DAY=86400000,WEEK=7*DAY;
// Time method (seconds): typing at 200 characters a minute, 15 s to switch to Petya and send, 20 s to read an
// answer, 40 s to look through search results, 30 s to find and paste a template.
const METHOD={cps:200/60,switch:15,read:20,results:40,paste:30,trigger:40};

const STOP=new Set(('петя пожалуйста плиз пж мне меня мой моя мои моё мое моих моего моем нам нас наш наши а и или но в во на по за с со к ко у о об от до из для что чтобы это этот эта эти тот та те то так же ли бы ну вот '+
 'ещё еще теперь сейчас сегодня вчера завтра тут там здесь уже снова опять давай можешь можно надо нужно ты вы я он она они его её ее их какие какой какая каких который которые которых все всё всех '+
 'the a an to of for in on and or please').split(' '));
const GENERIC=/^(?:|шаблон.*|поправка во фразе|исправление|одним сообщением|расширение|расширения|повторяющиеся команды|Петя-наставник|скиллы|модель.*|ответ.*)$/iu;
const TRANSLIT={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const translit=text=>String(text).toLowerCase().split('').map(c=>TRANSLIT[c]??c).join('');
const slug=(text,max=40)=>translit(text).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,max).replace(/-+$/,'');

const clean=text=>String(text||'').replace(/^петя[\s,!:—-]+/iu,'').trim();
function words(text){
 return clean(text).toLowerCase().replace(/ё/g,'е').replace(/https?:\/\/\S+/g,' url ').replace(/\b[a-z][a-z0-9]+-\d+\b/g,' key ').replace(/[^\p{L}\p{N}#]+/gu,' ').split(' ').filter(Boolean);
}
// A crude Russian stem: numbers become «#», Cyrillic words keep five letters, Latin words stay whole.
function stems(text){
 const out=new Set();
 for(const w of words(text)){
  if(STOP.has(w))continue;
  if(/^\d+$/.test(w)){out.add('#');continue;}
  out.add(/[а-я]/.test(w)?w.slice(0,5):w.slice(0,14));
 }
 return out;
}
function similarity(a,b){let shared=0;for(const x of a)if(b.has(x))shared++;const union=a.size+b.size-shared;return {shared,score:union?shared/union:0};}
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const minutes=t=>{const d=new Date(t);return d.getHours()*60+d.getMinutes();};
const median=list=>{const s=[...list].sort((a,b)=>a-b);if(!s.length)return 0;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const quantile=(list,q)=>{const s=[...list].sort((a,b)=>a-b);if(!s.length)return 0;const i=(s.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};

// User requests of the window with the app that answered them. Automated chats (recurring runs, the mentor's own)
// and the mentor's own commands are left out.
function requests(topics,{now=Date.now(),weeks=8,skip=()=>false}={}){
 const since=now-weeks*WEEK,out=[];
 for(const t of topics||[]){
  if(t.mentor||/^По расписанию/u.test(t.title||'')||t.standupProject)continue;
  const list=t.messages||[];
  for(let i=0;i<list.length;i++){
   const m=list[i];
   if(m.role!=='user'||!m.at||m.at<since||m.at>now+DAY)continue;
   const text=String(m.text||'').trim();if(!text||skip(text))continue;
   const answer=list[i+1]?.role==='assistant'?list[i+1]:null;
   out.push({text,at:m.at,topicId:t.id,by:String(answer?.by||''),error:!!answer?.error});
  }
 }
 return out.sort((a,b)=>a.at-b.at);
}

// Greedy clustering by stem overlap against each cluster's first members.
function cluster(list,{min=0.6}={}){
 const groups=[];
 for(const r of list){
  const own=stems(r.text);if(own.size<2)continue;
  let best=null,bestScore=0;
  for(const g of groups){for(const m of g.members.slice(0,6)){const {shared,score}=similarity(own,m.stems);if(shared>=2&&score>=min&&score>bestScore){best=g;bestScore=score;}}}
  if(best)best.members.push({...r,stems:own});else groups.push({members:[{...r,stems:own}]});
 }
 return groups;
}
// Frequency facts of a set of moments: count, distinct days, per week, regular time of day and gap between days.
function rhythm(times,now){
 const days=[...new Set(times.map(ymd))];
 const first=Math.min(...times);
 const spanWeeks=Math.max(1,(now-first)/WEEK);
 const mins=times.map(minutes),iqr=quantile(mins,0.75)-quantile(mins,0.25);
 const dayStarts=days.map(d=>new Date(d+'T00:00:00').getTime()).sort((a,b)=>a-b);
 const gaps=dayStarts.slice(1).map((d,i)=>(d-dayStarts[i])/DAY);
 const gap=median(gaps);
 const regular=days.length>=3&&iqr<=120;
 const at=Math.floor(median(mins)/5)*5;
 return {count:times.length,days:days.length,perWeek:Math.round(times.length/spanWeeks*10)/10,regular,
  time:String(Math.floor(at/60)).padStart(2,'0')+':'+String(at%60).padStart(2,'0'),every:gap&&gap<=2?'daily':gap>=5&&gap<=9?'weekly':''};
}
const representative=members=>{const counts=new Map();for(const m of members){const k=[...m.stems].sort().join(' ');counts.set(k,(counts.get(k)||0)+1);}
 const top=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];return [...members].reverse().find(m=>[...m.stems].sort().join(' ')===top).text;};
const keyOf=(kind,set)=>kind+':'+[...set].sort().slice(0,8).join('|');
const examples=members=>[...members].reverse().slice(0,4).map(m=>({text:m.text.slice(0,300),at:new Date(m.at).toISOString()}));
const SEARCH=/^(?:найди|поищи|загугли|погугли|посмотри)\s+(?:в\s+(?:интернете|сети|гугле)\s+)?/iu;

// --- The four kinds of patterns ---------------------------------------------------------------------------------------
function repeatedRequests(list,now){
 const out=[];
 for(const g of cluster(list.filter(r=>!r.search&&r.text.length<=400))){
  if(g.members.length<3)continue;
  const r=rhythm(g.members.map(m=>m.at),now);if(r.days<2)continue;
  const core=new Set([...g.members[0].stems].filter(x=>g.members.filter(m=>m.stems.has(x)).length>=g.members.length/2));
  const text=representative(g.members),len=median(g.members.map(m=>m.text.length));
  const bys=new Map();for(const m of g.members)if(m.by&&!GENERIC.test(m.by))bys.set(m.by,(bys.get(m.by)||0)+1);
  const [by,uses]=[...bys.entries()].sort((a,b)=>b[1]-a[1])[0]||['',0];
  out.push({kind:'request',key:keyOf('request',core.size>=2?core:g.members[0].stems),title:text,length:len,by:uses>=g.members.length/2?by:'',...r,examples:examples(g.members),stems:[...core]});
 }
 return out;
}
function repeatedSearches(list,now){
 const out=[];
 for(const g of cluster(list.filter(r=>r.search).map(r=>({...r,text:r.text})))){
  if(g.members.length<3)continue;
  const r=rhythm(g.members.map(m=>m.at),now);if(r.days<2)continue;
  const text=representative(g.members);
  out.push({kind:'search',key:keyOf('search',g.members[0].stems),title:text.replace(SEARCH,'').trim()||text,query:text,length:median(g.members.map(m=>m.text.length)),...r,examples:examples(g.members)});
 }
 return out;
}
// Long pasted texts that share most of their lines: a template.
function pastes(list,now){
 const long=list.filter(r=>r.text.length>=200),groups=[];
 const shingles=text=>{const w=words(text),set=new Set();for(let i=0;i+6<=w.length;i++)set.add(w.slice(i,i+6).join(' '));return set;};
 for(const r of long){
  const own=shingles(r.text);if(own.size<5)continue;
  let best=null;
  for(const g of groups){let shared=0;for(const x of own)if(g.shingles.has(x))shared++;if(shared/Math.min(own.size,g.shingles.size)>=0.5){best=g;break;}}
  if(best)best.members.push(r);else groups.push({shingles:own,members:[r]});
 }
 const out=[];
 for(const g of groups){
  if(g.members.length<3)continue;
  const r=rhythm(g.members.map(m=>m.at),now);
  // Lines present in most copies stay; the rest become «{…}».
  const lineSets=g.members.map(m=>new Set(m.text.split('\n').map(l=>l.trim()).filter(Boolean)));
  const lines=g.members.at(-1).text.split('\n').map(l=>l.trim());
  const template=lines.map(l=>!l?'':lineSets.filter(s=>s.has(l)).length>=Math.ceil(g.members.length*2/3)?l:'{…}').join('\n').replace(/(?:\{…\}\n?){2,}/g,'{…}\n').trim();
  const first=lines.find(l=>l&&!/^\{…\}$/.test(l))||lines[0];
  out.push({kind:'paste',key:keyOf('paste',stems(template)),title:first.slice(0,90),length:median(g.members.map(m=>m.text.length)),template:template.slice(0,3000),...r,examples:examples(g.members).map(e=>({...e,text:e.text.slice(0,160)+(e.text.length>160?'…':'')}))});
 }
 return out;
}
// The same apps used one after another in one sitting (gaps under 30 minutes), on three or more days.
function sequences(list,now){
 const sessions=[];let current=null;
 for(const r of list){
  if(!r.by||GENERIC.test(r.by))continue;
  if(!current||r.at-current.end>30*60000||ymd(r.at)!==ymd(current.end)){current={steps:[],end:r.at};sessions.push(current);}
  if(current.steps.at(-1)?.by!==r.by)current.steps.push(r);
  current.end=r.at;
 }
 const grams=new Map();
 for(const sess of sessions)for(let n=2;n<=4;n++)for(let i=0;i+n<=sess.steps.length;i++){
  const steps=sess.steps.slice(i,i+n);if(new Set(steps.map(x=>x.by)).size<n)continue;
  const key=steps.map(x=>x.by).join(' → ');
  const g=grams.get(key)||{steps:steps.map(x=>x.by),runs:[]};
  if(!g.runs.some(x=>ymd(x[0].at)===ymd(steps[0].at)))g.runs.push(steps);
  grams.set(key,g);
 }
 // Chains that share two steps in a row are one habit: the one with more steps × days stays.
 const pairs=g=>g.steps.slice(1).map((x,i)=>g.steps[i]+'\n'+x);
 const inside=(a,b)=>pairs(a).some(p=>pairs(b).includes(p));
 const kept=[];
 for(const g of [...grams.values()].filter(g=>g.runs.length>=3).sort((a,b)=>b.steps.length*b.runs.length-a.steps.length*a.runs.length||b.runs.length-a.runs.length))
  if(!kept.some(h=>inside(g,h)||inside(h,g)))kept.push(g);
 return kept.map(g=>{
  const r=rhythm(g.runs.map(x=>x[0].at),now);
  // Each step's most frequent request: what would be asked in one go.
  const asks=g.steps.map((by,i)=>{const texts=g.runs.map(x=>x[i].text),count=new Map();for(const t of texts)count.set(t,(count.get(t)||0)+1);return [...count.entries()].sort((a,b)=>b[1]-a[1])[0][0];});
  return {kind:'sequence',key:'sequence:'+g.steps.join('|'),title:g.steps.join(' → '),steps:g.steps.map((by,i)=>({app:by,ask:asks[i].slice(0,200)})),length:asks.reduce((a,t)=>a+t.length,0),...r,
   examples:[...g.runs].reverse().slice(0,4).map(x=>({text:x.map(s=>s.text.slice(0,80)).join(' → '),at:new Date(x[0].at).toISOString()}))};
 });
}

// Seconds an occurrence costs and what automation saves, by the method above.
function estimate(p,type){
 const typing=p.length/METHOD.cps,k=p.steps?.length||1;
 let spent,saved;
 if(p.kind==='sequence'){spent=typing+k*(METHOD.switch+METHOD.read);saved=type==='schedule'?typing+k*METHOD.switch:Math.max(0,typing+(k-1)*METHOD.switch-METHOD.trigger/METHOD.cps);}
 else if(p.kind==='paste'){spent=METHOD.paste+typing*0.2+METHOD.switch+METHOD.read;saved=METHOD.paste;}
 else if(p.kind==='search'){spent=typing+METHOD.switch+METHOD.results;saved=type==='schedule'?typing+METHOD.switch:Math.max(0,typing-METHOD.trigger/METHOD.cps);}
 else{spent=typing+METHOD.switch+METHOD.read;saved=type==='skill'?Math.max(0,(p.length-METHOD.trigger)/METHOD.cps):typing+METHOD.switch;}
 const week=x=>Math.round(x*p.perWeek/60*10)/10;
 return {perTime:Math.round(spent),spentWeek:week(spent),savedWeek:week(saved)};
}

function analyze(topics,{now=Date.now(),weeks=8,skip}={}){
 const list=requests(topics,{now,weeks,skip}).map(r=>({...r,search:r.by==='поиск в интернете'||SEARCH.test(r.text)&&/(?:в интернете|в сети|в гугле|загугли|погугли|поищи)/iu.test(r.text)}));
 const patterns=[...repeatedRequests(list.filter(r=>r.text.length<200),now),...repeatedSearches(list,now),...pastes(list,now),...sequences(list,now)];
 return {patterns,requests:list.length,days:new Set(list.map(r=>ymd(r.at))).size,from:list[0]?new Date(list[0].at).toISOString():null,to:list.at(-1)?new Date(list.at(-1).at).toISOString():null,weeks};
}
module.exports={METHOD,STOP,stems,similarity,cluster,rhythm,requests,analyze,estimate,translit,slug,words,ymd,clean,SEARCH};
