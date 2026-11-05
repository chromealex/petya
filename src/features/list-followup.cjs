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
 question,filterQuestion,items,open,pick,lastList,
 setup(s){
  const model=async(system,data)=>{const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,options:{temperature:0.2,num_predict:900},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]})});return String(response?.message?.content||'').trim();};
  const turn=async command=>{
   const choose=question(command),group=!choose&&filterQuestion(command);if(!choose&&!group)return null;
   const topic=s.dialogue.active();const list=lastList(topic?.messages);if(!list)return null; // no list in this chat: the usual pipeline answers
   const all=list.rows,total=shownOf(list.text),partial=total>all.length?' (в списке показаны '+all.length+' из '+total+')':'';
   if(group){const rows=pick(all,group);
    const text=rows.length?'Из показанного списка '+group.name+' — '+rows.length+partial+':\n'+rows.map(r=>r.key+' — '+r.title+(r.status?' ('+r.status+')':'')).join('\n'):'В показанном списке'+partial+' задач со статусом «'+group.name+'» нет. Статусы в списке: '+[...new Set(all.map(r=>r.status).filter(Boolean))].join(', ')+'.';
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
  const record=(command,text,by)=>{s.dialogue.rememberAction(command,text);const t=s.dialogue.active();const msg=t?.messages?.at(-1);if(msg?.role==='assistant')msg.by=by;s.dialogue.persist();
   return {handled:true,text,by,topicId:t?.id,topicTitle:t?.title,messages:t?.messages};};
  return {listFollowup:{turn}};
 }
};
