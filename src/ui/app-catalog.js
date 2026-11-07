(()=>{
 const descriptions={unity:'Поиск и просмотр префабов открытого проекта',telegram:'Сообщения и обсуждения команды',slack:'Каналы, сообщения и треды',notion:'Страницы и базы знаний',asana:'Поручения и задачи',jira:'Задачи, версии и отчёты',confluence:'Документы и пространства',ai:'Передача задач агентам',googleplay:'Ошибки и ANR приложений',gmail:'Почта и календарь',web:'Поиск по открытым источникам'};
 const trash='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
 const cross='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
 window.petyaIcons={trash,cross};
 const glyph={telegram:'➤',asana:'∴',ai:'✧',googleplay:'▷',gmail:'@',web:'◎'};
 window.removeAddedApp=async id=>{const item=optionalModules.find(([key])=>key===id);if(item){renderModules(await window.petya.saveSettings({['module_'+id]:'false'}));}else await window.extensionHost.remove(id);document.dispatchEvent(new Event('petya-extensions-changed'));notice('Удалено из добавленных. Можно подключить снова через каталог.');};
 async function removeButtons(){for(const [id,name] of optionalModules){const card=document.querySelector('[data-service="'+id+'"]'),heading=card?.querySelector('h2');if(!heading||card.querySelector('.remove-added-app'))continue;const button=document.createElement('button');button.type='button';button.className='remove-added-app icon-button';button.innerHTML=trash;button.title='Удалить';button.setAttribute('aria-label','Удалить '+name);button.onclick=async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await window.removeAddedApp(id);}catch(error){notice(error.message,true);}finally{button.disabled=false;}};(card.querySelector('summary')||heading.parentNode).append(button);}}
 async function extensionRemoveButtons(){for(const card of document.querySelectorAll('[data-extension]')){const id=card.dataset.extension,heading=card.querySelector('h2');if(!heading||card.querySelector('.remove-added-app')||optionalModules.some(([key])=>key===id))continue;const button=document.createElement('button');button.type='button';button.className='remove-added-app icon-button';button.innerHTML=trash;button.title='Удалить';button.setAttribute('aria-label','Удалить '+heading.textContent);button.onclick=async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await window.removeAddedApp(id);}catch(error){notice(error.message,true);}finally{button.disabled=false;}};(card.querySelector('summary')||heading.parentNode).append(button);}}
 document.addEventListener('petya-extensions-changed',()=>extensionRemoveButtons().catch(()=>{}));
 Promise.all([connectionsReady,modulesReady]).then(removeButtons);document.addEventListener('petya-extensions-changed',removeButtons);
 // Turn on a service module and open its settings card; shared by the catalog and the settings quick start.
 window.enableAppModule=async id=>{if(!moduleEnabled(id)){const check=moduleChecks.get(id);if(!check)throw Error('Приложение не найдено.');check.checked=true;await check.onchange();if(!moduleEnabled(id))return false;}view('settings');const card=$('settings').querySelector('[data-service="'+id+'"]');if(card)window.revealSettings(card);return true;};
 window.openAppCatalog=async function(term=''){
 let extensions=await window.petya.feature('extensionUI','catalog');
  const previous=document.activeElement,d=document.createElement('dialog');d.className='app-catalog';
  const make=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text||''});
  const head=make('header'),title=make('h2','Каталог приложений'),close=make('button'),search=make('input'),rows=make('div'),top=make('div');top.className='app-catalog-top';rows.className='app-catalog-rows';
  close.type='button';close.className='icon-button app-catalog-close';close.innerHTML=cross;close.title='Закрыть';close.setAttribute('aria-label','Закрыть каталог');close.onclick=()=>d.close();
  head.append(title,close);search.type='search';search.placeholder='Найти приложение';search.setAttribute('aria-label',search.placeholder);search.value=term;
  function draw(){
    rows.replaceChildren();const q=search.value.trim().toLocaleLowerCase();
    for(const [id,name] of [...optionalModules,...extensions.filter(e=>!e.service&&e.setting).map(e=>[e.id,e.name])]){
      const extension=extensions.find(e=>e.id===id),description=extension?.description||descriptions[id];
      if(!(name+' '+description).toLocaleLowerCase().includes(q))continue;
      const row=make('div'),icon=(glyph[id]||extension&&!extension.service)?make('span',glyph[id]||'◇'):make('img'),copy=make('div'),enabled=extension&&!extension.service?extension.installed:moduleEnabled(id),action=make('button',enabled?'Настроить':'Включить');
      row.className='app-catalog-row';icon.className='app-catalog-icon';
      if(icon.tagName==='IMG'){icon.src=id==='unity'?'../extensions/unity/icon.svg':'catalog-icons/'+id+'.svg';icon.alt='';}
      else icon.setAttribute('aria-hidden','true');
      copy.append(make('strong',name),make('small',description));action.type='button';if(extension&&!extension.settings&&enabled){action.textContent='Добавлено';action.disabled=true;}
      action.onclick=async()=>{action.disabled=true;try{
        // «Включить» adds the app and keeps the catalogue open; «Настроить» goes to its settings.
        if(!enabled){if(extension&&!extension.service){await window.extensionHost.open(id,{stay:true});}else{const check=moduleChecks.get(id);check.checked=true;await check.onchange();if(!moduleEnabled(id))return;notice('«'+name+'» добавлено.');}extensions=await window.petya.feature('extensionUI','catalog');draw();return;}
        if(extension&&!extension.service){await window.extensionHost.open(id);d.close();return;}
        d.close();view('settings');const card=$('settings').querySelector('[data-service="'+id+'"]');if(card)window.revealSettings(card);
      }finally{action.disabled=false;}};
      const controls=make('div');controls.className='actions';controls.append(action);
      if(enabled){const remove=make('button');remove.type='button';remove.className='icon-button';remove.innerHTML=trash;remove.title='Удалить';remove.setAttribute('aria-label','Удалить '+name);remove.onclick=async()=>{remove.disabled=true;try{await window.removeAddedApp(id);extensions=await window.petya.feature('extensionUI','catalog');draw();}catch(error){notice(error.message,true);remove.disabled=false;}};controls.append(remove);}
      row.append(icon,copy,controls);rows.append(row);
    }
    if(!rows.children.length)rows.append(make('p','Приложение не найдено.'));
  }
  search.oninput=draw;top.append(head,search);d.append(top,rows);document.body.append(d);draw();d.showModal();search.focus();
  d.onclose=()=>{d.remove();if(document.activeElement===document.body)previous?.focus();};
 };
})();
