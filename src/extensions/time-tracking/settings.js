// «Учёт времени» settings: the activity tracker's switch (off by default) with what exactly is collected, how often,
// how long it is kept, the apps whose window titles are never stored, pause / resume and deleting the whole history.
// The tracker itself is the shared foundation (src/features/activity.cjs); this card is its control panel.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const activity=(method,...args)=>window.petya.feature('activity',method,...args);
 const card=el('article','card');card.dataset.extension='time-tracking';
 card.append(el('h2',null,'Учёт времени'));
 const about=el('p',null,'Когда учёт включён, Петя раз в несколько секунд запоминает название приложения на переднем плане и заголовок его окна. Содержимое окон, нажатия клавиш и снимки экрана не собираются. Всё хранится только на этом компьютере и никуда не отправляется.');
 const row=(label,control)=>{const l=el('label');l.style.cssText='display:flex;gap:8px;align-items:center;margin:6px 0';l.append(control,el('span',null,label));return l;};
 // No form name: the shared settings form would send a checkbox as «on»; the switch goes through the tracker's IPC.
 const enabled=el('input');enabled.type='checkbox';
 const select=(name,options)=>{const s=el('select');s.name=name;for(const [v,t] of options){const o=el('option',null,t);o.value=v;s.append(o);}return s;};
 const interval=select('activityInterval',[['15','каждые 15 секунд'],['30','каждые 30 секунд'],['60','раз в минуту']]);
 const idle=select('activityIdle',[['180','3 минуты'],['300','5 минут'],['600','10 минут']]);
 const keep=select('activityRetention',[['7','7 дней'],['14','14 дней'],['30','30 дней'],['90','90 дней']]);
 const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;margin:8px 0';
 grid.append(el('span',null,'Как часто смотреть'),interval,el('span',null,'Простой без мыши и клавиатуры не считать после'),idle,el('span',null,'Хранить историю'),keep);
 const privateLabel=el('p','small','Не сохранять заголовки окон этих приложений и окон с этими словами (по одному в строке). Менеджеры паролей, банки и приватные вкладки скрываются всегда.');
 privateLabel.style.color='var(--muted)';
 const privateApps=el('textarea');privateApps.name='activityPrivateApps';privateApps.rows=3;privateApps.placeholder='Telegram\nмедицин';privateApps.style.cssText='width:100%;box-sizing:border-box';
 const state=el('p');state.setAttribute('role','status');
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 const pause=el('button',null,'Пауза на час');pause.type='button';
 const pauseAll=el('button',null,'Пауза до возобновления');pauseAll.type='button';
 const resume=el('button',null,'Продолжить');resume.type='button';
 const wipe=(window.deleteButton||((label,fn)=>{const b=el('button',null,label);b.type='button';b.onclick=fn;return b;}))('Удалить всю историю активности',async()=>{
  if(!confirm('Удалить всю историю активности? Это нельзя отменить.'))return;
  try{await activity('wipe');note('История активности удалена.');refresh();}catch(e){note(e.message);}
 });
 controls.append(pause,pauseAll,resume,wipe);
 card.append(about,row('Учитывать, какие приложения и окна открыты',enabled),grid,privateLabel,privateApps,controls,state);
 document.getElementById('settings-form').append(card);
 let message='';
 const note=text=>{message=text;state.textContent=text;};
 const save=async values=>{try{await window.petya.saveSettings(values);return true;}catch(e){note(e.message);return false;}};
 const describe=st=>{
  if(!st.enabled)return 'Учёт выключен.';
  const parts=[st.paused?(st.pausedUntil&&st.pausedUntil-Date.now()<86400000?'На паузе до '+new Date(st.pausedUntil).toLocaleTimeString(window.petyaLocale||'ru-RU',{hour:'2-digit',minute:'2-digit'}):'На паузе'):'Учёт идёт'];
  if(st.current&&!st.paused)parts.push('сейчас: '+st.current.app);
  if(st.days)parts.push('история за '+st.days+' дн. ('+Math.max(1,Math.round(st.bytes/1024))+' КБ)');
  if(st.last?.permission===false)parts.push('заголовки окон не видны: нет доступа к записи экрана в настройках системы');
  if(!st.supported)parts.push('на этом компьютере активное окно не определяется');
  return parts.join(' · ')+'.';
 };
 async function refresh(){
  try{
   const st=await activity('status');
   enabled.checked=st.enabled;interval.value=String(st.interval);idle.value=String(st.idle);keep.value=String(st.retention);
   for(const c of [interval,idle,keep,privateApps,pause,pauseAll])c.disabled=!st.enabled;
   pause.hidden=pauseAll.hidden=!!st.paused;resume.hidden=!st.paused;
   state.textContent=(message?message+' ':'')+describe(st);message='';
  }catch(e){state.textContent=e.message;}
 }
 enabled.onchange=async()=>{if(await activity('enable',enabled.checked).then(()=>true,e=>{note(e.message);return false;}))note(enabled.checked?'Учёт включён.':'Учёт выключен. История осталась — её можно удалить кнопкой ниже.');else enabled.checked=!enabled.checked;refresh();};
 for(const s of [interval,idle,keep])s.onchange=async()=>{await save({[s.name]:s.value});refresh();};
 privateApps.onchange=async()=>{if(await save({activityPrivateApps:privateApps.value}))note('Список сохранён. Уже записанные заголовки не меняются — удалите историю, если нужно.');refresh();};
 pause.onclick=async()=>{await activity('pause',60).catch(e=>note(e.message));refresh();};
 pauseAll.onclick=async()=>{await activity('pause',0).catch(e=>note(e.message));refresh();};
 resume.onclick=async()=>{await activity('resume').catch(e=>note(e.message));refresh();};
 window.petya.settings?.().then(s=>{privateApps.value=s?.activityPrivateApps||'';}).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
