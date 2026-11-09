// «Перформанс-ревью»: materials for a colleague's review over a period («собери материалы для ревью Олега за
// полгода»). Facts come from Jira (tasks done, incidents handled), GitHub (PRs and code reviews), meeting summaries
// (tasks and decisions) and «Встречи 1:1» (notes and agreed follow-ups) — facts.cjs; every point of the draft links
// to its facts and the draft states what is missing («нет данных о …») — draft.cjs. Nothing about a colleague is
// generated from guesses; nothing is stored; nothing is sent. The 1:1 notes are read only in this turn, because the
// user asked about this person here, and reach only the local model of this turn; the reply text carries counts.
// Neighbours: «ревью кода», «код-ревью», PR reviews are «Код-ревью» / «Pull requests»; preparing a 1:1 is «Встречи 1:1».
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const facts=require('./facts.cjs');
const {draft,markdown,SECTIONS}=require('./draft.cjs');
const ID='perf-review',BY='Перформанс-ревью';
const DAY=86400000;
const deps={now:()=>Date.now()};

// --- Routing ---------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').trim();
const PERF='(?:перф\\p{L}*[\\s-]?ревью|перформанс[\\s-]?ревью|performance[\\s-]?review|perf[\\s-]?review|ревью\\s+эффективности|оценк\\p{L}*\\s+эффективности)';
const NAME='(\\p{Lu}[\\p{L}-]+(?:\\s+\\p{Lu}[\\p{L}-]+)?)';
const PERIOD='(?:\\s+за\\s+(полгода|пол\\s+года|полугодие|квартал|год|месяц|последн\\p{L}+\\s+\\p{L}+(?:\\s+\\p{L}+)?|\\d{1,2}\\s+(?:месяц\\p{L}*|недел\\p{L}*)|прошл\\p{L}+\\s+\\p{L}+))?';
const VERB='(?:собери|подготов\\p{L}*|сделай|составь|набросай|дай|нужн\\p{L}*)';
const R=[
 // «подготовь перформанс-ревью Маши», «собери материалы для перф-ревью Олега за квартал», «перформанс-ревью Маши»
 {re:new RegExp('^(?:'+VERB+'\\s+(?:мне\\s+)?(?:материал\\p{L}*\\s+(?:для|к)\\s+)?)?'+PERF+'(?:\\s+(?:для|по|на)\\s+)?(?:\\s*'+NAME+')?'+PERIOD+'$','u'),explicit:true},
 // «собери материалы для ревью Олега за полгода»
 {re:new RegExp('^'+VERB+'\\s+(?:мне\\s+)?материал\\p{L}*\\s+(?:для|к)\\s+ревью\\s+'+NAME+PERIOD+'$','u'),explicit:false},
 // «ревью Олега за полгода»
 {re:new RegExp('^ревью\\s+'+NAME+'\\s+за\\s+(полгода|пол\\s+года|полугодие|квартал|год|месяц|\\d{1,2}\\s+(?:месяц\\p{L}*|недел\\p{L}*))$','u'),explicit:false}
];
function route(command){
 const t0=clean(command).replace(/[?!.]+$/u,''),t=t0.charAt(0).toLowerCase()+t0.slice(1);
 if(!t||t.length>200||/^\/|(?:^|\s)скилл/iu.test(t))return null;
 if(/(?:^|[^\p{L}])(?:код\p{L}*|кода|pr|пул\p{L}*|ветк\p{L}*|изменени\p{L}*|дифф?|diff|дизайн\p{L}*|документ\p{L}*|архитектур\p{L}*|отзыв\p{L}*|app\s*store|google\s*play|что\s+такое|как\s+(?:провести|проводить|писать))(?=$|[^\p{L}])/iu.test(t))return null;
 for(const r of R){const m=r.re.exec(t);if(m)return {who:(m[1]||'').trim(),period:(m[2]||'').trim(),explicit:r.explicit};}
 return null;
}
// Days of «за полгода», «за квартал», «за 3 месяца» (half a year by default).
function days(period){
 const p=String(period||'').toLowerCase().replace(/ё/g,'е');
 if(!p||/пол\s*года|полугод/.test(p))return 182;
 if(/квартал/.test(p))return 91;
 if(/(?:^|\s)год/.test(p))return 365;
 const n=Number(/(\d{1,2})/.exec(p)?.[1]||0);
 if(n&&/недел/.test(p))return Math.min(365,n*7);
 if(n&&/месяц/.test(p))return Math.min(365,Math.round(n*30.4));
 if(/месяц/.test(p))return 30;
 return 182;
}
const dateText=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
const ymd=ms=>new Date(ms).toISOString().slice(0,10);

// Monthly counts per kind, for the card's bars.
function months(list,from,to){
 const out=[];const d=new Date(from.slice(0,7)+'-01T12:00:00Z');
 while(d.toISOString().slice(0,7)<=to.slice(0,7)&&out.length<13){const m=d.toISOString().slice(0,7);out.push({month:m,counts:Object.fromEntries(['task','incident','pr','review','meeting','followup','note'].map(k=>[k,list.filter(f=>f.kind===k&&f.date.startsWith(m)).length]))});d.setUTCMonth(d.getUTCMonth()+1);}
 return out;
}

async function review(s,command,member,period){
 const now=deps.now(),n=days(period),to=ymd(now),from=ymd(now-n*DAY);
 s.requestProgress?.report?.('Собираю факты за период: '+member.name);
 let memory=[];try{memory=s.memory?.prune?.()||[];}catch{memory=[];}
 const got=await facts.collect(s,member,{from,to,memory});
 const sourcesOff=got.gaps.filter(g=>/не подключ|не загружен|нет аккаунта|нет логина/.test(g)).length;
 if(!got.facts.length&&sourcesOff>=2)return kit.reply(s,command,{by:BY,question:true,text:'Для ревью '+member.name+' нет ни одного факта: '+got.gaps.slice(0,3).join('; ')+'. Подключите Jira или GitHub (и укажите аккаунты в «Команде») — ничего не придумываю без источников.'});
 s.requestProgress?.report?.('Пишу черновик по фактам');
 const d=await draft(s,got.facts,{person:member.name,gaps:got.gaps});
 const count=k=>got.facts.filter(f=>f.kind===k).length;
 const parts=[['task','задач'],['incident','инцидентов'],['pr','PR'],['review','ревью'],['meeting','со встреч'],['followup','договорённостей 1:1'],['note','итогов 1:1']].filter(([k])=>count(k)).map(([k,l])=>l+' '+count(k));
 const card={person:{name:member.name,role:member.role||''},from,to,days:n,facts:got.facts,draft:d,gaps:got.gaps,months:months(got.facts,from,to),links:got.links,
  markdown:markdown({person:member.name,from,to,draft:d,facts:got.facts})};
 const reply='Ревью · '+member.name+' с '+dateText(from)+' по '+dateText(to)+': фактов '+got.facts.length+(parts.length?' — '+parts.join(', '):'')+'.'+(got.gaps.length?' Нет данных: '+got.gaps.length+' (на карточке).':'')+' В черновике только эти факты, у каждого пункта — ссылки на них.';
 return kit.reply(s,command,{by:BY,text:reply,data:{perfReviewCard:card},sources:got.facts.filter(f=>/^https:\/\//.test(f.source?.url||'')).slice(0,4).map(f=>({title:f.source.label,url:f.source.url}))});
}

async function turn(s,command){
 const r=route(command);
 if(!r||!kit.installed(s,ID))return null;
 if(!s.people)return r.explicit||r.who?kit.reply(s,command,{by:BY,question:true,text:'Записи о коллегах ещё загружаются. Повторите через минуту.'}):null;
 const team=s.people.members();
 const found=r.who?s.people.find(r.who):null;
 // «ревью Олега» without the perf words is ours only when Олег is a colleague of «Команда».
 if(!r.explicit&&!found)return null;
 try{
  const run=m=>review(s,command,m,r.period);
  if(found?.member)return await run(found.member);
  if(!team.length)return kit.reply(s,command,{by:BY,question:true,text:'Ревью готовлю по коллегам из «Команды», а она пуста. Заполните её на вкладке «Команда».'});
  if(r.who&&!found)return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл «'+r.who+'» в «Команде». Ревью готовлю только по коллегам из неё.'});
  const list=found?.many||team;
  const label=m=>m.name+(m.role?' · '+m.role:'');
  return ask({text:'Для кого собрать материалы ревью?',label:'Коллега',options:list.slice(0,10).map(label),strictChoices:true},answer=>{const m=list.find(x=>label(x)===String(answer).trim());return m?run(m):kit.reply(s,command,{by:BY,text:'Такого человека нет в списке. Повторите запрос.',error:true});});
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'perfReview',defaults:{['extension_'+ID]:'false'},validate(){},setup(){return {ipc:{}};},turn,route,days,months,deps,SECTIONS,teardown(){}};
