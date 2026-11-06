// Feature: questions about the list Petya just showed — «Какие из этих задач сделать сначала?»,
// «А какие из них на ревью?». The answer comes from that list, never a new query that lists everything again
// or matches a status by its exact name («Review» ≠ «QA Review»).
const ASK=/(?:из\s+(?:этих|них|списка|этого списка)|какую\s+из|какие\s+из|что\s+из\s+(?:этого|них|списка))/iu;
const CHOOSE=/(?:сначала|первым|первой|первую|в первую очередь|приоритет|важне|срочн|начать|начн|взяться|выбрать|выбери|главн|самые важные|за что)/iu;
const ITEM=/^\s*(?:[-*•]\s*)?([A-Z][A-Z0-9]+-\d+)\s*[—–:-]\s*(.+?)\s*(?:\(([^()]+)\))?\s*$/u;
const CLOSED=/^(?:done|released|rejected|closed|resolved|won'?t (?:do|fix)|duplicate|cancel+ed|отклонен[оа]?|закрыт[оа]?|готово|выполнен[оа]?|сделан[оа]?|отменен[оа]?|решен[оа]?)$/iu;
// Status groups a follow-up can filter by; matched against the status names shown in the list.
const GROUPS=[
 {name:'в работе',ask:/в\s+работе|делаются|в\s+процессе|in\s+progress/iu,status:/in\s*progress|в\s+работе|develop|разработк|doing/iu},
 {name:'на ревью',ask:/ревью|review|проверк|на\s+тест|qa\b/iu,status:/review|ревью|проверк|qa\b|test/iu},
 {name:'на паузе',ask:/на\s+паузе|в\s+ожидании|отложен|заблокир|on\s+hold|hold/iu,status:/hold|ожидан|пауз|block|заблок|отложен/iu},
 {name:'не начаты',ask:/не\s+начат|не\s+взят|to\s*do|в\s+бэклоге|backlog|новые/iu,status:/to\s*do|open|backlog|new|нов|открыт/iu},
 {name:'не закрыты',ask:/незаверш|не\s+закрыт|не\s+готов|открыт|активн/iu,status:null},
 {name:'закрыты',ask:/закрыт|готов|сделан|выполнен|done|released|завершён|завершен/iu,status:CLOSED}];
const clean=command=>String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'');
// «На кого эти задачи можно перевести?», «Кому из команды их отдать?»: who could take the shown tasks.
const ASSIGN=/(?:на\s+кого|кому)\s+(?:\p{L}+\s+){0,4}?(?:перевести|переназначить|отдать|передать|перекинуть|скинуть|делегировать|раздать|поручить)|кто\s+(?:\p{L}+\s+){0,2}?(?:может|мог\s+бы|сможет)\s+(?:\p{L}+\s+){0,2}?(?:взять|забрать|сделать|подхватить)\s+(?:эти|их|из\s+них)/iu;
function assignQuestion(command=''){return ASSIGN.test(clean(command));}
function question(command=''){const text=clean(command);return ASK.test(text)&&CHOOSE.test(text);}
// «Какие из них на ревью?» → the status group; «из них» alone without a status is not a filter.
function filterQuestion(command=''){const text=clean(command);if(!ASK.test(text)&&!/^(?:а\s+)?(?:какие|что|сколько|покажи|оставь)\b.*\b(?:из\s+них|из\s+этих|среди\s+них|из\s+списка)/iu.test(text))return null;
 return GROUPS.find(g=>g.ask.test(text))||null;}
// Items of the last assistant answer: «KEY — title (Status)».
function items(text=''){return String(text).split('\n').map(line=>ITEM.exec(line)).filter(Boolean).map(([,key,title,status=''])=>({key,title:title.trim(),status:status.trim()}));}
const open=rows=>rows.filter(r=>!CLOSED.test(r.status));
const pick=(rows,group)=>group.status?rows.filter(r=>group.status.test(r.status)&&(group.status===CLOSED||!CLOSED.test(r.status))):open(rows);
// The latest list in the chat: a filter that found nothing must not hide the list it was asked about.
function lastList(messages=[]){for(const m of [...messages].reverse().filter(m=>m.role==='assistant').slice(0,6)){const rows=items(m.text);if(rows.length>=2)return {rows,text:m.text};}return null;}
// «найдено 431 задач …» while 20 are shown: say the answer covers the shown part only.
const shownOf=text=>{const m=/найдено\s+(\d+)/u.exec(String(text||''));return m?Number(m[1]):0;};
module.exports={
 name:'list-followup',
 question,filterQuestion,assignQuestion,items,open,pick,lastList,
 setup(s){
  const model=async(system,data)=>{const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,options:{temperature:0.2,num_predict:900},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]})});return String(response?.message?.content||'').trim();};
  const turn=async command=>{
   const assign=assignQuestion(command),choose=!assign&&question(command),group=!assign&&!choose&&filterQuestion(command);if(!assign&&!choose&&!group)return null;
   let topic=s.dialogue.active();let list=lastList(topic?.messages);
   // The conversation may have moved to another chat since the list (a calculation, «вернёмся к задачам»):
   // take the latest list of this project from the last 30 minutes, preferring one about what is named.
   if(!list){const home=topic?.projectId||s.dialogue.state?.activeProjectId,since=Date.now()-30*60000,want=/баг/iu.test(command)?/баг/iu:/задач/iu.test(command)?/задач/iu:null;
    const found=(s.dialogue.state?.topics||[]).filter(t=>t!==topic&&!t.archived&&t.projectId===home).map(t=>{const m=[...(t.messages||[])].reverse().find(m=>m.role==='assistant'&&items(m.text).length>=2);return m&&(m.at||t.at||0)>=since?{t,m}:null;}).filter(Boolean).sort((a,b)=>Number(!!want&&want.test(b.m.text))-Number(!!want&&want.test(a.m.text))||(b.m.at||0)-(a.m.at||0))[0];
    if(found){topic=found.t;list=lastList(found.t.messages);s.dialogue.state.activeId=found.t.id;}}
   if(!list)return null; // no list in this chat: the usual pipeline answers
   const all=list.rows,total=shownOf(list.text),partial=total>all.length?' (в списке показаны '+all.length+' из '+total+')':'';
   if(assign){const keys=String(command).match(/[A-Z][A-Z0-9]+-\d+/gu)||[],named=open(all).filter(r=>keys.includes(r.key));if(keys.length&&!named.length)return null;return record(command,await reassign(command,named.length?named:open(all),named.length?'':partial),'кому передать');}
   if(group){const rows=pick(all,group);
    let text=rows.length?'Из показанного списка '+group.name+' — '+rows.length+partial+':\n'+rows.map(r=>r.key+' — '+r.title+(r.status?' ('+r.status+')':'')).join('\n'):'В показанном списке'+partial+' задач со статусом «'+group.name+'» нет. Статусы в списке: '+[...new Set(all.map(r=>r.status).filter(Boolean))].join(', ')+'.';
    // Part of a longer list: the rest may hold such tasks, so say how to ask for all of them.
    if(partial)text+='\nВ остальных задачах такие могут быть — спроси, например, «задачи '+(all[0].key.split('-')[0])+' '+group.name+'», и я посмотрю по всему проекту.';
    return record(command,text,'фильтр списка');}
   const rows=open(all);let text;
   if(!rows.length)text='В показанном списке все задачи уже закрыты (Done, Released, Rejected). Попроси «покажи незавершённые задачи» — выберу из них.';
   else if(!s.settings.model)text='Незавершённые из списка: '+rows.map(r=>r.key).join(', ')+'. Чтобы расставить порядок, настрой локальную модель.';
   else{
    s.requestProgress.report('Выбираю, с чего начать');
    text=require('../informal.cjs').informal(await model('Ты Петя, рабочий ассистент. Пользователь спрашивает, какие задачи из показанного списка сделать сначала. Выбери 3–5 задач и расставь их по порядку, к каждой — одна короткая причина по её названию и статусу (уже в работе, на ревью, ждёт решения, баг у игроков, обещано пользователям и т. п.). Используй только эти задачи, не придумывай сроки, приоритеты и данные, которых нет. Если данных мало для уверенного выбора — скажи это одной фразой в конце. Формат: нумерованный список «KEY — название: причина». На «ты», без вступлений и обращений.',{question:command,tasks:rows.slice(0,40)}));
    if(!text)text='Не получилось выбрать: модель не ответила. Незавершённые из списка: '+rows.map(r=>r.key).join(', ')+'.';
   }
   const skipped=all.length-rows.length;if(skipped&&rows.length)text+='\n\nЗакрытые задачи из списка не учитывал: '+skipped+'.';
   if(partial&&rows.length)text+='\n\nВыбирал из показанной части'+partial+'.';
   return record(command,text,'выбор из списка');
  };
  // Suggest colleagues from the team directory for the open tasks of the list, with their Jira load when known.
  // Nothing is reassigned here: «переназначь KEY на Имя» does it with a confirmation.
  const reassign=async(command,rows,partial)=>{
   if(!rows.length)return 'В показанном списке все задачи уже закрыты — переводить нечего.';
   const me=String(s.settings.userName||'').trim().toLocaleLowerCase();
   const team=require('../team.cjs').members(s.settings).filter(m=>!me||m.name.toLocaleLowerCase()!==me&&!m.name.toLocaleLowerCase().startsWith(me+' '));
   if(!team.length)return 'Не из кого выбирать: в разделе «Команда» никого нет. Скажи «Заполни команду» — соберу коллег из Slack и Jira, и тогда подскажу, кому отдать эти задачи.';
   s.requestProgress?.report('Смотрю, кому из команды подходят задачи');
   const load=await workload(team).catch(()=>null);
   const people=team.map(m=>({name:m.name,role:m.role||'',responsibilities:String(m.responsibilities||'').slice(0,300),projects:String(m.projects||'').slice(0,200),...load&&m.jiraId?{openTasks:load.get(m.jiraId)||0}:{}}));
   if(!s.settings.model)return 'Команда: '+people.map(p=>p.name+(p.role?' — '+p.role:'')).join('; ')+'. Чтобы подобрать исполнителя к каждой задаче, настрой локальную модель.';
   let text=require('../informal.cjs').informal(await model('Ты Петя, рабочий ассистент. Пользователь спрашивает, на кого из коллег можно перевести задачи из показанного списка. Для каждой задачи предложи 1–2 человека только из списка команды, с короткой причиной по роли, обязанностям, проектам и числу открытых задач (openTasks, если есть: меньше — свободнее). Если по данным никто явно не подходит — так и скажи для этой задачи. Не придумывай людей, роли и сроки. Формат: «KEY — название → Имя: причина». На «ты», без вступлений.',{question:command,tasks:rows.slice(0,30),team:people.slice(0,40)}));
   if(!text)return 'Не получилось подобрать: модель не ответила. Команда: '+people.map(p=>p.name+(p.role?' — '+p.role:'')).join('; ')+'.';
   if(!load)text+='\n\nЗагрузку коллег в Jira не проверил'+(team.some(m=>m.jiraId)?' — Jira не ответила.':' — у карточек команды нет Jira ID.');
   if(partial)text+='\n\nПодбирал для показанной части'+partial+'.';
   return text+'\n\nСам ничего не переназначал. Чтобы перевести, скажи, например, «переназначь '+rows[0].key+' на '+people[0].name.split(' ')[0]+'».';
  };
  // Open tasks per Jira account of the team, from one search.
  const workload=async team=>{
   const ids=[...new Set(team.map(m=>m.jiraId).filter(Boolean))].slice(0,40);if(!ids.length||!s.workspace?.api)return null;
   const counts=new Map();let token;
   for(let page=0;page<5;page++){
    const r=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:'assignee in ('+ids.map(id=>JSON.stringify(id)).join(',')+') AND statusCategory != Done',maxResults:100,fields:['assignee'],...token?{nextPageToken:token}:{}})},s.workspace.settings?.());
    for(const issue of r?.issues||[]){const id=issue.fields?.assignee?.accountId;if(id)counts.set(id,(counts.get(id)||0)+1);}
    if(r?.isLast!==false||!r?.nextPageToken)break;token=r.nextPageToken;
   }
   return counts;
  };
  const record=(command,text,by)=>{s.dialogue.rememberAction(command,text);const t=s.dialogue.active();const msg=t?.messages?.at(-1);if(msg?.role==='assistant')msg.by=by;s.dialogue.persist();
   return {handled:true,text,by,topicId:t?.id,topicTitle:t?.title,messages:t?.messages};};
  return {listFollowup:{turn}};
 }
};
