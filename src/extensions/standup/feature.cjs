// «Стендап»: an async standup for the lead. For each person of «Команда» a draft «вчера / сегодня / блокеры» from
// their Jira activity since the last standup (transitions, comments, worklogs), their open issues and the project's
// git commits — or their own answer in a chosen Slack thread (read-only). A summary card shows blockers in alert
// tone and who has not answered. On a schedule (time and weekdays per chat project) Petya only prepares the summary
// in the «Стендап · …» chat and notifies; posting the questions or the summary goes through the confirmed Slack
// flow from the card (share-message → «Попроси команду …»), never automatically.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const collect=require('./collect.cjs');
const ID='standup',BY='Стендап';
const DAY=86400000;

// --- Routing ------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/u,'').replace(/ё/g,'е').trim();
const WORD=/(?:^|[^\p{L}])(?:стенд-?ап\p{L}*|стэнд-?ап\p{L}*|standup\p{L}*|stand-up|дейли|daily)(?=$|[^\p{L}])/iu;
// Comedy, the meeting itself in the calendar (its time, moving or recording it): not this app.
const NOT=/комед|комик|юмор|шутк|шоу|концерт|выступлени|открыт\p{L}*\s+микрофон|клуб|(?:во\s+сколько|когда|перенес\p{L}*|отмени\p{L}*|запиши|подключись|слушай)\s+(?:\p{L}+\s+)?(?:стенд|стэнд|дейли|daily|standup)/iu;
const CONFIGURE=/(?:^|\s)(?:настрой\p{L}*|запланируй|включи|поставь\s+расписани\p{L}*|расписани\p{L}*)(?=\s|$)|(?:^|\s)(?:кажд\p{L}*|по\s+будням|ежедневно)(?=\s|$)/iu;
const DISABLE=/(?:^|\s)(?:выключи|отключи|останови|не\s+собирай|перестань\s+собирать|убери\s+расписани\p{L}*)(?=\s|$)/iu;
const TIME=/(?:^|\s)(?:на|в|к)?\s*(\d{1,2})[:.](\d{2})(?=\s|$|[,.!?])|(?:^|\s)(?:на|в|к)\s+(\d{1,2})(?:\s*(?:утра|часов|ч))?(?=\s|$|[,.!?])/iu;
const YESTERDAY=/что\s+(?:вчера\s+)?(?:делал[аи]?|сделал[аи]?)\s+(?:вчера\s+)?(?:наша\s+|вся\s+)?команд\p{L}*|что\s+(?:наша\s+)?команда\s+(?:делала|сделала)\s+вчера|чем\s+(?:вчера\s+)?занимал\p{L}*\s+команд\p{L}*/iu;
const BLOCKERS=/у\s+кого\s+(?:есть\s+|сейчас\s+)?блокер\p{L}*|какие\s+(?:у\s+(?:нас|команды)\s+)?(?:есть\s+)?блокер\p{L}*|блокер\p{L}*\s+(?:у\s+)?команд\p{L}*|кто\s+(?:сейчас\s+)?заблокирован/iu;
function kind(text){
 const t=clean(text);if(!t)return null;
 if(NOT.test(t))return null;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:провести|проводить|вести))/iu.test(t))return null;
 if(YESTERDAY.test(t))return 'yesterday';
 if(BLOCKERS.test(t))return 'blockers';
 if(!WORD.test(t))return null;
 if(DISABLE.test(t))return 'disable';
 if(CONFIGURE.test(t)&&(TIME.test(t)||/по\s+будням|кажд/iu.test(t)||collect.thread(link(t))))return 'configure';
 if(CONFIGURE.test(t))return 'configure';
 if(/(?:собери|собрать|покажи|подготовь|сделай|проведи|сводк\p{L}*|итог\p{L}*|кто\s+(?:не\s+)?ответил|как\s+прош|что\s+на|что\s+в|обнови)/iu.test(t)||/^(?:наш\s+)?(?:стенд-?ап|стэнд-?ап|дейли|daily|standup)\p{L}*$/iu.test(t))return 'collect';
 return null;
}
const link=t=>(/https:\/\/[a-z0-9.-]*slack\.com\/archives\/[^\s>]+/iu.exec(String(t||''))||[''])[0];

// --- Per-project settings: schedule, Slack thread, Jira project; kept in the app's folder per chat project --------
const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
const projectId=s=>{const t=s.dialogue.active();return t?.projectId||s.dialogue.state?.activeProjectId||'general';};
const projectName=(s,id)=>s.dialogue.state?.projects?.find(p=>p.id===id)?.name||'Общий';
const config=(s,id)=>({time:'',days:[1,2,3,4,5],thread:'',jira:'',enabled:false,...store(s).peek('project:'+id)||{}});
const saveConfig=(s,id,c)=>store(s).set('project:'+id,c);
const DAYS={пн:1,пон:1,вт:2,вто:2,ср:3,сре:3,чт:4,чет:4,пт:5,пят:5,сб:6,суб:6,вс:0,вос:0};
function parseSchedule(text){
 const t=clean(text),m=TIME.exec(t);
 const time=m?String(Number(m[1]??m[3])).padStart(2,'0')+':'+(m[2]||'00'):'';
 if(time&&(Number(time.slice(0,2))>23||Number(time.slice(3))>59))return {error:'Время стендапа — от 00:00 до 23:59.'};
 let days=null;
 if(/кажд\p{L}*\s+день|ежедневно/iu.test(t)&&!/будн/iu.test(t))days=[0,1,2,3,4,5,6];
 else if(/будн/iu.test(t))days=[1,2,3,4,5];
 else{const named=[...t.toLocaleLowerCase('ru').matchAll(/(?:^|[\s,])(пн|вт|ср|чт|пт|сб|вс|пон\p{L}*|вто\p{L}*|сре\p{L}*|чет\p{L}*|пят\p{L}*|суб\p{L}*|вос\p{L}*)(?=$|[\s,])/gu)].map(x=>DAYS[x[1].slice(0,3)]??DAYS[x[1].slice(0,2)]).filter(x=>x!==undefined);if(named.length)days=[...new Set(named)].sort();}
 return {time,days,thread:link(t)};
}
const dayNames=days=>days.length===7?'каждый день':days.join()==='1,2,3,4,5'?'по будням':days.map(d=>['вс','пн','вт','ср','чт','пт','сб'][d]).join(', ');

// The chat's Jira project, the only allowed one or the working project; several → a question.
function jiraProject(s,cfg,resume){
 if(!collect.jiraReady(s))return '';
 const {allowed}=require('../../jira-routing.cjs');
 const keys=allowed(s.settings),topic=s.dialogue.active();
 const binding=s.projectMemory?.get?.(topic?.projectMemoryId)?.jira;
 const bound=topic?.jiraProject||(binding?.site===s.settings.jiraUrl&&binding.key)||cfg.jira;
 if(bound&&keys.includes(bound))return bound;
 if(keys.length===1)return keys[0];
 if(s.settings.jiraProject&&keys.includes(s.settings.jiraProject))return s.settings.jiraProject;
 if(!keys.length)return '';
 return ask({text:'По какому проекту Jira собирать стендап? Запомню для этого проекта.',label:'Проект Jira',options:keys.slice(0,12),strictChoices:true},answer=>{const k=keys.find(x=>x.toLowerCase()===String(answer).trim().toLowerCase());if(!k)return {handled:true,text:'Такого проекта нет.',error:true};saveConfig(s,projectId(s),{...cfg,jira:k});return resume(k);});
}
function folders(s,id){
 try{const state=s.dialogue.state,project=state.projects?.find(p=>p.id===id);return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||s.dialogue.active()?.projectMemoryId));}catch{return [];}
}

// Since when: the previous standup of this project, or the previous working day at the standup time.
function previousStandup(cfg,now){
 const d=new Date(now);const [h,m]=(cfg.time||'10:00').split(':').map(Number);
 d.setDate(d.getDate()-1);while([0,6].includes(d.getDay()))d.setDate(d.getDate()-1);d.setHours(h,m,0,0);return d;
}
function sinceFor(cfg,now){
 const today=ymd(now),fallback=previousStandup(cfg,now);
 const last=cfg.lastDay===today?cfg.prevAt:cfg.lastAt;
 const t=Date.parse(last||'');
 return Number.isFinite(t)&&now-t<5*DAY&&t<+now?new Date(t):fallback;
}
const ymd=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
function markRun(s,id,cfg,now,since){
 const today=ymd(now);
 saveConfig(s,id,{...cfg,lastDay:today,lastAt:now.toISOString(),prevAt:cfg.lastDay===today?cfg.prevAt||since.toISOString():cfg.lastAt||since.toISOString()});
}

// --- The summary ---------------------------------------------------------------------------------------------------
const hours=sec=>{const h=Math.round(sec/360)/10;return (String(h).replace('.',','))+' ч';};
function draftFromJira(issues){
 return Object.values(issues).map(i=>{
  const parts=[...new Set(i.transitions)].slice(0,3);
  if(i.comments)parts.push(i.comments+' '+kit.plural(i.comments,['комментарий','комментария','комментариев']));
  if(i.seconds)parts.push('списано '+hours(i.seconds));
  return {key:i.key,url:i.url,text:i.summary+(parts.length?' — '+parts.join(', '):'')};
 });
}
async function splitByModel(s,text){
 if(!s.settings.model)return null;
 try{
  const list={type:'array',items:{type:'string'},maxItems:6};
  const r=await kit.modelJSON(s,{system:'Разложи ответ человека на стендапе на три списка: что сделал вчера, что делает сегодня, что мешает (блокеры). Коротко, его словами, без выдумок. Если чего-то нет — пустой список.',user:text,schema:{type:'object',properties:{yesterday:list,today:list,blockers:list},required:['yesterday','today','blockers']},predict:400,temperature:0.1});
  if(!r)return null;
  const clip=a=>(Array.isArray(a)?a:[]).map(x=>collect.clip(x,200)).filter(Boolean).filter(x=>!/^(?:нет|ничего)$/iu.test(x)).slice(0,6);
  return {yesterday:clip(r.yesterday),today:clip(r.today),blockers:clip(r.blockers)};
 }catch{return null;}
}
const linkItem=(text,site)=>{const k=collect.keyRe.exec(text)?.[1];return {text,...k&&site?{key:k,url:site+'/browse/'+k}:{}};};

async function build(s,{pid,jiraKey,now=new Date(),since,thread,git}){
 const team=(()=>{try{return require('../../team.cjs').members(s.settings);}catch{return [];}})();
 const warnings=[],used={jira:false,git:false,slack:false};
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 let j={activity:{},open:{}};
 if(jiraKey){
  s.requestProgress?.report?.('Читаю активность в Jira с '+since.toLocaleString('ru-RU',{weekday:'short',hour:'2-digit',minute:'2-digit'}));
  try{j=await collect.jira(s,{project:jiraKey,ids:team.map(m=>m.jiraId).filter(Boolean),since,now});used.jira=true;}
  catch(e){warnings.push('Jira: '+collect.clip(e.message,120));}
 }
 const dirs=folders(s,pid);let c={commits:[],warnings:[]};
 if(dirs.length){s.requestProgress?.report?.('Смотрю коммиты в репозитории');c=await collect.commits(dirs,{since,...git?{git}:{}});used.git=c.commits.length>0||!c.warnings.length&&dirs.length>0;warnings.push(...c.warnings);}
 let answers=[];const t=thread?collect.thread(thread):null;
 if(t){
  if(!collect.slackReady(s))warnings.push('Slack не подключён — ответы из треда не прочитаны.');
  else{s.requestProgress?.report?.('Читаю ответы в треде Slack');try{answers=await collect.replies(s,t,{since});used.slack=true;}catch(e){warnings.push(collect.clip(e.message,140));}}
 }
 const people=team.filter(m=>m.jiraId||m.slackId||m.email||m.accounts?.slack?.id);
 const slackOf=m=>m.slackId||m.accounts?.slack?.id||'';
 const mails=m=>[m.email,...Object.values(m.accounts||{}).map(a=>a.email)].filter(Boolean).map(x=>x.toLowerCase());
 const sameName=(a,b)=>{const x=String(a||'').toLowerCase().trim(),y=String(b||'').toLowerCase().trim();return !!x&&(x===y||require('../../team-match.cjs').latin(x)===require('../../team-match.cjs').latin(y));};
 const rows=[];
 for(const m of people){
  const mine=answers.filter(a=>a.user===slackOf(m));
  let answer=null;
  if(mine.length){const text=mine.map(a=>a.text).join('\n');answer=collect.split(text)||await splitByModel(s,text)||{yesterday:[],today:[],blockers:[],note:collect.clip(text,600)};}
  const act=m.jiraId?j.activity[m.jiraId]:null,open=m.jiraId?j.open[m.jiraId]:null;
  const own=c.commits.filter(x=>mails(m).includes(x.email)||sameName(x.name,m.name)||sameName(x.name,m.jiraName));
  const drafted=[...act?draftFromJira(act.issues):[],...own.slice(0,4).map(x=>({...linkItem('коммит: '+x.subject,site),repo:x.repo}))].slice(0,7);
  const yesterday=answer?answer.yesterday.map(x=>linkItem(x,site)):drafted;
  const today=answer?.today?.length?answer.today.map(x=>linkItem(x,site)):(open?.today||[]);
  const blockers=[...(answer?.blockers||[]).map(x=>linkItem(x,site))];
  for(const b of open?.blockers||[])if(!blockers.some(x=>x.key===b.key))blockers.push(b);
  const active=!!(answer||drafted.length||today.length);
  rows.push({name:m.name,role:m.role||'',source:answer?'slack':drafted.length||today.length?'draft':'none',yesterday,today,blockers,...answer?.note?{note:answer.note}:{},
   noAnswer:t?!answer:!active,commits:own.length,...answer?{answeredAt:new Date(Math.max(...mine.map(a=>a.at))).toISOString()}:{}});
 }
 // Answers in the thread from people outside «Команда» are shown too, by their Slack name.
 for(const a of answers.filter(a=>!people.some(m=>slackOf(m)===a.user))){
  if(rows.some(r=>r.slackUser===a.user))continue;
  const text=answers.filter(x=>x.user===a.user).map(x=>x.text).join('\n');
  const parts=collect.split(text)||await splitByModel(s,text)||{yesterday:[],today:[],blockers:[],note:collect.clip(text,600)};
  rows.push({name:a.name||'Участник Slack',role:'не в «Команде»',slackUser:a.user,source:'slack',yesterday:parts.yesterday.map(x=>linkItem(x,site)),today:parts.today.map(x=>linkItem(x,site)),blockers:parts.blockers.map(x=>linkItem(x,site)),...parts.note?{note:parts.note}:{},noAnswer:false,commits:0});
 }
 rows.sort((a,b)=>(b.blockers.length>0)-(a.blockers.length>0)||(a.noAnswer-b.noAnswer)||a.name.localeCompare(b.name,'ru'));
 const totals={people:rows.length,answered:rows.filter(r=>r.source==='slack').length,drafted:rows.filter(r=>r.source==='draft').length,blocked:rows.filter(r=>r.blockers.length).length,blockers:rows.reduce((n,r)=>n+r.blockers.length,0),silent:rows.filter(r=>r.noAnswer).length};
 if(!team.length)warnings.push('«Команда» пуста — добавьте людей с аккаунтами Jira и Slack, чтобы собрать стендап по каждому.');
 return {project:{id:pid,name:projectName(s,pid)},jira:jiraKey||'',site,since:since.toISOString(),at:now.toISOString(),thread:t?{url:t.url}:null,sources:used,people:rows,totals,warnings};
}

function summary(card,focus){
 const t=card.totals,blocked=card.people.filter(p=>p.blockers.length),silent=card.people.filter(p=>p.noAnswer);
 const blockText=blocked.length?'Блокеры у '+blocked.length+': '+blocked.map(p=>p.name+' ('+p.blockers.map(b=>b.key||collect.clip(b.text,40)).slice(0,2).join(', ')+')').join('; ')+'.':'Блокеров нет.';
 if(focus==='blockers')return blockText;
 const head=card.thread?'Стендап: ответили в треде '+t.answered+' из '+t.people+(t.drafted?', по остальным — черновики по Jira и git':'')+'.':'Стендап по Jira'+(card.sources.git?' и git':'')+': активность у '+(t.people-t.silent)+' из '+t.people+'.';
 const silentText=silent.length?' '+(card.thread?'Нет ответа':'Без активности')+': '+silent.map(p=>p.name).join(', ')+'.':'';
 if(focus==='yesterday'){
  const lines=card.people.filter(p=>p.yesterday.length).map(p=>p.name+': '+p.yesterday.slice(0,3).map(x=>x.text).join('; '));
  return (lines.length?'Вчера:\n'+lines.join('\n'):'Активности со вчерашнего стендапа не нашёл.')+'\n'+blockText+silentText;
 }
 return head+' '+blockText+silentText;
}

// --- Turns ----------------------------------------------------------------------------------------------------------
async function collectTurn(s,command,focus,{now=new Date(),git}={}){
 const pid=projectId(s),cfg=config(s,pid);
 const hasThread=collect.thread(link(command)||cfg.thread);
 const go=async jiraKey=>{
  if(jiraKey&&typeof jiraKey==='object')return jiraKey;
  if(!jiraKey&&!hasThread&&!folders(s,pid).length)return kit.reply(s,command,{by:BY,question:true,text:'Стендап собираю по Jira, git проекта или ответам в треде Slack. Подключите Jira в «Подключениях» или пришлите ссылку на тред: «настрой стендап на 10:30 в треде https://…slack.com/archives/…».'});
  const since=sinceFor(cfg,now);
  const card=await build(s,{pid,jiraKey,now,since,thread:link(command)||cfg.thread,git});
  if(jiraKey&&jiraKey!==cfg.jira)cfg.jira=jiraKey;
  markRun(s,pid,cfg,now,since);
  return kit.reply(s,command,{by:BY,text:summary(card,focus),data:{standupCard:{...card,focus,schedule:cfg.enabled?{time:cfg.time,days:dayNames(cfg.days)}:null}},
   sources:[...card.jira&&card.site?[{title:'Jira · '+card.jira,url:card.site+'/issues/?jql='+encodeURIComponent('project = "'+card.jira+'" AND updated >= "'+ymd(since).replace(/-/g,'/')+'"')}]:[],...card.thread?[{title:'Тред стендапа в Slack',url:card.thread.url}]:[]]});
 };
 return go(jiraProject(s,cfg,go));
}

function configureTurn(s,command){
 const pid=projectId(s),cfg=config(s,pid),p=parseSchedule(command);
 if(p.error)return kit.reply(s,command,{by:BY,error:true,text:p.error});
 const time=p.time||cfg.time;
 if(!time)return ask({text:'Во сколько готовить стендап?',label:'Время',placeholder:'10:30',options:['10:00','10:30','11:00']},answer=>configureTurn(s,command+' в '+answer));
 if(link(command)&&!p.thread)return kit.reply(s,command,{by:BY,error:true,text:'Это не ссылка на тред Slack. Скопируйте ссылку на сообщение: «Копировать ссылку» в меню сообщения.'});
 const next={...cfg,time,days:p.days||cfg.days,thread:p.thread||cfg.thread,enabled:true,preparedDay:''};
 saveConfig(s,pid,next);
 const where='Слежу за проектом «'+projectName(s,pid)+'»'+(next.thread?', ответы читаю из треда Slack':'');
 return kit.reply(s,command,{by:BY,text:'Готово: сводка стендапа '+dayNames(next.days)+' в '+time+'. '+where+'. В это время подготовлю черновики «вчера / сегодня / блокеры» в чате «Стендап» и пришлю уведомление — в Slack ничего не отправляю сам.'});
}
function disableTurn(s,command){
 const pid=projectId(s),cfg=config(s,pid);
 if(!cfg.enabled)return kit.reply(s,command,{by:BY,text:'Расписания стендапа для проекта «'+projectName(s,pid)+'» нет. Собрать сводку вручную: «собери стендап».'});
 saveConfig(s,pid,{...cfg,enabled:false});
 return kit.reply(s,command,{by:BY,text:'Больше не готовлю стендап по расписанию в проекте «'+projectName(s,pid)+'». Собрать сводку можно в любой момент: «собери стендап».'});
}

// --- Schedule: prepare and notify only --------------------------------------------------------------------------------
function publish(s,item){try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',item);}catch{/* window closed */}}
async function prepare(s,pid,now=new Date(),deps={}){
 const cfg=config(s,pid),state=s.dialogue.state;
 const project=state.projects?.find(p=>p.id===pid&&!p.archived);if(!project)return null;
 let topic=state.topics.find(t=>t.standupProject===pid&&!t.archived);
 if(!topic){topic={id:randomUUID(),projectId:pid,title:'Стендап · '+project.name,kind:'chat',standupProject:pid,messages:[],at:Date.now()};state.topics.push(topic);}
 const jiraKey=collect.jiraReady(s)&&cfg.jira&&require('../../jira-routing.cjs').allowed(s.settings).includes(cfg.jira)?cfg.jira:'';
 const since=sinceFor(cfg,now);
 const card=await build(s,{pid,jiraKey,now,since,thread:cfg.thread,git:deps.git});
 markRun(s,pid,{...cfg,preparedDay:ymd(now)},now,since);
 const text=summary(card,'collect');
 topic.messages.push({role:'assistant',text,at:Date.now(),by:BY,extensionData:{standupCard:{...card,focus:'collect',schedule:{time:cfg.time,days:dayNames(cfg.days)}}}});
 topic.at=Date.now();topic.unread=(topic.unread||0)+1;s.dialogue.persist();
 publish(s,{id:'standup:'+pid,title:'Стендап · '+project.name,text:'Сводка готова. '+text.slice(0,200),busy:false,kind:card.totals.blocked?'attention':'success',version:ymd(now)});
 try{const {Notification}=require('electron');if(Notification?.isSupported?.())new Notification({title:'Петя · стендап',body:text.slice(0,180)}).show();}catch{/* no notifications */}
 return {topic,card};
}
// Projects whose standup is due now: an enabled schedule, today's weekday, time passed (within 3 hours), not prepared today.
function due(s,now=new Date()){
 const out=[];
 for(const p of s.dialogue.state?.projects||[]){
  if(p.archived)continue;const cfg=config(s,p.id);if(!cfg.enabled||!cfg.time||!cfg.days.includes(now.getDay())||cfg.preparedDay===ymd(now))continue;
  const [h,m]=cfg.time.split(':').map(Number),at=new Date(now);at.setHours(h,m,0,0);
  if(now>=at&&now-at<3*3600000)out.push(p.id);
 }
 return out;
}

function setup(s){
 let running=false;
 const tick=async(now=new Date())=>{
  if(running||!kit.installed(s,ID))return [];running=true;
  const done=[];
  try{for(const pid of due(s,now)){try{const r=await prepare(s,pid,now);if(r)done.push(pid);}catch(e){const cfg=config(s,pid);saveConfig(s,pid,{...cfg,preparedDay:ymd(now)});publish(s,{id:'standup:'+pid,title:'Стендап · '+projectName(s,pid),text:'Не удалось подготовить сводку: '+collect.clip(e.message,160),busy:false,kind:'error',version:'error:'+ymd(now)});}}}
  finally{running=false;}
  return done;
 };
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>{tick().catch(()=>{});},60000);timer.unref?.();}
 return {standup:{tick},ipc:{
  schedule:()=>{const pid=projectId(s),c=config(s,pid);return {project:projectName(s,pid),enabled:c.enabled,time:c.time,days:c.days,thread:c.thread};}
 }};
}

async function turn(s,command,deps={}){
 const text=String(command||'');
 const k=kind(text);
 if(!k||!kit.installed(s,ID))return null;
 try{
  if(k==='configure')return configureTurn(s,text);
  if(k==='disable')return disableTurn(s,text);
  return await collectTurn(s,text,k,deps);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'standup',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,parseSchedule,build,summary,prepare,due,sinceFor,collectTurn};
