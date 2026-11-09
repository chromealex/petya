// «Подписки и продления» settings: the switch for reading records from mail (off by default) with what exactly is
// read and kept, how far back the first reading goes, whether the local model may read what the parsers did not,
// reading now, and deleting every stored record. The records are the shared foundation (src/features/mail-records.cjs).
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const records=(method,...args)=>window.petya.feature('mailRecords',method,...args);
 const card=el('article','card');card.dataset.extension='subscriptions';
 card.append(el('h2',null,'Подписки и продления'));
 card.append(el('p',null,'Когда чтение включено, Петя просматривает в подключённой почте только письма, похожие на чеки, подписки, брони и продления, и сохраняет из них продавца, сумму, даты и ссылку на письмо. Записи хранятся только на этом компьютере (зашифрованными, если система это позволяет). Письма не меняются и никуда не отправляются.'));
 const row=(label,control)=>{const l=el('label');l.style.cssText='display:flex;gap:8px;align-items:center;margin:6px 0';l.append(control,el('span',null,label));return l;};
 // No form names on the switches: the shared settings form would send a checkbox as «on».
 const enabled=el('input');enabled.type='checkbox';
 const useModel=el('input');useModel.type='checkbox';
 const days=el('select');days.name='mailRecordsDays';
 for(const [v,t] of [['90','3 месяца'],['180','полгода'],['365','год'],['730','два года']]){const o=el('option',null,t);o.value=v;days.append(o);}
 const daysRow=el('div');daysRow.style.cssText='display:flex;gap:10px;align-items:center;margin:6px 0';daysRow.append(el('span',null,'При первом чтении смотреть письма за'),days);
 const state=el('p');state.setAttribute('role','status');
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 const scan=el('button',null,'Прочитать почту сейчас');scan.type='button';
 const wipe=(window.deleteButton||((label,fn)=>{const b=el('button',null,label);b.type='button';b.onclick=fn;return b;}))('Удалить все записи из почты',async()=>{
  if(!await window.petyaConfirm('Удалить все найденные в почте подписки, чеки, брони и продления? Письма останутся в почте.'))return;
  try{await records('wipe');note('Записи удалены.');refresh();}catch(e){note(e.message);}
 });
 controls.append(scan,wipe);
 card.append(row('Искать подписки, чеки, брони и продления в почте',enabled),daysRow,row('Разрешить локальной модели читать письма, которые не разобрал код (каждое поле сверяется с цитатой из письма)',useModel),controls,state);
 document.getElementById('settings-form').append(card);
 let message='';
 const note=text=>{message=text;state.textContent=text;};
 async function refresh(){
  try{
   const st=await records('status');
   enabled.checked=st.enabled;days.value=String(st.days);
   const settings=await window.petya.settings?.().catch(()=>null);useModel.checked=settings?.mailRecordsModel!=='false';
   for(const c of [days,useModel,scan])c.disabled=!st.enabled;scan.disabled=!st.enabled||st.running||!st.connected;
   const parts=[st.enabled?'Чтение включено':'Чтение выключено'];
   if(!st.connected)parts.push('почта не подключена — добавьте аккаунт в «Подключения → Почта»');
   parts.push('записей: '+st.records);
   if(st.scanned)parts.push('последнее чтение: '+(window.relativeTime?window.relativeTime(new Date(st.scanned)):new Date(st.scanned).toLocaleString(window.petyaLocale||'ru-RU')));
   if(st.running)parts.push('идёт чтение');
   if(st.records&&!st.encrypted)parts.push('без шифрования: хранилище ключей системы недоступно');
   state.textContent=(message?message+' ':'')+parts.join(' · ')+'.';message='';
  }catch(e){state.textContent=e.message;}
 }
 enabled.onchange=async()=>{try{await records('enable',enabled.checked);note(enabled.checked?'Чтение включено. Нажмите «Прочитать почту сейчас» или спросите «за что я плачу каждый месяц».':'Чтение выключено. Найденные записи остались — их можно удалить кнопкой ниже.');}catch(e){note(e.message);enabled.checked=!enabled.checked;}refresh();};
 useModel.onchange=async()=>{try{await window.petya.saveSettings({mailRecordsModel:String(useModel.checked)});}catch(e){note(e.message);}refresh();};
 days.onchange=async()=>{try{await window.petya.saveSettings({mailRecordsDays:days.value});}catch(e){note(e.message);}refresh();};
 scan.onclick=async()=>{scan.disabled=true;note('Читаю почту…');try{const r=await records('scan');note('Прочитано писем: '+r.read+', новых записей: '+r.added+'.');}catch(e){note(e.message);}refresh();};
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
 // A reading in progress survives a window reload in the notification center (the main process publishes the same id).
 records('status').then(st=>{if(st?.running)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'mail-records-scan',title:'Записи из почты',text:'Читаю письма с чеками, подписками и бронями…',busy:true,kind:'info',version:'restore'}}));}).catch(()=>{});
})();
