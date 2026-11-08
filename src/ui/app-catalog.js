(()=>{
 const descriptions={unity:'Поиск и просмотр префабов открытого проекта',telegram:'Сообщения и обсуждения команды',slack:'Каналы, сообщения и треды',notion:'Страницы и базы знаний',asana:'Поручения и задачи',jira:'Задачи, версии и отчёты',confluence:'Документы и пространства',ai:'Передача задач агентам',googleplay:'Ошибки и ANR приложений',gmail:'Почта и календарь',web:'Поиск по открытым источникам'};
 const trash='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
 const cross='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
 window.petyaIcons={...(window.petyaIcons||{}),trash,cross};
 const glyph={telegram:'➤',asana:'∴',ai:'✧',googleplay:'▷',gmail:'@',web:'◎'};
 window.removeAddedApp=async id=>{const item=optionalModules.find(([key])=>key===id);if(item){renderModules(await window.petya.saveSettings({['module_'+id]:'false'}));}else await window.extensionHost.remove(id);document.dispatchEvent(new Event('petya-extensions-changed'));notice('Удалено из добавленных. Можно подключить снова через каталог.');};
 async function removeButtons(){for(const [id,name] of optionalModules){const card=document.querySelector('[data-service="'+id+'"]'),heading=card?.querySelector('h2');if(!heading||card.querySelector('.remove-added-app'))continue;const button=document.createElement('button');button.type='button';button.className='remove-added-app icon-button delete-button';button.innerHTML=trash;button.title='Удалить';button.setAttribute('aria-label','Удалить '+name);button.onclick=async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await window.removeAddedApp(id);}catch(error){notice(error.message,true);}finally{button.disabled=false;}};(card.querySelector('summary')||heading.parentNode).append(button);}}
 async function extensionRemoveButtons(){for(const card of document.querySelectorAll('[data-extension]')){const id=card.dataset.extension,heading=card.querySelector('h2');if(!heading||card.querySelector('.remove-added-app')||optionalModules.some(([key])=>key===id))continue;const button=document.createElement('button');button.type='button';button.className='remove-added-app icon-button';button.innerHTML=trash;button.title='Удалить';button.setAttribute('aria-label','Удалить '+heading.textContent);button.onclick=async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await window.removeAddedApp(id);}catch(error){notice(error.message,true);}finally{button.disabled=false;}};(card.querySelector('summary')||heading.parentNode).append(button);}}
 document.addEventListener('petya-extensions-changed',()=>extensionRemoveButtons().catch(()=>{}));
 Promise.all([connectionsReady,modulesReady]).then(removeButtons);document.addEventListener('petya-extensions-changed',removeButtons);
 // Turn on a service module and open its settings card; shared by the catalog and the settings quick start.
 window.enableAppModule=async id=>{if(!moduleEnabled(id)){const check=moduleChecks.get(id);if(!check)throw Error('Приложение не найдено.');check.checked=true;await check.onchange();if(!moduleEnabled(id))return false;}view('settings');const card=$('settings').querySelector('[data-service="'+id+'"]');if(card)window.revealSettings(card);return true;};
 window.openAppCatalog=async function(term=''){
  let extensions=await window.petya.feature('extensionUI','catalog');
  const groups=await window.petya.feature('extensionUI','categories').catch(()=>({categories:[],modules:{}}));
  const previous=document.activeElement,d=document.createElement('dialog');d.className='app-catalog';
  const make=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text||''});
  const head=make('header'),title=make('h2','Каталог приложений'),close=make('button'),search=make('input'),rows=make('div'),top=make('div'),bar=make('div');top.className='app-catalog-top';rows.className='app-catalog-rows';bar.className='app-catalog-bar';bar.hidden=true;
  close.type='button';close.className='icon-button app-catalog-close';close.innerHTML=cross;close.title='Закрыть';close.setAttribute('aria-label','Закрыть каталог');close.onclick=()=>d.close();
  head.append(title,close);search.type='search';search.placeholder='Найти приложение';search.setAttribute('aria-label',search.placeholder);search.value=term;
  // Chosen, not yet added apps (kept across searches and redraws until added or cleared).
  const chosen=new Set();
  // Download sizes arrive after the first paint (presence checks may take a moment).
  let weights={apps:{},available:null,reserve:0};
  const unit=u=>/^ru/i.test(window.petyaLocale||'ru')?u:({ГБ:'GB',МБ:'MB',КБ:'KB'}[u]||u);
  const size=n=>{const gb=n/1e9;return gb>=1?gb.toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:1})+' '+unit('ГБ'):Math.max(1,Math.round(n/1e6)).toLocaleString(window.petyaLocale||'ru-RU')+' '+unit('МБ');};
  const weight=item=>weights.apps[item.id]||null;
  const installBytes=list=>list.reduce((sum,item)=>sum+(weight(item)?.install||0),0);
  function weightLine(item){
   const w=weight(item),line=make('small');line.className='app-catalog-weight';
   if(!w)return null;
   const parts=[];
   if(w.install)parts.push('Вес загрузки: ≈ '+size(w.install));
   else if(w.items.some(i=>!i.optional&&i.present))parts.push('Уже скачано');
   if(w.optional)parts.push((w.install?'и по желанию ещё до ≈ ':'По желанию: до ≈ ')+size(w.optional));
   const needs=[...new Set(w.items.map(i=>i.requires).filter(Boolean))];
   if(needs.length)parts.push('Нужен '+needs.join(', '));
   line.textContent=parts.join(' · ');line.title=w.items.map(i=>i.name+' — '+(i.present?'уже скачано':(i.approx?'≈ ':'')+size(i.bytes))).join('\n');
   return line;
  }
  const items=()=>[...optionalModules.map(([id,name])=>({id,name,service:true,extension:extensions.find(e=>e.id===id)})),...extensions.filter(e=>!e.service&&e.setting).map(e=>({id:e.id,name:e.name,service:false,extension:e}))]
   .map(item=>({...item,description:item.extension?.description||descriptions[item.id]||'',category:(item.service?groups.modules?.[item.id]:null)||item.extension?.category||'other',enabled:item.service?moduleEnabled(item.id):!!item.extension?.installed}));
  // Adds several apps: extensions in one save, then service modules one by one (each may open its own connection).
  async function addMany(list){
   const ext=list.filter(i=>!i.service).map(i=>i.id),services=list.filter(i=>i.service);
   if(ext.length)await window.extensionHost.openMany(ext);
   for(const item of services){const check=moduleChecks.get(item.id);if(!check||moduleEnabled(item.id))continue;check.checked=true;await check.onchange();}
   for(const item of list){chosen.delete(item.id);window.petya.feature('extensionOffers','unmute',item.id).catch(()=>{});}
   extensions=await window.petya.feature('extensionUI','catalog');
   const added=list.filter(i=>i.service?moduleEnabled(i.id):extensions.find(e=>e.id===i.id)?.installed);
   notice(added.length===1?'«'+added[0].name+'» добавлено.':'Добавлено приложений: '+added.length+'.');
   document.dispatchEvent(new Event('petya-extensions-changed'));draw();
  }
  function paintBar(){
   bar.replaceChildren();bar.hidden=!chosen.size;if(!chosen.size)return;
   const picked=items().filter(i=>chosen.has(i.id)&&!i.enabled),bytes=installBytes(picked);
   const add=make('button','Добавить выбранные ('+chosen.size+')'),clear=make('button','Сбросить');add.type=clear.type='button';add.className='primary';
   // Not enough free space for what the chosen apps download: say so instead of starting downloads that fail.
   const short=bytes&&weights.available!==null&&bytes+weights.reserve>weights.available;
   if(short)add.title='Загрузки этих приложений не поместятся на диск';
   add.onclick=async()=>{add.disabled=true;try{await addMany(items().filter(i=>chosen.has(i.id)&&!i.enabled));}catch(e){notice(e.message,true);}finally{add.disabled=false;}};
   clear.onclick=()=>{chosen.clear();draw();};
   const note=make('span','Выбрано: '+chosen.size+(bytes?' · вес загрузки ≈ '+size(bytes):''));
   if(short){const warn=make('strong',' · не хватит места: свободно '+size(weights.available));warn.className='app-catalog-short';note.append(warn);}
   bar.append(note,clear,add);
  }
  function row(item){
   const {id,name,description,extension,enabled}=item;
   const line=make('div'),icon=(glyph[id]||extension&&!extension.service)?make('span',glyph[id]||'◇'):make('img'),copy=make('div'),action=make('button',enabled?'Настроить':'Включить');
   line.className='app-catalog-row';icon.className='app-catalog-icon';
   if(icon.tagName==='IMG'){icon.src=id==='unity'?'../extensions/unity/icon.svg':'catalog-icons/'+id+'.svg';icon.alt='';}
   else icon.setAttribute('aria-hidden','true');
   const pick=make('input');pick.type='checkbox';pick.className='app-catalog-pick';
   if(enabled){pick.checked=true;pick.disabled=true;pick.title='Уже добавлено';pick.setAttribute('aria-label',name+' — уже добавлено');}
   else{pick.checked=chosen.has(id);pick.setAttribute('aria-label','Выбрать '+name);pick.onchange=()=>{if(pick.checked)chosen.add(id);else chosen.delete(id);draw();};}
   copy.append(make('strong',name),make('small',description));{const w=weightLine(item);if(w)copy.append(w);}action.type='button';if(extension&&!extension.service&&!extension.settings&&enabled){action.textContent='Добавлено';action.disabled=true;}
   action.onclick=async()=>{action.disabled=true;try{
     // «Включить» adds the app and keeps the catalogue open; «Настроить» goes to its settings.
     if(!enabled){if(extension&&!extension.service){await window.extensionHost.open(id,{stay:true});window.petya.feature('extensionOffers','unmute',id).catch(()=>{});}else{const check=moduleChecks.get(id);check.checked=true;await check.onchange();if(!moduleEnabled(id))return;notice('«'+name+'» добавлено.');}chosen.delete(id);extensions=await window.petya.feature('extensionUI','catalog');draw();return;}
     if(extension&&!extension.service){await window.extensionHost.open(id);d.close();return;}
     d.close();view('settings');const card=$('settings').querySelector('[data-service="'+id+'"]');if(card)window.revealSettings(card);
   }finally{action.disabled=false;}};
   const controls=make('div');controls.className='actions';controls.append(action);
   if(enabled){const remove=make('button');remove.type='button';remove.className='icon-button delete-button';remove.innerHTML=trash;remove.title='Удалить';remove.setAttribute('aria-label','Удалить '+name);remove.onclick=async()=>{remove.disabled=true;try{await window.removeAddedApp(id);extensions=await window.petya.feature('extensionUI','catalog');draw();}catch(error){notice(error.message,true);remove.disabled=false;}};controls.append(remove);}
   line.append(pick,icon,copy,controls);return line;
  }
  function draw(){
   const keep=rows.scrollTop;rows.replaceChildren();const q=search.value.trim().toLocaleLowerCase();
   const all=items(),order=[...(groups.categories||[]),{id:'other',name:'Другое',description:''}];
   for(const group of order){
    const members=all.filter(i=>i.category===group.id),shown=members.filter(i=>(i.name+' '+i.description+' '+group.name).toLocaleLowerCase().includes(q));
    if(!shown.length)continue;
    const section=make('section'),header=make('div'),label=make('div'),missing=members.filter(i=>!i.enabled),added=members.length-missing.length;
    section.className='app-catalog-group';section.dataset.category=group.id;header.className='app-catalog-group-head';
    // The category checkbox picks all of its missing apps; single rows pick a part.
    const whole=make('input');whole.type='checkbox';whole.className='app-catalog-pick';
    const picked=missing.filter(i=>chosen.has(i.id)).length;
    whole.checked=!missing.length||picked===missing.length;whole.indeterminate=picked>0&&picked<missing.length;whole.disabled=!missing.length;
    whole.setAttribute('aria-label',missing.length?'Выбрать всю категорию «'+group.name+'»':'Категория «'+group.name+'» добавлена полностью');
    whole.onchange=()=>{for(const i of missing){if(whole.checked)chosen.add(i.id);else chosen.delete(i.id);}draw();};
    label.append(make('strong',group.name),make('small',added+' из '+members.length+' добавлено'+(group.description?' · '+group.description:'')));
    const groupBytes=installBytes(missing);
    const addAll=make('button',missing.length?(missing.length<members.length?'Добавить остальные ('+missing.length+')':'Добавить всю категорию'):'Всё добавлено');
    if(missing.length&&groupBytes){addAll.append(make('small',' · ≈ '+size(groupBytes)));addAll.title='Вес загрузки: ≈ '+size(groupBytes);}addAll.type='button';addAll.disabled=!missing.length;
    addAll.onclick=async()=>{addAll.disabled=true;try{await addMany(missing);}catch(e){notice(e.message,true);addAll.disabled=false;}};
    header.append(whole,label,addAll);section.append(header);
    for(const item of shown)section.append(row(item));
    rows.append(section);
   }
   if(!rows.children.length)rows.append(make('p','Приложение не найдено.'));
   rows.scrollTop=keep;paintBar();
  }
  search.oninput=draw;top.append(head,search);d.append(top,rows,bar);document.body.append(d);draw();d.showModal();search.focus();
  window.petya.feature('extensionUI','sizes').then(result=>{if(result?.apps){weights=result;if(d.open)draw();}}).catch(()=>{});
  d.onclose=()=>{d.remove();if(document.activeElement===document.body)previous?.focus();};
 };
})();
