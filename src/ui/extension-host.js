// Only validated extension descriptors can supply renderer scripts: bundled ones from ../extensions/<id>/,
// installed and development ones only through petya-ext://<id>/ (served from that extension's own folder by
// src/extension-runtime.cjs). No other script source is ever built here.
(()=>{
 const loaded=new Set();let entries=window.petyaExtensionDescriptors;
 // A script URL of one extension: its base from the main process plus a checked file name.
 const source=(entry,file)=>{
  if(!/^[a-z][a-z0-9-]*\.js$/.test(file))throw Error('Недопустимый файл расширения.');
  const base=entry.origin&&entry.origin!=='bundled'?'petya-ext://'+entry.id+'/':'../extensions/'+entry.id+'/';
  return base+file+(entry.origin&&entry.origin!=='bundled'?'?v='+(entry.rev||0):'');
 };
 const allowed=src=>/^\.\.\/extensions\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.js$/.test(src)||/^petya-ext:\/\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.js\?v=\d+$/.test(src);
 // One load per script even when two cards of the same app render at once (a second script would run the app twice).
 const pending=new Map();
 const load=src=>{
  if(!allowed(src))return Promise.reject(Error('Недопустимый файл расширения.'));
  if(loaded.has(src))return Promise.resolve();
  if(!pending.has(src))pending.set(src,new Promise((resolve,reject)=>{const script=document.createElement('script');if(src.startsWith('petya-ext:'))script.crossOrigin='anonymous';script.src=src;script.onload=()=>{loaded.add(src);pending.delete(src);resolve();};script.onerror=()=>{pending.delete(src);reject(Error('Не удалось загрузить '+src));};document.body.append(script);}));
  return pending.get(src);
 };
 function fold(card){
  if(card.classList.contains('settings-card'))return;
  const heading=card.querySelector('h2');if(!heading)return;
  const disclosure=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
  disclosure.className='settings-disclosure';body.className='settings-disclosure-body';summary.append(heading);body.append(...card.childNodes);disclosure.append(summary,body);card.append(disclosure);card.classList.add('settings-card');
 }
 const templates=new Set();
 function template(entry){
  if(!entry.template||templates.has(entry.id))return;templates.add(entry.id);
  const form=document.getElementById('settings-form');form?.querySelector(':scope>button[type=submit]')?.insertAdjacentHTML('beforebegin',entry.template);
 }
 // Concurrent mounts of one extension share one run (several cards rendering at once).
 const mounting=new Map();
 function mount(entry){if(!mounting.has(entry.id))mounting.set(entry.id,mountOnce(entry).finally(()=>mounting.delete(entry.id)));return mounting.get(entry.id);}
 async function mountOnce(entry){
  template(entry);
  for(const [file] of entry.scripts)await load(source(entry,file));
  let card=document.querySelector('[data-extension="'+entry.id+'"]');
  // An installed extension without its own settings still gets a card, so everything added is visible in settings.
  if(!card&&!entry.service&&entry.installed){card=document.createElement('article');card.className='card';card.dataset.extension=entry.id;const h=document.createElement('h2');h.textContent=entry.name||entry.id;const p=document.createElement('p');p.textContent=(entry.description||'')+' Используется в чате, настроек нет.';card.append(h,p);
   // In the catalog's order whichever app finishes loading its scripts first.
   const form=document.getElementById('settings-form'),rank=id=>entries.findIndex(e=>e.id===id),next=[...form.querySelectorAll(':scope>[data-extension]')].find(c=>rank(c.dataset.extension)>rank(entry.id));form.insertBefore(card,next||null);}
  if(card){card.hidden=entry.service?!moduleEnabled(entry.id):!entry.installed;fold(card);}
  document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:entry.id}));
  document.dispatchEvent(new Event('petya-extensions-changed'));return card;
 }
 async function refresh(){entries=await window.petya.feature('extensionUI','catalog');return entries;}
 // A development reload: the new scripts run again (cache-busted URL), and the open chat redraws its cards.
 async function reload(id){
  await refresh();
  const entry=entries.find(e=>e.id===id);if(!entry)return;
  for(const link of document.querySelectorAll('link[rel=stylesheet]'))if(link.href.startsWith('petya-ext://'+id+'/'))link.remove();
  if(entry.installed)await mount(entry);
  if(typeof showDialogueMessages==='function'&&typeof chatHistory!=='undefined')showDialogueMessages(chatHistory);
 }
 window.extensionHost={source,allowed,refresh,reload,entries:()=>entries,
  // The renderer scripts of one added extension, loaded once (pages and tabs it adds: extension-places.js).
  async scripts(id){const entry=entries.find(e=>e.id===id);if(!entry)throw Error('Расширение не найдено.');for(const [file] of entry.scripts)await load(source(entry,file));},
  async remove(id){entries=await window.petya.feature('extensionUI','uninstall',id);const card=document.querySelector('[data-extension="'+id+'"]');if(card)card.hidden=true;document.dispatchEvent(new Event('petya-extensions-changed'));},
  // A card is interface, not message text: what the renderer adds to the message gets [data-i18n], so the
  // interface translation (i18n.js) covers it while the message text around it and [data-no-i18n] inside it stay.
  async render(parent,message){for(const entry of entries)for(const [key,handler] of Object.entries(entry.results||{})){const data=message.extensionData?.[key]||message[key];if(!data)continue;try{parent.dataset.extensionPresentation='true';if(!window[handler])await mount(entry);const before=new Set(parent.children);window[handler]?.(parent,data);for(const node of parent.children)if(!before.has(node))node.dataset.i18n='';}catch(e){notice(e.message,true);}}},
  async openMany(ids){entries=await window.petya.feature('extensionUI','installMany',ids);for(const id of ids){const entry=entries.find(e=>e.id===id);if(entry)await mount(entry);}return entries;},
  async open(id,{stay=false}={}){entries=await window.petya.feature('extensionUI','install',id);const entry=entries.find(e=>e.id===id),card=await mount(entry);if(stay){notice('«'+(entry.name||id)+'» добавлено.');return;}view('settings');if(card)window.revealSettings?.(card);else notice('Расширение добавлено. Используйте его в чате.');},
  // After an installation from a file: the new extension's scripts and settings card, without a restart.
  async installed(id){await refresh();const entry=entries.find(e=>e.id===id);if(entry?.installed)await mount(entry);document.dispatchEvent(new Event('petya-extensions-changed'));return entry;}};
 window.addEventListener('load',()=>{for(const card of document.querySelectorAll('[data-extension]'))fold(card);for(const entry of entries)if(!entry.service&&entry.installed&&!document.querySelector('[data-extension="'+entry.id+'"]'))mount(entry).catch(()=>{});document.dispatchEvent(new Event('petya-extensions-changed'));});
 // Events of installed and development extensions: catalog changes, development reloads, notifications (with
 // «Перезапустить» when code can only be unloaded by a restart, «Открыть папку» for load errors).
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 window.petyaEvents?.onExtensionRuntime?.(async event=>{
  try{
   if(event.type==='changed'){await refresh();document.dispatchEvent(new Event('petya-extensions-changed'));}
   else if(event.type==='reload')await reload(event.id);
   else if(event.type==='notice'){
    const n=event.notice,actions=[];
    if(n.restart)actions.push(['Перезапустить',()=>window.petya.feature('extensionUI','restart')]);
    if(n.folder&&n.extension&&n.extension!=='dev')actions.push(['Открыть папку',()=>window.petya.feature('extensionUI','openFolder',n.extension)]);
    put({id:n.id,title:n.title,text:n.text,kind:n.kind,version:n.text+':'+Date.now(),actions});
   }
  }catch(e){console.warn('Extension event',e.message);}
 });
 // A renderer script of an installed or development extension that throws: a notification with file and line.
 window.addEventListener('error',event=>{
  const file=String(event.filename||'');if(!file.startsWith('petya-ext://'))return;
  const url=new URL(file),id=url.hostname;
  put({id:'extension-error:'+id,title:'Ошибка расширения',text:url.pathname.slice(1)+':'+event.lineno+': '+event.message,kind:'error',version:file+event.lineno+event.message,actions:[['Открыть папку',()=>window.petya.feature('extensionUI','openFolder',id)]]});
 });
 for(const entry of entries)template(entry);
 const scripts=[];
 for(const node of document.querySelectorAll('script[type="application/petya-script"]')){
  scripts.push(node.dataset.src);
  for(const entry of entries)for(const [file,after] of entry.scripts){
   if(after===node.dataset.src&&(entry.service||entry.installed||file==='notifications.js'||!entry.settings)){try{scripts.push(source(entry,file));}catch{}}
  }
 }
 for(const src of scripts){loaded.add(src);document.write('<script src="'+src+'"'+(src.startsWith('petya-ext:')?' crossorigin="anonymous"':'')+'><'+'/script>');}
})();
