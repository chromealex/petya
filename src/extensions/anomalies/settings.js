// Settings of «Аномалии»: the daily check (time, or off), sensitivity, which sources are connected and the
// «Не показывать такое» rules (each removable).
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='anomalies';
 card.innerHTML='<h2>Аномалии</h2><p>«Что необычного вчера?», «есть аномалии за неделю?». Каждый день сравнивается с теми же днями недели за 4 прошлые недели; мелкие колебания и малые числа не считаются. Нет данных — это не аномалия.</p>'+
  '<p class="small an-sources"></p>'+
  '<label><input type="checkbox" class="an-daily-on">Проверять каждый день и присылать уведомление</label>'+
  '<label>Время проверки<input type="time" class="an-daily-time" value="09:00"></label>'+
  '<label>Чувствительность<select name="anomaliesSensitivity"><option value="low">Низкая — только сильные отклонения</option><option value="normal">Обычная</option><option value="high">Высокая — и небольшие отклонения</option></select></label>'+
  '<button type="button" class="an-save">Сохранить</button>'+
  '<h3>Скрытые аномалии</h3><div class="an-rules"></div>'+
  '<p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]'),call=(method,...args)=>window.petya.feature('anomalies',method,...args);
 const say=(text,kind='')=>{status.textContent=text;status.className='connection-status'+(kind?' '+kind:'');};
 function rules(list){
  const box=q('.an-rules');box.replaceChildren();
  if(!list.length){const p=document.createElement('p');p.className='small';p.textContent='Нет правил. Добавляются кнопкой «Не показывать такое» в карточке.';box.append(p);return;}
  for(const r of list){
   const row=document.createElement('div');row.className='an-rule';row.style.cssText='display:flex;align-items:center;gap:8px;justify-content:space-between';
   const label=document.createElement('span');label.textContent=r.label;label.setAttribute('data-no-i18n','');
   const remove=document.createElement('button');remove.type='button';
   if(window.asDeleteButton)window.asDeleteButton(remove,'Удалить правило');else{remove.textContent='×';remove.setAttribute('aria-label','Удалить правило');}
   remove.onclick=async()=>{try{rules((await call('unmute',r.id)).rules);}catch(e){say(e.message,'error');}};
   row.append(label,remove);box.append(row);
  }
 }
 async function refresh(){
  try{
   const st=await call('status');
   q('.an-sources').textContent=st.kinds.length?'Источники: '+st.kinds.map(k=>k.name).join(', ')+'.':'Нет подключённых источников: подключите метрики игры (AppMetrica), крэши, поддержку, рекламу или отзывы в сторах — до этого ежедневная проверка не запускается.';
   q('.an-daily-on').checked=!!st.daily;q('.an-daily-time').value=st.daily||'09:00';q('[name=anomaliesSensitivity]').value=st.sensitivity;
   rules(st.rules);say(st.kinds.length?'':'Ждёт источник данных.',st.kinds.length?'connected':'');
  }catch(e){say(e.message,'error');}
 }
 q('.an-save').onclick=async()=>{
  try{await window.petya.saveSettings({anomaliesDaily:q('.an-daily-on').checked?(q('.an-daily-time').value||'09:00'):'',anomaliesSensitivity:q('[name=anomaliesSensitivity]').value});await refresh();say('Сохранено.','connected');}
  catch(e){say(e.message,'error');}
 };
 for(const ev of ['petya-extensions-changed','petya-settings-displayed'])document.addEventListener(ev,refresh);
 refresh();
})();
