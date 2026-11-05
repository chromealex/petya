// Feature: questions about the list Petya just showed — «Какие из этих задач сделать сначала?».
// The answer is picked from that list (open items only), never a new Jira query that lists everything again.
const ASK=/(?:из\s+(?:этих|них|списка|этого списка)|какую\s+из|какие\s+из|что\s+из\s+(?:этого|них|списка))/iu;
const CHOOSE=/(?:сначала|первым|первой|первую|в первую очередь|приоритет|важне|срочн|начать|начн|взяться|выбрать|выбери|главн|самые важные|за что)/iu;
const ITEM=/^\s*(?:[-*•]\s*)?([A-Z][A-Z0-9]+-\d+)\s*[—–:-]\s*(.+?)\s*(?:\(([^()]+)\))?\s*$/u;
const CLOSED=/^(?:done|released|rejected|closed|resolved|won'?t (?:do|fix)|duplicate|cancel+ed|отклонен[оа]?|закрыт[оа]?|готово|выполнен[оа]?|сделан[оа]?|отменен[оа]?|решен[оа]?)$/iu;
function question(command=''){const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'');return ASK.test(text)&&CHOOSE.test(text);}
// Items of the last assistant answer: «KEY — title (Status)».
function items(text=''){return String(text).split('\n').map(line=>ITEM.exec(line)).filter(Boolean).map(([,key,title,status=''])=>({key,title:title.trim(),status:status.trim()}));}
const open=rows=>rows.filter(r=>!CLOSED.test(r.status));
module.exports={
 name:'list-followup',
 question,items,open,
 setup(s){
  const model=async(system,data)=>{const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,options:{temperature:0.2,num_predict:900},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]})});return String(response?.message?.content||'').trim();};
  const turn=async command=>{
   if(!question(command))return null;
   const topic=s.dialogue.active();const last=topic?.messages?.filter(m=>m.role==='assistant').at(-1);
   const all=items(last?.text);if(all.length<2)return null; // no list in this chat: the usual pipeline answers
   const rows=open(all);let text;
   if(!rows.length)text='В показанном списке все задачи уже закрыты (Done, Released, Rejected). Попроси «покажи незавершённые задачи» — выберу из них.';
   else if(!s.settings.model)text='Незавершённые из списка: '+rows.map(r=>r.key).join(', ')+'. Чтобы расставить порядок, настрой локальную модель.';
   else{
    s.requestProgress.report('Выбираю, с чего начать');
    text=require('../informal.cjs').informal(await model('Ты Петя, рабочий ассистент. Пользователь спрашивает, какие задачи из показанного списка сделать сначала. Выбери 3–5 задач и расставь их по порядку, к каждой — одна короткая причина по её названию и статусу (уже в работе, на ревью, ждёт решения, баг у игроков, обещано пользователям и т. п.). Используй только эти задачи, не придумывай сроки, приоритеты и данные, которых нет. Если данных мало для уверенного выбора — скажи это одной фразой в конце. Формат: нумерованный список «KEY — название: причина». На «ты», без вступлений и обращений.',{question:command,tasks:rows.slice(0,40)}));
    if(!text)text='Не получилось выбрать: модель не ответила. Незавершённые из списка: '+rows.map(r=>r.key).join(', ')+'.';
   }
   const skipped=all.length-rows.length;if(skipped&&rows.length)text+='\n\nЗакрытые задачи из списка не учитывал: '+skipped+'.';
   s.dialogue.rememberAction(command,text);const t=s.dialogue.active();const msg=t?.messages?.at(-1);if(msg?.role==='assistant')msg.by='выбор из списка';s.dialogue.persist();
   return {handled:true,text,by:'выбор из списка',topicId:t?.id,topicTitle:t?.title,messages:t?.messages};
  };
  return {listFollowup:{turn}};
 }
};
