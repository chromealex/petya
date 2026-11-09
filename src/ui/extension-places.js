// Places apps add to Petya's own interface, declared in extension.json "ui" (docs/extensions.md §8a):
//  - pages: an item in the left rail ({id, title, icon?, after? | group?, render}) with a page of its own;
//  - tabs: a tab on a page of Petya or of another app ({page, title, render, order?}), through the shared tab host
//    (page-tabs.js), so tabs with one name from several apps are one tab with a section per app.
// Renderers are window functions from the app's "scripts": render(container, api), api = {extension, page,
// feature(method, …args) → the app's IPC, onShow(fn), kit}. Everything follows the catalog live: adding, removing or
// turning an app off adds or removes its places at once; a page that was open goes back to the previous one.
// Bundled and external (petya-ext://) apps go through the same path (extensionHost.scripts).
(()=>{
 // Rail items of Petya and the groups an app may join; pages that accept tabs («skills» is the «Сценарии» tab of «Навыки»).
 const RAIL=['home','growth','sources','team','agents','history','settings','learning','skills'];
 const GROUPS={assistant:['home','growth'],work:['sources','team','agents','history'],setup:['settings','learning']};
 const TAB_PAGES={learning:'learning',skills:'learning',team:'team',sources:'sources',settings:'settings',history:'history',agents:'agents',growth:'growth'};
 const viewOf=id=>'ext-'+id;
 const rendered=new Map(); // extension id → {rev, pages:[{view, button, section, shows}], tabs:[{handle, page}]}
 const reported=new Set();
 const visits=[];
 document.addEventListener('petya-view',event=>{if(visits.at(-1)!==event.detail)visits.push(event.detail);if(visits.length>30)visits.shift();});
 // A declaration that cannot be used: a clear error in the dev console, and a notification for installed apps.
 function problem(entry,text,detail=''){
  const key=entry.id+'|'+text+detail;if(reported.has(key))return;reported.add(key);
  console.error('[extensions] «'+entry.id+'»: '+(window.t||String)(text)+detail);
  if(entry.origin&&entry.origin!=='bundled')document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'extension-ui:'+entry.id,title:'Ошибка расширения',text:(entry.name||entry.id)+': '+(window.t||String)(text)+detail,kind:'error',version:key}}));
 }
 // What should be on screen now: pages (the first app to claim an id keeps it) and tabs on pages that exist.
 function plan(entries){
  const live=entries.filter(e=>e.installed&&e.ui),owners=new Map(),pages=[],tabs=[];
  for(const entry of live)for(const page of entry.ui.pages||[]){
   if(RAIL.includes(page.id)||TAB_PAGES[page.id]){problem(entry,'Страница отклонена: id совпадает с разделом Пети',' «'+page.id+'»');continue;}
   const owner=owners.get(page.id);
   if(owner){problem(entry,'Страница отклонена: этот id уже занят приложением',' «'+owner.name+'» ('+page.id+')');continue;}
   owners.set(page.id,entry);pages.push({entry,page});
  }
  for(const entry of live)(entry.ui.tabs||[]).forEach((tab,index)=>{
   const target=TAB_PAGES[tab.page]||(owners.has(tab.page)?viewOf(tab.page):null);
   if(!target){problem(entry,'Вкладка пропущена: неизвестная страница',' «'+tab.page+'» (tabs['+index+'] «'+tab.title+'»). Pages: '+[...Object.keys(TAB_PAGES),...owners.keys()].join(', '));return;}
   tabs.push({entry,tab,index,target});
  });
  return {pages,tabs};
 }
 function api(entry,page,shows,container){
  return {extension:entry.id,page,container,kit:window.resultKit,
   feature:(method,...args)=>{if(!entry.featureName)return Promise.reject(Error('У приложения нет функций в основном процессе.'));return window.petya.feature(entry.featureName,method,...args);},
   onShow:fn=>{if(typeof fn==='function')shows.push(fn);}};
 }
 const runShows=(entry,shows)=>{for(const fn of shows)Promise.resolve().then(fn).catch(e=>problem(entry,'Ошибка при показе страницы',': '+e.message));};
 async function draw(entry,name,container,args){
  const fn=window[name];
  if(typeof fn!=='function'){problem(entry,'Не найдена функция отрисовки',' '+name);container.append(Object.assign(document.createElement('p'),{className:'small error',textContent:'Приложение не смогло показать этот раздел.'}));return false;}
  try{await fn(container,args);return true;}
  catch(error){problem(entry,'Ошибка при показе страницы',': '+error.message);return false;}
 }
 // The rail button goes after the item it names, or at the end of its group (default: work).
 function position(button,page){
  const nav=document.querySelector('body>aside nav');if(!nav)return;
  const items=[...nav.children];
  let anchor=null;
  if(page.after){anchor=items.find(n=>n.dataset.view===page.after||n.dataset.view===viewOf(page.after))||null;if(!anchor)console.warn('[extensions] rail item «'+page.after+'» not found; «'+page.id+'» goes to the end of its group');}
  if(!anchor){const group=page.group||'work';button.dataset.railGroup=group;anchor=items.filter(n=>n!==button&&(GROUPS[group].includes(n.dataset.view)||n.dataset.railGroup===group)).at(-1)||items.filter(n=>n!==button).at(-1);}
  else delete button.dataset.railGroup;
  if(anchor&&anchor!==button&&anchor.nextElementSibling!==button)anchor.after(button);
 }
 async function addPage(entry,page,record){
  const id=viewOf(page.id);
  const section=document.createElement('section');section.id=id;section.className='view ext-page';section.hidden=true;section.dataset.extension=entry.id;
  const heading=document.createElement('h1');heading.textContent=page.title;heading.dataset.title=page.title;
  const status=document.createElement('p');status.className='ux-page-status';status.hidden=true;status.setAttribute('role','status');
  const body=document.createElement('div');body.className='ext-page-body';window.petyaTabs?.mark(body,'main');
  section.append(heading,status,body);
  const footer=document.querySelector('main>footer');if(footer)footer.before(section);else document.querySelector('main').append(section);
  const button=document.createElement('button');button.type='button';button.className='nav';button.dataset.view=id;button.dataset.extensionPage=entry.id;
  window.petyaRail?.item(button,page.title,page.iconSvg||entry.iconSvg||'');
  button.onclick=()=>view(id);
  position(button,page);
  const shows=[],item={view:id,button,section,shows,page};record.pages.push(item);
  const listener=event=>{if(event.detail===id)runShows(entry,shows);};document.addEventListener('petya-view',listener);item.listener=listener;
  await draw(entry,page.render,body,api(entry,page.id,shows,body));
  if(document.body.dataset.view===id)runShows(entry,shows);
 }
 async function addTab(entry,tab,target,record){
  const handle=window.petyaTabs.add(target,{owner:entry.id,name:entry.name||entry.id,iconSvg:entry.iconSvg||'',title:tab.title,order:tab.order??100});
  const shows=[];handle.onShow=()=>runShows(entry,shows);
  record.tabs.push({handle,target});
  await draw(entry,tab.render,handle.body,api(entry,target.startsWith('ext-')?target.slice(4):tab.page,shows,handle.body));
  const info=window.petyaTabs.info(target),open=document.body.dataset.view===target&&info?.active===window.petyaTabs.key(tab.title);
  if(open)runShows(entry,shows);
 }
 // Takes an app's places away; an open page of it goes back to the page before it.
 function teardown(id){
  const record=rendered.get(id);if(!record)return;rendered.delete(id);
  for(const t of record.tabs)t.handle.remove();
  for(const p of record.pages){
   document.removeEventListener('petya-view',p.listener);
   if(document.body.dataset.view===p.view){const back=[...visits].reverse().find(v=>v!==p.view&&document.getElementById(v)&&!rendered.get(id)?.pages.some(x=>x.view===v))||'home';view(back);}
   p.button.remove();p.section.remove();window.petyaTabs?.forget(p.view);
  }
 }
 let running=null,again=false;
 async function sync(){
  if(running){again=true;return running;}
  running=(async()=>{
   do{
    again=false;
    const entries=window.extensionHost?.entries()||[],{pages,tabs}=plan(entries);
    const want=new Map();
    for(const p of pages)want.set(p.entry.id,p.entry);for(const t of tabs)want.set(t.entry.id,t.entry);
    // Something of this app changed (removed, reloaded, a page of another app it used went away): draw it again.
    const shape=id=>JSON.stringify({rev:want.get(id)?.rev||0,pages:pages.filter(p=>p.entry.id===id).map(p=>p.page),tabs:tabs.filter(t=>t.entry.id===id).map(t=>[t.index,t.target])});
    for(const id of [...rendered.keys()])if(!want.has(id)||rendered.get(id).shape!==shape(id))teardown(id);
    const fresh=[];
    for(const [id,entry] of want){
     if(rendered.has(id))continue;
     const record={shape:shape(id),pages:[],tabs:[]};rendered.set(id,record);
     try{await window.extensionHost.scripts(id);fresh.push([entry,record]);}catch(e){problem(entry,'Не удалось загрузить скрипты приложения',': '+e.message);}
    }
    // Pages first: tabs may go to another app's page.
    for(const [entry,record] of fresh)for(const p of pages.filter(x=>x.entry===entry))await addPage(entry,p.page,record);
    for(const [entry,record] of fresh)for(const t of tabs.filter(x=>x.entry===entry)){try{await addTab(entry,t.tab,t.target,record);}catch(e){problem(entry,'Вкладка пропущена',': '+e.message);}}
    // Keep the declared order of the rail when pages come and go.
    for(const p of pages){const item=rendered.get(p.entry.id)?.pages.find(x=>x.page.id===p.page.id);if(item)position(item.button,p.page);}
   }while(again);
  })().finally(()=>{running=null;document.dispatchEvent(new Event('petya-extension-places'));});
  return running;
 }
 window.extensionPlaces={sync,rendered:()=>[...rendered.entries()].map(([id,r])=>({id,pages:r.pages.map(p=>p.view),tabs:r.tabs.map(t=>t.target)})),
  // For the review dialog: what an app adds to the menu and to which pages, as people read it.
  describe(ui){
   const names={learning:'Навыки',skills:'Навыки',team:'Команда',sources:'Материалы',settings:'Настройки',history:'История',agents:'Агенты',growth:'Развитие'};
   return {pages:(ui?.pages||[]).map(p=>p.title),tabs:(ui?.tabs||[]).map(t=>((window.t||String)(names[t.page]||t.page))+' → '+t.title)};
  }};
 document.addEventListener('petya-extensions-changed',()=>{sync().catch(e=>console.error('[extensions] places:',e));});
 window.addEventListener('load',()=>{sync().catch(e=>console.error('[extensions] places:',e));});
})();
