// Settings → «Расширения»: where third-party extensions come from and the development folder. Petya loads the
// extension in that folder as an external one (marked «Разработка» in the catalog) and reloads it on every save,
// so an extension is built against an installed Petya without rebuilding it (docs/extensions.md).
(()=>{
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const card=el('article','','card extension-development');card.id='extension-development';card.setAttribute('aria-labelledby','extension-development-title');
 const title=el('h2','Расширения');title.id='extension-development-title';
 const intro=el('p','Расширения добавляются в каталоге приложений. Сторонние устанавливаются оттуда же: «Установить из файла…» — папка или .zip.','small');
 const catalog=el('button','Открыть каталог');catalog.type='button';catalog.onclick=()=>window.openAppCatalog?.();
 const dev=el('h3','Папка разработки'),about=el('p','Петя загрузит расширение из этой папки как стороннее и будет перезагружать его при каждом сохранении файлов — без пересборки и перезапуска. Ошибки загрузки приходят в уведомления с файлом и строкой.','small');
 const state=el('p','','extension-development-state');state.setAttribute('role','status');
 const problems=el('ul','','extension-development-problems');
 const actions=el('div','','actions');
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{paint(await fn());}catch(error){notice(error.message,true);}finally{b.disabled=false;}};return b;};
 const choose=button('Выбрать папку…',()=>window.petya.feature('extensionUI','chooseDevFolder'));
 const reload=button('Перезагрузить',()=>window.petya.feature('extensionUI','reloadDev'));
 const off=button('Отключить',()=>window.petya.feature('extensionUI','clearDevFolder'));
 actions.append(choose,reload,off);
 card.append(title,intro,el('div','','actions'),dev,about,state,problems,actions);card.children[2].append(catalog);
 function paint(status){
  if(!status)return;
  state.replaceChildren();problems.replaceChildren();
  if(!status.folder){state.textContent='Папка не выбрана.';reload.hidden=off.hidden=true;choose.textContent='Выбрать папку…';return;}
  const path=el('code',status.folder);path.dataset.noI18n='';
  state.append(status.id?el('span','Загружено «'+status.name+'» из '):el('span','Не загружено: '),path);
  if(status.id){const id=el('span',' ('+status.id+')');id.dataset.noI18n='';state.append(id);}
  for(const p of status.problems){const li=el('li');const text=el('span',(p.where?p.where+': ':'')+p.message);text.dataset.noI18n='';li.append(text);problems.append(li);}
  reload.hidden=off.hidden=false;choose.textContent='Другая папка…';
 }
 const refresh=()=>window.petya.feature('extensionUI','devStatus').then(paint).catch(()=>{});
 const place=()=>{const form=document.getElementById('settings-form');if(form&&!card.isConnected)form.after(card);};
 place();refresh();
 document.addEventListener('petya-extensions-changed',refresh);
 window.petyaEvents?.onExtensionRuntime?.(()=>setTimeout(refresh,50));
 window.extensionDevelopment={refresh,paint};
})();
