// «Отсутствия» settings: whether out-of-office events of the calendar app count, where the records are kept, and
// deleting every people record of this company. The records are the shared foundation (src/features/people.cjs).
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const people=(method,...args)=>window.petya.feature('people',method,...args);
 const card=el('article','card');card.dataset.extension='absences';
 card.append(el('h2',null,'Отсутствия'));
 card.append(el('p',null,'Отпуска, больничные и отгулы коллег из «Команды». Отметки из чата сохраняются только после «Сохранить» на карточке и хранятся на этом компьютере (зашифрованными, если система это позволяет). События «нет на месте» из календаря читаются при вопросе и не сохраняются. Никуда не отправляется.'));
 // No form name on the switch: the shared settings form would send a checkbox as «on».
 const calendar=el('input');calendar.type='checkbox';
 const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center;margin:6px 0';label.append(calendar,el('span',null,'Учитывать отпуска и события «нет на месте» из приложения «Календарь»'));
 const state=el('p');state.setAttribute('role','status');
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 const wipe=(window.deleteButton||((text,fn)=>{const b=el('button',null,text);b.type='button';b.onclick=fn;return b;}))('Удалить все записи о коллегах',async()=>{
  if(!await window.petyaConfirm('Удалить все отметки об отсутствиях, заметки 1:1 и договорённости этой компании? «Команда» останется.'))return;
  try{await people('wipe','all');message='Записи удалены.';}catch(e){message=e.message;}refresh();
 });
 controls.append(wipe);
 card.append(label,controls,state);
 document.getElementById('settings-form').append(card);
 let message='';
 async function refresh(){
  try{
   const st=await people('status');
   calendar.checked=st.calendar;
   const parts=['отметок об отсутствиях: '+st.absences];
   if(st.sources.length)parts.push('источники: '+st.sources.map(x=>x.name).join(', '));else parts.push('календарь не подключён');
   if(st.people&&!st.encrypted)parts.push('без шифрования: хранилище ключей системы недоступно');
   state.textContent=(message?message+' ':'')+parts.join(' · ')+'.';message='';
  }catch(e){state.textContent=e.message;}
 }
 calendar.onchange=async()=>{try{await window.petya.saveSettings({peopleCalendar:String(calendar.checked)});}catch(e){message=e.message;}refresh();};
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
