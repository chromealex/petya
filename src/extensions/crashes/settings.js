// «Крэши», settings: the crash sources Petya can read and whether each is added and connected. «Крэши» has no
// connection of its own; each source is set up in its own card (Sentry, Firebase Crashlytics) or in Petya's
// service settings (Google Play), opened from here.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const card=el('article','card');card.dataset.extension='crashes';card.dataset.manualSave='true';
 const list=el('div','crashes-sources');list.style.cssText='display:flex;flex-direction:column;gap:8px;margin:8px 0 12px';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',null,'Крэши'),el('p',null,'Крэши всех подключённых источников в одной карточке. Назовите источник в запросе, чтобы смотреть только его: «крэши в Google Play», «только Sentry».'),
  el('h3',null,'Источники'),list,status,
  el('p','small','Позже могут появиться: Unity Cloud Diagnostics / Backtrace, Bugsnag. У App Store Connect нет API со списком крэшей.'));
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 async function open(x){
  try{
   if(x.service&&typeof window.openChatServiceSettings==='function')await window.openChatServiceSettings(x.service);
   else await window.extensionHost?.open(x.extension);
  }catch(e){status.textContent=e.message;}
 }
 async function load(){
  let rows=[];try{rows=await window.petya.feature('crashes','sources');}catch(e){status.textContent=e.message;return;}
  list.replaceChildren();
  for(const x of rows){
   const row=el('div','crashes-source');row.style.cssText='display:flex;align-items:center;gap:10px';
   const dot=el('i');dot.style.cssText='flex:none;width:10px;height:10px;border-radius:3px;background:'+(x.color||'#8d9893');
   const name=el('b',null,x.name);name.setAttribute('data-no-i18n','');
   const state=el('span','small',x.ready?'подключён':x.added&&!x.connected?'добавлен, нужно подключить':x.connected?'подключён, но не добавлен':'не добавлен');
   const go=el('button',null,x.ready?'Настройки':'Подключить');go.type='button';go.onclick=()=>open(x);
   row.dataset.source=x.id;row.dataset.state=x.ready?'ready':'off';
   row.append(dot,name,state,go);list.append(row);
  }
  const ready=rows.filter(x=>x.ready).length;
  status.textContent=ready?'Подключено источников: '+ready+'.':'Подключите хотя бы один источник.';
 }
 document.addEventListener('petya-settings-displayed',()=>{if(!card.hidden)load();});
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='crashes')load();});
 load();
})();
