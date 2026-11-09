// Settings of «Генератор уровней»: which RTS engine is used (the user's own install wins; otherwise Petya's
// download, with «Скачать» / «Обновить»), an engine folder of one's own, and the RTS project of the current
// Petya project.
(()=>{
 if(document.querySelector('#settings-form [data-extension="rts-levels"]'))return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('rtsLevels',method,...args);
 const MB=n=>Math.max(1,Math.round(n/1e6)).toLocaleString(window.petyaLocale||'ru-RU')+' '+(/^ru/i.test(window.petyaLocale||'ru')?'МБ':'MB');
 const card=el('article','card rtsl-settings');card.dataset.extension='rts-levels';
 card.append(el('h2',null,'Генератор уровней'),el('p',null,'Карты делает движок RTS через свой MCP-сервер rtsmcp. Если движок уже установлен — rtsmcp в PATH, папка ~/RTSEngine или путь ниже, — Петя берёт его и ничего не скачивает. Пишет карты только в папку вашего проекта и только после подтверждения; файлы движка не меняет.'));
 const engineLine=el('p','small');engineLine.setAttribute('role','status');engineLine.dataset.noI18n='';
 const engineWhere=el('p','small');
 const row=el('div','row');
 const download=el('button',null,'Скачать движок');download.type='button';
 const update=el('button',null,'Обновить');update.type='button';
 const cancel=el('button','quiet','Отменить');cancel.type='button';
 const check=el('button','quiet','Проверить обновления');check.type='button';
 row.append(download,update,cancel,check);
 const pathLabel=el('label');pathLabel.append(el('span',null,'Своя папка движка или путь к rtsmcp'));
 const pathRow=el('div','row');const input=el('input');input.type='text';input.placeholder='Например: ~/RTSEngine';input.spellcheck=false;
 const apply=el('button','quiet','Применить');apply.type='button';pathRow.append(input,apply);pathLabel.append(pathRow);
 const projectLine=el('p','small');
 const choose=el('button','quiet','Выбрать папку проекта…');choose.type='button';
 const message=el('p','small');message.setAttribute('role','status');
 card.append(engineWhere,engineLine,row,pathLabel,projectLine,choose,message);
 document.getElementById('settings-form').append(card);
 const say=text=>{message.textContent=text||'';};
 function paint(st){
  if(!st)return;
  const e=st.engine;
  engineWhere.textContent=e?'Движок: '+e.label+(e.version?' · '+e.version+' ('+e.commit+')':'')+(e.editor?' · есть редактор':' · без редактора'):'Движок не найден.';
  engineLine.textContent=e?e.rtsmcp:st.unsupported||(st.package?'Готовая сборка '+st.package.version+' ('+st.package.commit+') · '+MB(st.package.size):st.error||'');
  download.hidden=!!e||!st.package||st.busy;
  download.textContent=st.package?'Скачать движок · '+MB(st.package.size):'Скачать движок';
  update.hidden=!st.update||st.busy;
  if(st.update)update.textContent='Обновить до '+st.update.version+' ('+st.update.commit+') · '+MB(st.update.size);
  cancel.hidden=!st.busy;
  check.hidden=e?.source!=='download'||st.busy;
  if(document.activeElement!==input)input.value=st.settingsPath||'';
  if(st.settingsMissing)say('По указанному пути rtsmcp не найден.');
  projectLine.textContent=st.folder?'Проект для «'+st.petyaProject+'»: '+st.folder:'Для «'+st.petyaProject+'» RTS-проект не выбран — спрошу при первой карте.';
 }
 const refresh=(options)=>call('status',options).then(paint).catch(e=>say(e.message));
 const run=fn=>async()=>{try{await fn();}catch(e){say(e.message);}finally{refresh();}};
 download.onclick=run(async()=>{say('Скачиваю движок — прогресс в центре уведомлений.');const p=call('download');refresh();const r=await p;say(r?.present?'Движок готов.':r?.cancelled?'Загрузка отменена.':'');});
 update.onclick=run(async()=>{say('Обновляю движок — прогресс в центре уведомлений.');const p=call('update');refresh();const r=await p;say(r?.present?'Движок обновлён.':'');});
 cancel.onclick=run(()=>call('cancelDownload'));
 check.onclick=run(async()=>{const st=await call('status',{check:true});paint(st);say(st.update?'Есть новая сборка.':'Установлена последняя сборка.');});
 apply.onclick=run(async()=>{paint(await call('setEnginePath',input.value));say(input.value.trim()?'Путь к движку сохранён.':'Своя папка движка убрана.');});
 choose.onclick=run(async()=>{paint(await call('chooseProject'));});
 document.addEventListener('petya-settings-displayed',()=>refresh());
 refresh();
})();
