// Settings of «Поиск файлов по смыслу»: the switch of the file index, its folders (project folders and added ones),
// the model, pause/refresh and the wipe; and Petya's own optional collections (chats, meetings), off by default.
// Everything stays on this computer; what each collection reads is written next to its switch.
(()=>{
 if(document.querySelector('#settings-form [data-extension="file-search"]'))return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('fileSearch',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const card=el('article','card fs-settings');card.dataset.extension='file-search';
 card.append(el('h2',null,'Поиск файлов по смыслу'),el('p',null,'Петя читает текст файлов в выбранных папках, режет его на фрагменты и считает смысл каждого локальной моделью через Ollama. Индекс хранится только на этом компьютере в данных компании и никуда не отправляется.'));
 const enable=el('label');const toggle=el('input');toggle.type='checkbox';enable.append(toggle,el('span',null,'Индексировать папки'));
 const collects=el('p','fs-collect');
 const projectLabel=el('label');const project=el('input');project.type='checkbox';projectLabel.append(project,el('span',null,'Папки проектов компании'));
 const list=el('ul','fs-list');
 const add=el('button','quiet','Добавить папку');add.type='button';
 const model=el('p','small');model.setAttribute('role','status');
 const stats=el('p','small');stats.setAttribute('role','status');
 const row=el('div','fs-row');
 const pause=el('button','quiet','Пауза');pause.type='button';
 const refresh=el('button','quiet','Обновить сейчас');refresh.type='button';
 const download=el('button','quiet','Скачать модель');download.type='button';download.hidden=true;
 const wipe=window.deleteButton?window.deleteButton('Стереть индекс'):el('button','quiet','Стереть индекс');
 row.append(pause,refresh,download,wipe);
 const others=el('div');others.append(el('h3',null,'Другие коллекции для поиска по смыслу'),el('p','small','Выключены, пока вы их не включите. Нужны для поиска по всему и для подсказок по прошлым разговорам.'));
 const otherList=el('div');others.append(otherList);
 const message=el('p','small');message.setAttribute('role','status');
 card.append(enable,collects,projectLabel,list,add,model,stats,row,others,otherList,message);
 document.getElementById('settings-form').append(card);
 const say=text=>{message.textContent=text||'';};
 const run=fn=>async()=>{try{paint(await fn());}catch(e){say(e.message);}};

 function paint(st){
  if(!st)return;
  toggle.checked=!!st.enabled;project.checked=!!st.project;
  collects.textContent='Читается: код, Markdown, текстовые файлы, PDF, Word, PowerPoint и Excel. Пропускаются node_modules, Library, папки сборки, скрытые папки, всё из .gitignore, ключи и .env; похожий на пароли текст заменяется на «[скрыто]».';
  list.replaceChildren();
  for(const f of st.folders||[]){
   const li=el('li');const p=el('span',null,f.path);p.dataset.noI18n='';p.title=f.path;li.append(p);
   if(!f.own){const tag=el('small',null,f.project?'проект '+f.project:'проект');tag.dataset.noI18n='';li.append(tag);}
   else{const b=el('button','quiet','Убрать');b.type='button';b.onclick=run(()=>call('removeFolder',f.path));li.append(b);}
   if(!f.exists)li.append(el('small',null,'нет на диске'));
   list.append(li);
  }
  if(!(st.folders||[]).length)list.append(el('li',null,'Папок нет: добавьте папку или укажите папку проекта.'));
  const ix=st.index||{};
  model.textContent=(ix.modelInstalled?'Модель '+ix.model+' установлена.':'Модель '+ix.model+' не скачана ('+Math.round((ix.modelBytes||0)/1e6)+' МБ).')+(ix.ollama?'':' Ollama не запущен.');
  download.hidden=!!ix.modelInstalled||!!ix.preparing;
  const f=st.files||{};
  const busy=ix.phase&&ix.phase!=='idle';
  stats.textContent=(f.items?'В индексе '+f.items.toLocaleString(locale())+' файлов, '+(f.chunks||0).toLocaleString(locale())+' фрагментов, '+Math.max(1,Math.round((f.bytes||0)/1e6)).toLocaleString(locale())+' МБ на диске.':'Индекс пуст.')
   +(busy?' Сейчас: '+(ix.paused?'пауза':ix.phase==='listing'?'собираю список':'индексирую '+(ix.done||0)+' из '+(ix.total||0))+'.':'')+(f.error?' Ошибка: '+f.error:'');
  pause.textContent=ix.paused?'Продолжить':'Пауза';pause.dataset.paused=String(!!ix.paused);
  otherList.replaceChildren();
  for(const c of st.others||[]){
   const label=el('label');const box=el('input');box.type='checkbox';box.checked=!!c.enabled;
   box.onchange=run(()=>call('enableOther',c.id,box.checked));
   label.append(box,el('span',null,c.name+(c.items?' · '+c.items.toLocaleString(locale()):'')));
   otherList.append(label,el('p','fs-collect',c.collects));
  }
 }
 const refreshState=()=>call('status').then(paint).catch(e=>say(e.message));
 toggle.onchange=run(async()=>{const st=await call('enable',toggle.checked);say(toggle.checked?'Индекс включён. Если модели нет, она скачается — прогресс в центре уведомлений.':'Индекс выключен. Уже собранные данные остаются, пока вы их не сотрёте.');return st;});
 project.onchange=run(()=>call('setProject',project.checked));
 add.onclick=run(()=>call('addFolder'));
 refresh.onclick=run(async()=>{const st=await call('refresh');say('Обновляю индекс в фоне.');return st;});
 download.onclick=run(async()=>{await call('prepareModel');say('Загрузка модели началась — прогресс в центре уведомлений.');return call('status');});
 pause.onclick=run(()=>call(pause.dataset.paused==='true'?'resume':'pause'));
 wipe.onclick=run(async()=>{
  if(!await window.petyaConfirm(window.t?window.t('Стереть индекс по смыслу? Все векторы и фрагменты текста удалятся, коллекции выключатся. Сами файлы не трогаю.'):'Стереть индекс по смыслу? Все векторы и фрагменты текста удалятся, коллекции выключатся. Сами файлы не трогаю.'))return call('status');
  const st=await call('wipe');say('Индекс стёрт.');return st;
 });
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='file-search')refreshState();});
 window.petyaEvents?.onWindowShown?.(refreshState);refreshState();
})();
