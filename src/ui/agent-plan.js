// Petya's agents in the chat: the plan message shows every agent with its state, a link to its chat
// and a stop button; it updates live from chat-job events and stays in history as a compact list.
(()=>{
 const LABELS={queued:'В очереди',running:'Работает',done:'Готово',attention:'Нужно внимание',cancelled:'Остановлен',action:'Ждёт тебя'};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 function render(plan){
  const box=el('div',null,'agent-plan');box.dataset.planId=plan.id;
  const head=el('div',null,'agent-plan-head');
  const done=plan.tasks.filter(t=>t.state==='done').length,running=plan.state!=='done';
  head.append(el('span',running?(plan.state==='summarizing'?'Собираю общий ответ':'Агенты работают · готово '+done+' из '+plan.tasks.length):'Агенты закончили · '+done+' из '+plan.tasks.length,'agent-plan-title'));
  if(running&&plan.tasks.some(t=>t.topicId&&['queued','running'].includes(t.state))){const stop=el('button','Остановить всех','agent-plan-stop');stop.type='button';stop.onclick=async()=>{stop.disabled=true;for(const t of plan.tasks)if(t.topicId&&['queued','running'].includes(t.state)){try{await window.petya.chatAnswerStop(t.topicId);}catch{}}};head.append(stop);}
  const list=el('ol',null,'agent-plan-list');
  for(const t of plan.tasks){const li=el('li',null,'agent-task');li.dataset.state=t.state;
   li.append(el('span','','agent-dot'),el('span',t.title,'agent-name'),el('span',t.state==='running'&&t.label?t.label:LABELS[t.state]||t.label||'','agent-state'));
   li.title=t.request;
   if(t.topicId){const open=el('button','Открыть','agent-open');open.type='button';open.onclick=()=>selectDialogueTopic(t.topicId).catch(e=>notice(e.message,true));li.append(open);}
   else if(t.state==='action'){const run=el('button','Запустить','agent-open');run.type='button';run.title='Вставить просьбу в поле ввода, чтобы проверить и отправить';run.onclick=()=>{$('command').value=t.request;$('command').dispatchEvent(new Event('input'));$('command').focus();};li.append(run);}
   list.append(li);}
  box.append(head,list);return box;
 }
 const link=document.createElement('link');link.rel='stylesheet';link.href='agent-plan.css';document.head.append(link);
 // Wrap the message renderer once every page script has run (this file may load before message-format.js).
 function install(){const original=window.renderMessage;if(typeof original!=='function'||original.agentPlans)return;
  const wrapped=function(message){const node=original(message);if(message?.agentPlan?.tasks?.length){const content=node.querySelector('.message-content');(content||node).append(render(message.agentPlan));}return node;};wrapped.agentPlans=true;window.renderMessage=wrapped;
  if(typeof chatHistory!=='undefined'&&chatHistory.some(m=>m.agentPlan)&&typeof showDialogueMessages==='function')showDialogueMessages(chatHistory);}
 if(document.readyState==='complete')install();else window.addEventListener('load',install);
 document.addEventListener('petya-chat-job',event=>{const plan=event.detail?.agentPlan;if(!plan||event.detail.topicId!==topicSelect.value)return;
  for(const old of document.querySelectorAll('.agent-plan[data-plan-id="'+CSS.escape(plan.id)+'"]'))old.replaceWith(render(plan));
  const history=typeof chatHistory!=='undefined'?chatHistory:[];const m=history.find(x=>x.agentPlan?.id===plan.id);if(m)m.agentPlan=plan;});
})();
