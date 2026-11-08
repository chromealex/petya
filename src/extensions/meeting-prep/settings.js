// «Подготовка к встрече» settings: the reminder «Через 10 минут: … — открыть подготовку» (off by default) and what
// the preparation reads. Also gives the reminders in the notification center their «Открыть подготовку» action
// (the main process publishes them without functions) and restores them after a window reload.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('meetingPrep',method,...args);
 const card=el('article','card');card.dataset.extension='meeting-prep';
 card.append(el('h2',null,'Подготовка к встрече'),el('p',null,'Встреча и участники берутся из «Календаря», прошлые встречи — из записей и сводок Пети, статус задач — из Jira или Asana (только чтение), треды — из уже собранного контекста Slack.'));
 const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center';
 const remind=el('input');remind.type='checkbox';remind.name='meetingPrepRemind';
 label.append(remind,el('span',null,'Напоминать за 10 минут до встречи и предлагать подготовку'));
 const sources=el('p','small');sources.style.color='var(--muted)';
 const status=el('p');status.setAttribute('role','status');
 card.append(label,sources,status);
 document.getElementById('settings-form').append(card);
 async function refresh(){
  try{
   const st=await call('status');remind.checked=st.remind;
   const parts=[st.calendar?(st.connected?'Календарь подключён':'Календарь добавлен, но нет доступа — откройте его настройки'):'Нужен «Календарь»: добавьте его в каталоге'];
   const trackers=[st.trackers?.jira&&'Jira',st.trackers?.asana&&'Asana'].filter(Boolean);
   parts.push(trackers.length?'статус задач: '+trackers.join(', '):'трекер не подключён — задачи без статуса');
   sources.textContent=parts.join(' · ')+'.';
  }catch(e){status.textContent=e.message;}
 }
 remind.onchange=async()=>{
  try{await window.petya.saveSettings({meetingPrepRemind:String(remind.checked)});status.textContent=remind.checked?'Напомню за 10 минут до начала встречи.':'Напоминания выключены.';}
  catch(e){status.textContent=e.message;remind.checked=!remind.checked;}
 };
 window.petyaEvents?.onWindowShown?.(refresh);refresh();

 // Notification center: the reminder with «Открыть подготовку».
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 function reminder(item){
  if(!item||!String(item.id||'').startsWith('meeting-prep:'))return;
  const {prep,...rest}=item;
  put({...rest,actions:[['Открыть подготовку',async()=>{
   if(typeof view==='function')view('home');
   document.querySelector('.notification-center')?.setAttribute('hidden','');
   await (window.resultKit?.ask||(()=>{}))('Подготовь меня к встрече «'+String(prep||'').slice(0,120)+'»',{send:true});
  }]]});
 }
 window.petyaEvents?.onExtensionInstall?.(reminder);
 call('reminders').then(list=>list.forEach(reminder)).catch(()=>{});
})();
