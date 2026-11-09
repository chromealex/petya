// «Онбординг новичка», where each item of the plan comes from. Every function only reads and returns items with their
// source, or a gap note saying what is not connected; one failing source never hides the others.
// - docs: «Поиск по всему» (its search over Confluence/Notion, project files, Google Drive, the glossary …) and the
//   semantic index (`files`, `google-drive` collections, when the user turned them on);
// - people: «Кто знает» (who knows the newcomer's area, by git, Jira, chats and meetings) and «Команда» through the
//   people records (roles, absences in the first two weeks);
// - starter tasks: Jira issues with the «good first issue» labels (read through Petya's Jira connection);
// - accesses: the checklist the user keeps in the app's settings.
const path=require('node:path');
const DAY=86400000;
const clip=(t,n=200)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const safe=v=>/^https:\/\//.test(String(v||''))?String(v):'';
const added=(s,id)=>s.settings?.['extension_'+id]==='true';

// Role words → search words and the stems that recognise the role in «Команда» roles and Jira labels.
const ROLES=[
 {id:'бэкенд',re:/бэк[\s-]?енд\p{L}*|бекенд\p{L}*|backend|сервер\p{L}*/iu,words:['backend','бэкенд','сервер','api']},
 {id:'фронтенд',re:/фронт[\s-]?енд\p{L}*|frontend|веб[\s-]?разраб\p{L}*/iu,words:['frontend','фронтенд','web']},
 {id:'клиент',re:/клиент\p{L}*|unity[\s-]?разраб\p{L}*|юнити\p{L}*|геймплей\p{L}*|gameplay/iu,words:['client','unity','клиент','gameplay']},
 {id:'мобильная разработка',re:/мобильн\p{L}*|android|ios|андроид\p{L}*/iu,words:['mobile','android','ios']},
 {id:'QA',re:/(?:^|[^\p{L}])(?:qa|тестиров\p{L}*|тестировщ\p{L}*|тестер\p{L}*)(?=$|[^\p{L}])/iu,words:['qa','test','тестирование']},
 {id:'геймдизайн',re:/геймдиз\p{L}*|game\s?design\p{L}*|дизайнер\p{L}*\s+уровн/iu,words:['gamedesign','геймдизайн','баланс']},
 {id:'арт',re:/художни\p{L}*|(?:^|[^\p{L}])арт(?=$|[^\p{L}])|аниматор\p{L}*|3d|2d|technical\s+artist/iu,words:['art','арт','анимация']},
 {id:'аналитика',re:/аналитик\p{L}*|analytics|data/iu,words:['analytics','аналитика','метрики']},
 {id:'DevOps',re:/devops|девопс\p{L}*|sre|инфраструктур\p{L}*/iu,words:['devops','infra','ci','kubernetes']},
 {id:'продакт',re:/продакт\p{L}*|product\s*manager|менеджер\p{L}*\s+продукт/iu,words:['product','продукт','roadmap']}
];
function role(text){
 const t=String(text||'');
 const known=ROLES.find(r=>r.re.test(t));
 if(known)return {id:known.id,words:known.words,re:known.re};
 const clean=clip(t,40).toLowerCase();
 return clean?{id:clean,words:clean.split(/\s+/).filter(w=>w.length>=3),re:new RegExp(clean.replace(/[^\p{L}\p{N}\s]/gu,'').split(/\s+/).filter(Boolean).map(w=>w.slice(0,Math.max(4,w.length-2))).join('|')||'^$','iu')}:null;
}

// --- Docs -----------------------------------------------------------------------------------------------------------
// Rows of «Поиск по всему» that are documents, not conversations or tasks.
const CHATTY=new Set(['slack','telegram','mail','meetings','jira','notes']);
async function docs(s,r,{limit=6,deps={}}={}){
 const out=[],gaps=[];
 const query=['онбординг',r.id,...r.words.slice(0,2)].join(' ');
 if(added(s,'search-all')){
  try{
   const card=await (deps.searchAll||require('../search-all/feature.cjs').search)(s,query);
   for(const i of card.items||[]){
    if(CHATTY.has(i.source)||i.messenger)continue;
    const label=card.sources?.find(x=>x.id===i.source)?.label||i.source;
    out.push({title:clip(i.title,140),source:{label,url:safe(i.url),...i.path?{path:String(i.path)}:{}},note:clip(i.snippet||'',160)});
   }
   if(!out.length)gaps.push('Документы: «Поиск по всему» не нашёл документов по «'+r.id+'» — добавьте ссылки вручную.');
  }catch(e){gaps.push('Документы: поиск не ответил ('+clip(e.message,120)+').');}
 }else gaps.push('Документы: добавьте «Поиск по всему», чтобы искать вводные документы по Confluence, Notion и файлам проекта.');
 // The semantic index: only collections the user turned on; nothing at all when none is on.
 const index=s.semanticIndex;
 const on=['files','google-drive'].filter(id=>{try{return !!index?.enabled?.(id);}catch{return false;}});
 if(on.length){
  try{
   const res=await index.search(on,'онбординг '+r.id+': как устроен проект, архитектура, правила',{k:limit});
   for(const h of res?.hits||[]){
    const m=h.meta||{},p=String(m.path||'');
    out.push({title:clip(m.title||(p?path.basename(p):h.id),140),source:{label:h.collection==='google-drive'?'Google Диск · по смыслу':'Файлы · по смыслу',url:safe(m.url||m.link),...p?{path:p}:{}},note:clip(h.text,160)});
   }
  }catch(e){gaps.push('Индекс по смыслу: '+clip(e.message,120));}
 }
 // One item per document (the word search and the index can both find it).
 const seen=new Set();
 return {items:out.filter(d=>{const k=d.source.url||d.source.path||d.title;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,limit),gaps};
}

// --- People ---------------------------------------------------------------------------------------------------------
async function people(s,r,{newcomer='',from,to,limit=5,deps={}}={}){
 const out=[],gaps=[];
 const team=s.people?.members?.()||[];
 const self=m=>newcomer&&(m.name===newcomer||String(m.name).split(/\s+/)[0]===newcomer);
 // «Кто знает» by the newcomer's area: the top people with evidence, members of «Команда» only.
 if(added(s,'who-knows')){
  try{
   const found=await (deps.whoKnows||require('../who-knows/feature.cjs').collect)(s,r.words.slice(0,3).join(' ')||r.id);
   const rows=(found.people||[]).filter(p=>p.member).map(p=>({p,score:Object.values(p.points||{}).reduce((a,b)=>a+b,0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
   for(const {p} of rows.slice(0,3)){
    if(self({name:p.name}))continue;
    const commit=(p.commits||[])[0],issue=[...(p.issues?.values?.()||[])][0];
    const parts=Object.entries(p.points).filter(([,v])=>v>0).map(([k])=>({code:'код',jira:'Jira',slack:'Slack',meetings:'встречи',chat:'чаты'}[k]||k));
    out.push({name:p.name,role:p.role||'',why:'знает «'+r.id+'»: '+parts.join(', '),source:{label:'Кто знает',url:safe(commit?.url||issue?.url)}});
   }
   if(!rows.length)gaps.push('Люди: «Кто знает» не нашёл следов по «'+r.id+'» в коде, задачах и переписке.');
  }catch(e){gaps.push('Люди: «Кто знает» не ответил ('+clip(e.message,120)+').');}
 }else gaps.push('Люди: добавьте «Кто знает», чтобы подобрать знакомства по коду и задачам.');
 // «Команда»: people whose role is the newcomer's area, then the rest of a small team.
 if(!team.length)gaps.push('Люди: «Команда» пуста — заполните её, чтобы спланировать знакомства.');
 const same=team.filter(m=>!self(m)&&r.re.test(String(m.role||'')));
 for(const m of same)if(!out.some(x=>x.name===m.name))out.push({name:m.name,role:m.role||'',why:'та же роль в «Команде»',source:{label:'Команда'}});
 if(out.length<3)for(const m of team)if(!self(m)&&!out.some(x=>x.name===m.name)&&out.length<3)out.push({name:m.name,role:m.role||'',why:'в «Команде»'+(m.role?': '+m.role:''),source:{label:'Команда'}});
 // Absences in the first two weeks (typed ones and the calendar), so a meeting is not put on a day someone is away.
 let away=[];
 if(s.people?.absences&&from&&to){try{const res=await s.people.absences({from,to});away=res.rows;gaps.push(...(res.notes||[]).map(n=>'Отсутствия: '+n));}catch{away=[];}}
 return {items:out.slice(0,limit).map(p=>({...p,away:away.filter(a=>a.name===p.name).map(a=>({from:a.from,to:a.to,kind:a.kind}))})),gaps};
}

// --- Starter tasks --------------------------------------------------------------------------------------------------
const jiraConnected=settings=>settings.module_jira!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
const LABELS='good-first-issue,good_first_issue,goodfirstissue,starter,onboarding';
const labelsOf=settings=>String(settings.onboardingLabels||LABELS).split(/[,\n]/).map(x=>x.trim()).filter(x=>/^[\p{L}\p{N}_.-]{2,60}$/u.test(x)).slice(0,10);
const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
const projects=settings=>String(settings.jiraProjects||settings.jiraProject||'').split(',').map(k=>k.trim()).filter(k=>/^[A-Z][A-Z0-9_]{0,30}$/.test(k));
async function tasks(s,r,{limit=3}={}){
 if(!s.workspace?.api||!jiraConnected(s.settings))return {items:[],gaps:['Задачи: Jira не подключена — стартовые задачи с меткой «good first issue» не подобраны.']};
 const labels=labelsOf(s.settings),keys=projects(s.settings);
 const jql=(keys.length?'project IN ('+keys.map(quote).join(',')+') AND ':'')+'labels IN ('+labels.map(quote).join(',')+') AND statusCategory != Done ORDER BY priority DESC, created ASC';
 let data;
 try{data=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:30,fields:['summary','status','labels','components','assignee','issuetype']})});}
 catch(e){return {items:[],gaps:['Задачи: Jira не ответила ('+clip(e.message,120)+').']};}
 if(!Array.isArray(data?.issues))return {items:[],gaps:['Задачи: Jira вернула неизвестный ответ.']};
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 const rows=data.issues.map(i=>{const f=i.fields||{};const tags=[...(f.labels||[]),...(f.components||[]).map(c=>c.name),f.summary].join(' ');
  return {key:String(i.key||''),title:clip(f.summary,160),free:!f.assignee,fits:r.re.test(tags)||r.words.some(w=>tags.toLowerCase().includes(w.toLowerCase())),status:String(f.status?.name||'')};})
  .filter(x=>/^[A-Z][A-Z0-9_]*-\d+$/.test(x.key));
 // Free tasks of the newcomer's area first, then other free ones; assigned ones are left out.
 const picked=rows.filter(x=>x.free).sort((a,b)=>Number(b.fits)-Number(a.fits)).slice(0,limit);
 const link='/issues/?jql='+encodeURIComponent(jql);
 return {items:picked.map(x=>({key:x.key,title:x.title,fits:x.fits,source:{label:'Jira · '+labels[0],url:site?site+'/browse/'+x.key:''}})),gaps:picked.length?[]:['Задачи: в Jira нет свободных задач с метками '+labels.join(', ')+'.'],link:site?site+link:''};
}

// --- Accesses -------------------------------------------------------------------------------------------------------
// The user's checklist, one per line; «бэкенд: доступ к staging» applies only to that role.
function accesses(s,r){
 const lines=String(s.settings.onboardingAccesses||'').split('\n').map(l=>l.trim()).filter(Boolean).slice(0,40);
 const out=[];
 for(const line of lines){
  const m=/^([^:]{2,40}):\s*(.+)$/u.exec(line);
  if(m&&!/^https?$/i.test(m[1])){if(role(m[1])?.id===r.id||r.re.test(m[1]))out.push(clip(m[2],160));continue;}
  out.push(clip(line,160));
 }
 return {items:out.map(title=>({title,source:{label:'Чек-лист доступов'}})),gaps:out.length?[]:['Доступы: чек-лист пуст — заполните его в настройках «Онбординга».']};
}

// --- Days -----------------------------------------------------------------------------------------------------------
const ymd=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
// The first n working days from `start` (inclusive when it is a working day).
function workdays(start,n=10){
 const out=[];const d=new Date(start+'T12:00:00');
 while(out.length<n){if(d.getDay()!==0&&d.getDay()!==6)out.push(ymd(d));d.setDate(d.getDate()+1);}
 return out;
}
// The next working day after `now`.
function nextWorkday(now){const d=new Date(now);d.setHours(12,0,0,0);do d.setDate(d.getDate()+1);while(d.getDay()===0||d.getDay()===6);return ymd(d);}
const isAway=(p,day)=>(p.away||[]).some(a=>a.from<=day&&a.to>=day);

// The plan by code: accesses on day 1, documents over days 1–4, one meeting a day from day 2 (moved past a colleague's
// absence), starter tasks on days 3, 6 and 9. Every item keeps its source.
function schedule({docs:d=[],people:p=[],tasks:t=[],accesses:a=[]},days){
 const items=[];
 a.forEach((x,i)=>items.push({id:'a'+(i+1),day:1,kind:'access',title:x.title,source:x.source}));
 const docDays=[1,2,2,3,3,4];
 d.forEach((x,i)=>items.push({id:'d'+(i+1),day:docDays[i]||4,kind:'doc',title:x.title,source:x.source,...x.note?{note:x.note}:{}}));
 let next=2;
 p.forEach((x,i)=>{
  let day=Math.min(next,days.length);
  while(day<days.length&&isAway(x,days[day-1]))day++;
  const away=isAway(x,days[day-1]);
  items.push({id:'p'+(i+1),day,kind:'person',title:x.name,role:x.role||'',source:x.source,note:x.why+(away?' · в эти дни отсутствует':'')});
  next=Math.min(day+1,days.length);
 });
 const taskDays=[3,6,9];
 t.forEach((x,i)=>items.push({id:'t'+(i+1),day:taskDays[i]||9,kind:'task',title:x.key+' · '+x.title,key:x.key,source:x.source}));
 return items.sort((a,b)=>a.day-b.day||'adpt'.indexOf(a.kind[0])-'adpt'.indexOf(b.kind[0]));
}

// The welcome message, by code: what the first days hold, by first names and keys only.
function welcome({name,role:r,items}){
 const first=n=>String(n||'').split(/\s+/)[0];
 const access=items.filter(i=>i.kind==='access').length;
 const meet=items.filter(i=>i.kind==='person').slice(0,3).map(i=>first(i.title));
 const task=items.find(i=>i.kind==='task');
 const lines=['Привет, '+first(name)+'! Рады, что ты с нами'+(r?' в роли «'+r+'»':'')+'.'];
 if(access)lines.push('В первый день помогу с доступами — их '+access+'.');
 // Names stay in the nominative: a list after a colon, never a guessed case ending.
 if(meet.length)lines.push('На первой неделе — знакомства: '+meet.join(', ')+'.');
 if(task)lines.push('Первая задача — '+task.key+'.');
 lines.push('Если что-то непонятно — пиши мне в любое время.');
 return lines.join(' ');
}
module.exports={ROLES,role,docs,people,tasks,accesses,schedule,welcome,workdays,nextWorkday,labelsOf,jiraConnected,ymd,DAY};
