(()=>{
 const descriptions={unity:'Поиск и просмотр префабов открытого проекта',telegram:'Сообщения и обсуждения команды',slack:'Каналы, сообщения и треды',notion:'Страницы и базы знаний',asana:'Поручения и задачи',jira:'Задачи, версии и отчёты',confluence:'Документы и пространства',ai:'Передача задач агентам',googleplay:'Ошибки и ANR приложений',gmail:'Почта и календарь',web:'Поиск по открытым источникам'};
 const trash='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
 const cross='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
 window.petyaIcons={...(window.petyaIcons||{}),trash,cross};
 window.removeAddedApp=async id=>{const item=optionalModules.find(([key])=>key===id);if(item){renderModules(await window.petya.saveSettings({['module_'+id]:'false'}));}else await window.extensionHost.remove(id);document.dispatchEvent(new Event('petya-extensions-changed'));notice('Удалено из добавленных. Можно подключить снова через каталог.');};
 async function removeButtons(){for(const [id,name] of optionalModules){const card=document.querySelector('[data-service="'+id+'"]'),heading=card?.querySelector('h2');if(!heading||card.querySelector('.remove-added-app'))continue;const button=document.createElement('button');button.type='button';button.className='remove-added-app icon-button delete-button';button.innerHTML=trash;button.title='Удалить';button.setAttribute('aria-label','Удалить '+name);button.onclick=async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await window.removeAddedApp(id);}catch(error){notice(error.message,true);}finally{button.disabled=false;}};(card.querySelector('summary')||heading.parentNode).append(button);}}
 async function extensionRemoveButtons(){for(const card of document.querySelectorAll('[data-extension]')){const id=card.dataset.extension,heading=card.querySelector('h2');if(!heading||card.querySelector('.remove-added-app')||optionalModules.some(([key])=>key===id))continue;const button=document.createElement('button');button.type='button';button.className='remove-added-app icon-button delete-button';button.innerHTML=trash;button.title='Удалить';button.setAttribute('aria-label','Удалить '+heading.textContent);button.onclick=async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await window.removeAddedApp(id);}catch(error){notice(error.message,true);}finally{button.disabled=false;}};(card.querySelector('summary')||heading.parentNode).append(button);}}
 document.addEventListener('petya-extensions-changed',()=>extensionRemoveButtons().catch(()=>{}));
 Promise.all([connectionsReady,modulesReady]).then(removeButtons);document.addEventListener('petya-extensions-changed',removeButtons);
 // Turn on a service module and open its settings card; shared by the catalog and the settings quick start.
 window.enableAppModule=async id=>{if(!moduleEnabled(id)){const check=moduleChecks.get(id);if(!check)throw Error('Приложение не найдено.');check.checked=true;await check.onchange();if(!moduleEnabled(id))return false;}view('settings');const card=$('settings').querySelector('[data-service="'+id+'"]');if(card)window.revealSettings(card);return true;};

 // Icons. Services with their own artwork keep it; everything else is a monochrome stroke icon tinted by category:
 // an extension's icon.svg (inlined by the main process) or one of the service icons below.
 const stroke=body=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
 const artwork={unity:'../extensions/unity/icon.svg',slack:'catalog-icons/slack.svg',jira:'catalog-icons/jira.svg',confluence:'catalog-icons/confluence.svg',notion:'catalog-icons/notion.svg'};
 const serviceIcons={
  ai:stroke('<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
  googleplay:stroke('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M8.5 12h1.8l1.2-2.5 1.8 5 1.2-2.5h1"/><path d="M11 18.5h2"/>'),
  gmail:stroke('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>'),
  web:stroke('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>'),
 };
 const search='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>';
 // Cross-app capability kinds (src/features/app-links.cjs) as the catalog names them.
 const KIND_NAMES={'video-meeting':'Видеозвонок','task-tracker':'Задача в трекер','share-message':'Сообщение в канал','code-fix':'Починка кода','meeting-recording':'Запись встречи'};
 // Saved credentials of service modules (flags from settings, never the secrets themselves).
 const SERVICE_FLAGS={slack:['hasSlackToken','hasSlackOAuth'],notion:['hasNotionToken','hasNotionOAuth'],jira:['hasJiraToken','hasAtlassianOAuth'],confluence:['hasJiraToken','hasAtlassianOAuth'],asana:['hasAsanaOAuth'],telegram:['hasTelegram'],googleplay:['hasGooglePlay'],gmail:['hasGmail','hasMicrosoft']};

 window.openAppCatalog=async function(term=''){
  document.querySelector('dialog.app-catalog')?.close();
  let extensions=await window.petya.feature('extensionUI','catalog');
  const groups=await window.petya.feature('extensionUI','categories').catch(()=>({categories:[],modules:{}}));
  let flags=await window.petya.settings().catch(()=>moduleSettings);
  const previous=document.activeElement,d=document.createElement('dialog');d.className='app-catalog';
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,cls,onclick)=>{const b=make('button',text,cls);b.type='button';if(onclick)b.onclick=onclick;return b;};
  const lower=s=>String(s||'').toLocaleLowerCase();
  const categories=[...(groups.categories||[]),{id:'other',name:'Другое',description:'',hue:200}];
  const categoryOf=id=>categories.find(c=>c.id===id)||categories.at(-1);

  // State: the rail filter, the opened app, the chosen (not yet added) apps and whether checkboxes are shown.
  let filter='all',openId=null,selecting=false;const chosen=new Set();
  let weights={apps:{},available:null,reserve:0};
  const unit=u=>/^ru/i.test(window.petyaLocale||'ru')?u:({ГБ:'GB',МБ:'MB',КБ:'KB'}[u]||u);
  const size=n=>{const gb=n/1e9;return gb>=1?gb.toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:1})+' '+unit('ГБ'):Math.max(1,Math.round(n/1e6)).toLocaleString(window.petyaLocale||'ru-RU')+' '+unit('МБ');};
  const installBytes=list=>list.reduce((sum,item)=>sum+(weights.apps[item.id]?.install||0),0);

  function items(){
   const list=[...optionalModules.map(([id,name])=>({id,name,service:true,extension:extensions.find(e=>e.id===id)})),...extensions.filter(e=>!e.service&&e.setting).map(e=>({id:e.id,name:e.name,service:false,extension:e}))];
   return list.map(item=>{
    const e=item.extension,category=(item.service?groups.modules?.[item.id]:null)||e?.category||'other';
    const enabled=item.service?moduleEnabled(item.id):!!e?.installed;
    // Needs connecting: added, but its service has no saved credentials or its offer is not ready yet.
    const serviceFlags=item.service?SERVICE_FLAGS[item.id]:null;
    const connected=serviceFlags?serviceFlags.some(k=>!!flags?.[k]):(e?.connects?!!e.connected:null);
    const connects=serviceFlags?item.name:(e?.connects||'');
    return {...item,category,enabled,connects,connected,needsConnection:enabled&&connected===false,
     description:e?.description||descriptions[item.id]||'',examples:e?.examples||groups.moduleExamples?.[item.id]||[],
     settings:item.service||!!e?.settings};
   });
  }
  const stateOf=item=>item.needsConnection?'connect':item.enabled?'added':'';
  const haystack=item=>{const parts=[item.name,item.description,categoryOf(item.category).name,...item.examples];return lower(parts.join(' ')+' '+parts.map(p=>window.t?.(p)||p).join(' '));};

  // Layout: header with search, rail, content, details panel, selection bar.
  const head=make('header','','app-catalog-head'),title=make('h2','Каталог приложений'),find=make('label','','app-catalog-search'),input=make('input'),pickMode=button('Выбрать несколько','app-catalog-select'),close=button('','icon-button app-catalog-close',()=>d.close());
  find.innerHTML=search;input.type='search';input.placeholder='Название, задача или фраза';input.setAttribute('aria-label','Найти приложение');input.value=term;input.setAttribute('aria-keyshortcuts','/');find.append(input,make('kbd','/'));
  close.innerHTML=cross;close.title='Закрыть';close.setAttribute('aria-label','Закрыть каталог');
  pickMode.setAttribute('aria-pressed','false');
  head.append(title,find,pickMode,close);
  const rail=make('nav','','app-catalog-rail'),body=make('div','','app-catalog-body'),content=make('div','','app-catalog-content'),details=make('aside','','app-catalog-details'),bar=make('div','','app-catalog-bar');
  rail.setAttribute('aria-label','Разделы каталога');details.hidden=true;details.tabIndex=-1;details.setAttribute('aria-label','Подробнее о приложении');bar.hidden=true;
  body.append(content,details);
  const frame=make('div','','app-catalog-frame');frame.append(rail,body);
  d.append(head,frame,bar);

  function icon(item,large){
   const box=make('span','','app-icon'+(large?' app-icon-large':''));box.setAttribute('aria-hidden','true');box.style.setProperty('--hue',categoryOf(item.category).hue??200);
   if(artwork[item.id]){const img=make('img');img.src=artwork[item.id];img.alt='';box.classList.add('app-icon-art');box.append(img);}
   else if(item.extension?.iconSvg)box.innerHTML=item.extension.iconSvg;
   else if(serviceIcons[item.id])box.innerHTML=serviceIcons[item.id];
   else box.textContent=item.name.slice(0,1);
   return box;
  }
  function status(item){
   const state=stateOf(item);if(!state)return null;
   const s=make('span',state==='connect'?'Нужно подключить':'Добавлено','app-status');s.dataset.state=state;return s;
  }

  // Actions. Adding keeps the catalog open; connecting and settings leave it for the app's settings card.
  async function refresh(){extensions=await window.petya.feature('extensionUI','catalog');flags=await window.petya.settings().catch(()=>flags);draw();}
  async function addMany(list){
   const ext=list.filter(i=>!i.service&&!i.enabled).map(i=>i.id),services=list.filter(i=>i.service&&!i.enabled);
   if(ext.length)await window.extensionHost.openMany(ext);
   for(const item of services){const check=moduleChecks.get(item.id);if(!check||moduleEnabled(item.id))continue;check.checked=true;await check.onchange();}
   for(const item of list){chosen.delete(item.id);window.petya.feature('extensionOffers','unmute',item.id).catch(()=>{});}
   extensions=await window.petya.feature('extensionUI','catalog');
   const added=list.filter(i=>i.service?moduleEnabled(i.id):extensions.find(e=>e.id===i.id)?.installed);
   if(added.length)notice(added.length===1?'«'+added[0].name+'» добавлено.':'Добавлено приложений: '+added.length+'.');
   document.dispatchEvent(new Event('petya-extensions-changed'));await refresh();
   return added.length===list.length;
  }
  const add=item=>addMany([item]);
  async function openSettings(item){
   d.close();
   if(!item.service){await window.extensionHost.open(item.id);return;}
   view('settings');const card=$('settings').querySelector('[data-service="'+item.id+'"]');if(card)window.revealSettings(card);
  }
  // An example phrase goes into the chat composer, not sent: the user may edit it first.
  function say(phrase){
   d.close();view('home');const box=$('command');if(!box)return;
   box.value=window.t?.(phrase)||phrase;box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();box.setSelectionRange?.(box.value.length,box.value.length);
  }
  async function tryWith(item,phrase){
   if(!item.enabled&&!await add(item))return;
   const fresh=items().find(i=>i.id===item.id);
   if(fresh?.needsConnection){notice('«'+item.name+'» добавлено. Подключите его в настройках, затем попробуйте фразу.');await openSettings(fresh);return;}
   say(phrase);
  }
  const busy=async(control,work)=>{control.disabled=true;try{await work();}catch(e){notice(e.message,true);}finally{control.disabled=false;}};

  function tile(item){
   const state=stateOf(item),t=make('div','','app-tile');t.dataset.app=item.id;t.dataset.state=state;
   if(chosen.has(item.id))t.classList.add('chosen');
   const main=button('','app-tile-main',()=>{if(selecting&&!item.enabled){toggle(item);return;}showDetails(item.id);});
   const text=make('span','','app-tile-text');text.append(make('strong',item.name),make('span',item.description,'app-tile-description'));
   main.append(icon(item),text);main.setAttribute('aria-label',item.name);main.setAttribute('aria-description',item.description);
   const foot=make('div','','app-tile-foot'),s=status(item);if(s)foot.append(s);
   const bytes=!item.enabled&&weights.apps[item.id]?.install;
   if(bytes){const w=make('span','≈ '+size(bytes),'app-weight');w.title='Вес загрузки: ≈ '+size(bytes);foot.append(w);}
   const action=state==='connect'?button('Подключить','app-tile-action',()=>busy(action,()=>openSettings(item)))
    :state==='added'?button('Открыть','app-tile-action',()=>showDetails(item.id))
    :button('Добавить','app-tile-action',()=>busy(action,()=>add(item)));
   action.dataset.action=state==='connect'?'connect':state==='added'?'open':'add';
   action.setAttribute('aria-label',action.textContent+': '+item.name);
   foot.append(action);t.append(main,foot);
   if(!item.enabled){
    const pick=make('input','','app-tile-pick');pick.type='checkbox';pick.checked=chosen.has(item.id);pick.setAttribute('aria-label','Выбрать '+item.name);
    pick.onchange=()=>toggle(item,pick.checked);t.append(pick);
   }
   return t;
  }
  function toggle(item,on=!chosen.has(item.id)){if(on)chosen.add(item.id);else chosen.delete(item.id);draw();}

  function section(group,members,shown,{addAll=true}={}){
   const sec=make('section','','app-catalog-group');sec.dataset.category=group.id;sec.style.setProperty('--hue',group.hue??200);
   const header=make('div','','app-catalog-group-head'),label=make('div'),missing=members.filter(i=>!i.enabled);
   const h=make('h3',group.name);label.append(h);
   const meta=make('p',group.description||'');meta.className='app-catalog-group-description';if(group.description)label.append(meta);
   header.append(label);
   if(addAll&&missing.length){
    const bytes=installBytes(missing),b=button(missing.length<members.length?'Добавить остальные ('+missing.length+')':'Добавить всю категорию','app-catalog-add-all');
    if(bytes){b.append(make('span',' · ≈ '+size(bytes),'app-catalog-add-weight'));b.title='Вес загрузки: ≈ '+size(bytes);
     if(weights.available!==null&&bytes+weights.reserve>weights.available)b.title+='. Не хватит места: свободно '+size(weights.available);}
    b.onclick=()=>busy(b,()=>addMany(missing));header.append(b);
   }else if(addAll&&members.length)header.append(make('span','Всё добавлено','app-catalog-all-added'));
   const grid=make('div','','app-grid');for(const item of shown)grid.append(tile(item));
   sec.append(header,grid);return sec;
  }

  function paintRail(all){
   rail.replaceChildren();
   const entry=(id,name,count,extra)=>{const b=button('','app-rail-item',()=>{filter=id;input.value='';openId=null;draw();content.scrollTop=0;});b.dataset.filter=id;
    b.append(make('span',name,'app-rail-name'),make('span',count,'app-rail-count'));if(extra)b.classList.add(extra);
    const active=!input.value.trim()&&filter===id;if(active)b.setAttribute('aria-current','true');rail.append(b);return b;};
   const added=all.filter(i=>i.enabled).length,connect=all.filter(i=>i.needsConnection).length;
   entry('all','Все',String(all.length));
   entry('added','Добавленные',String(added));
   if(connect)entry('connect','Требуют настройки',String(connect),'app-rail-warn');
   rail.append(make('hr'));
   for(const group of categories){const members=all.filter(i=>i.category===group.id);if(!members.length)continue;
    const b=entry(group.id,group.name,members.filter(i=>i.enabled).length+'/'+members.length);b.style.setProperty('--hue',group.hue??200);b.prepend(make('span','','app-rail-swatch'));}
  }

  function draw(){
   const keep=content.scrollTop,all=items(),q=lower(input.value.trim());
   if(filter==='connect'&&!all.some(i=>i.needsConnection))filter='all';
   paintRail(all);content.replaceChildren();
   const match=q?all.filter(i=>haystack(i).includes(q)):all;
   const scope=q?'all':filter;
   if(q){const n=make('p','','app-catalog-found');n.textContent=match.length?'Найдено: '+match.length:'';content.append(n);}
   for(const group of categories){
    if(!['all','added','connect'].includes(scope)&&scope!==group.id)continue;
    const members=all.filter(i=>i.category===group.id);
    const shown=match.filter(i=>i.category===group.id&&(scope==='added'?i.enabled:scope==='connect'?i.needsConnection:true));
    if(!shown.length)continue;
    content.append(section(group,members,shown,{addAll:!q&&(scope==='all'||scope===group.id)}));
   }
   if(!content.querySelector('.app-tile')){
    const empty=make('div','','app-catalog-empty');
    if(q){empty.append(make('p','Ничего не нашлось по запросу «'+input.value.trim()+'».'),make('p','Попробуйте название сервиса или то, что хотите сделать: «крэши», «отзывы», «встреча».','app-catalog-hint'));}
    else empty.append(make('p',filter==='added'?'Пока ничего не добавлено. Выберите приложение в разделе «Все».':'Здесь пока пусто.'));
    content.append(empty);
   }
   content.scrollTop=keep;
   d.classList.toggle('selecting',selecting||chosen.size>0);pickMode.setAttribute('aria-pressed',String(selecting));
   paintBar(all);
   if(openId)paintDetails(all.find(i=>i.id===openId));
  }

  function paintBar(all){
   bar.replaceChildren();const picked=all.filter(i=>chosen.has(i.id)&&!i.enabled);
   for(const id of [...chosen])if(!picked.some(i=>i.id===id))chosen.delete(id);
   bar.hidden=!picked.length;if(!picked.length)return;
   const bytes=installBytes(picked),note=make('span','Выбрано: '+picked.length,'app-catalog-bar-note');
   if(bytes)note.append(make('span',' · вес ≈ '+size(bytes)));
   // Not enough free space for what the chosen apps download: a warning, adding is still allowed.
   const short=bytes&&weights.available!==null&&bytes+weights.reserve>weights.available;
   if(short){const warn=make('strong',' · не хватит места: свободно '+size(weights.available),'app-catalog-short');note.append(warn);}
   const clear=button('Сбросить','',()=>{chosen.clear();selecting=false;draw();});
   const go=button('Добавить','primary',()=>busy(go,async()=>{await addMany(picked);selecting=false;draw();}));
   if(short)go.title='Загрузки этих приложений могут не поместиться на диск';
   bar.append(note,clear,go);
  }

  // Details: what the app does, what to say, its connection, downloads, neighbours and removal.
  function showDetails(id){openId=id;draw();details.focus({preventScroll:true});}
  function hideDetails(){const id=openId;openId=null;details.hidden=true;d.classList.remove('with-details');content.querySelector('.app-tile[data-app="'+id+'"] .app-tile-main')?.focus();}
  function paintDetails(item){
   if(!item){hideDetails();return;}
   details.hidden=false;d.classList.add('with-details');details.replaceChildren();details.dataset.app=item.id;details.style.setProperty('--hue',categoryOf(item.category).hue??200);
   const state=stateOf(item),top=make('div','','app-details-top'),x=button('','icon-button app-details-close',hideDetails);
   x.innerHTML=cross;x.title='Закрыть';x.setAttribute('aria-label','Закрыть подробности');
   const name=make('div','','app-details-name');name.append(make('h3',item.name),make('span',categoryOf(item.category).name,'app-details-category'));
   top.append(icon(item,true),name,x);details.append(top);
   const s=status(item);if(s)details.append(s);
   details.append(make('p',item.description,'app-details-description'));
   const actions=make('div','','app-details-actions');
   if(!item.enabled)actions.append(button('Добавить','primary',function(){busy(this,()=>add(item));}));
   else if(state==='connect')actions.append(button('Подключить','primary',function(){busy(this,()=>openSettings(item));}));
   else if(item.settings)actions.append(button('Настройки','',function(){busy(this,()=>openSettings(item));}));
   if(actions.children.length)details.append(actions);

   if(item.examples.length){
    const box=make('section','','app-details-section app-says');box.append(make('h4','Примеры обращений'));
    const list=make('ul');
    for(const phrase of item.examples){
     const li=make('li'),b=button(phrase,'app-say');b.dataset.phrase=phrase;
     b.title=item.enabled&&!item.needsConnection?'Вставить в поле ввода':'Добавить и попробовать';
     b.onclick=()=>busy(b,()=>item.enabled&&!item.needsConnection?say(phrase):tryWith(item,phrase));
     li.append(b);list.append(li);
    }
    box.append(list);
    if(!item.enabled){const tryButton=button('Добавить и попробовать','app-try',function(){busy(this,()=>tryWith(item,item.examples[0]));});box.append(tryButton);}
    details.append(box);
   }
   if(item.connects){
    const box=make('section','','app-details-section');box.append(make('h4','Подключение'));
    const link=make('span',!item.enabled?'Подключите после добавления':item.connected?'Подключено':'Не подключено','app-details-state');
    link.dataset.state=!item.enabled?'':item.connected?'added':'connect';
    box.append(make('p',item.connects,'app-details-service'),link);
    if(item.enabled&&item.connected)box.append(button('Открыть настройки','app-details-link',function(){busy(this,()=>openSettings(item));}));
    details.append(box);
   }
   const w=weights.apps[item.id];
   if(w?.items?.length){
    const box=make('section','','app-details-section');box.append(make('h4','Загрузки'));
    for(const i of w.items){
     const row=make('div','','app-details-row');row.append(make('span',i.name));
     const right=make('span',i.present?'уже скачано':(i.approx?'≈ ':'')+size(i.bytes),'app-details-state');
     if(i.optional&&!i.present)right.append(make('small',' по желанию'));
     row.append(right);box.append(row);
     if(i.requires)box.append(make('p','Нужен '+i.requires,'app-details-note'));
    }
    details.append(box);
   }
   // Works with: providers of the kinds this app's cards use, and apps whose cards use what it provides.
   const self=item.extension||{},pairs=new Map();
   for(const kind of self.uses||[])for(const other of extensions)if(other.id!==item.id&&other.provides?.[kind])pairs.set(kind,[...(pairs.get(kind)||[]),other]);
   for(const kind of Object.keys(self.provides||{}))for(const other of extensions)if(other.id!==item.id&&(other.uses||[]).includes(kind))pairs.set(kind,[...(pairs.get(kind)||[]),other]);
   if(pairs.size){
    const box=make('section','','app-details-section');box.append(make('h4','Работает вместе с'));const list=make('dl','','app-links');
    const known=items();
    for(const [kind,others] of pairs){
     const dd=make('dd');
     for(const other of others){const target=known.find(i=>i.id===other.id);dd.append(target?button(other.name,'app-link',()=>showDetails(target.id)):make('span',other.name,'app-link-plain'));}
     list.append(make('dt',KIND_NAMES[kind]||kind),dd);
    }
    box.append(list);details.append(box);
   }
   if(item.enabled){
    const remove=window.asDeleteButton?window.asDeleteButton(button('','app-details-remove'),'Удалить '+item.name):button('','app-details-remove');if(!window.asDeleteButton){remove.innerHTML=trash;remove.setAttribute('aria-label','Удалить '+item.name);}
    remove.onclick=()=>busy(remove,async()=>{await window.removeAddedApp(item.id);await refresh();});
    details.append(remove);
   }
  }

  pickMode.onclick=()=>{selecting=!selecting;if(!selecting)chosen.clear();draw();};
  input.oninput=()=>{openId=null;draw();content.scrollTop=0;};
  // Esc closes the details first, then the catalog; «/» jumps to search.
  d.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&openId){event.preventDefault();event.stopPropagation();hideDetails();return;}
   if(event.key==='/'&&!event.target.closest('input,textarea,[contenteditable]')){event.preventDefault();input.focus();input.select();}
  },true);
  d.addEventListener('cancel',event=>{if(openId){event.preventDefault();hideDetails();}});
  document.body.append(d);draw();d.showModal();
  // Opened for one named app (e.g. «Подключить Telegram»): show its details right away.
  const exact=term&&items().filter(i=>lower(i.name)===lower(term.trim()));
  if(exact?.length===1)showDetails(exact[0].id);else input.focus();
  window.petya.feature('extensionUI','sizes').then(result=>{if(result?.apps){weights=result;if(d.open)draw();}}).catch(()=>{});
  d.onclose=()=>{d.remove();if(document.activeElement===document.body)previous?.focus();};
 };
})();
