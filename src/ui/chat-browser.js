// Browser next to the chat (src/features/chat-browser.cjs): the right panel with a toolbar; the page itself is
// drawn by the main process over the panel's surface. Each chat keeps its own page: switching chats hides one
// and brings back the other. Links in the chat open here (Cmd/Ctrl+click — in the system browser).
(()=>{
 const call=(method,...args)=>window.petya.feature('chatBrowser',method,...args);
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const icon=d=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
 const topic=()=>typeof topicSelect!=='undefined'?topicSelect.value:'';
 let ui=null,observer=null,current='';
 const surfaceRect=()=>{const r=ui?.surface.getBoundingClientRect();return r?{x:r.left,y:r.top,width:r.width,height:r.height}:null;};
 // The page is a separate view above the window: hide it while a dialog or another screen covers the chat.
 const covered=()=>!!document.querySelector('dialog[open]')||document.getElementById('home')?.hidden||!ui?.surface.isConnected;
 let raf=0;const sync=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!ui)return;if(covered()){call('hide').catch(()=>{});return;}call('show',current,surfaceRect()).then(paint).catch(()=>{});});};
 function button(title,path,onClick){const b=el('button','chat-browser-tool');b.type='button';b.title=title;b.setAttribute('aria-label',title);b.innerHTML=icon(path);b.onclick=onClick;return b;}
 function build(){
  const root=el('div','chat-browser'),bar=el('div','chat-browser-bar'),address=el('input','chat-browser-address');
  address.type='text';address.placeholder='Адрес или запрос';address.setAttribute('aria-label','Адрес страницы');address.spellcheck=false;
  const back=button('Назад','M15 18l-6-6 6-6',()=>call('back',current).then(paint).catch(()=>{}));
  const forward=button('Вперёд','M9 18l6-6-6-6',()=>call('forward',current).then(paint).catch(()=>{}));
  const reload=button('Обновить','M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',()=>call(ui.loading?'stop':'reload',current).then(paint).catch(()=>{}));
  const external=button('Открыть в системном браузере','M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',()=>call('external',current).catch(e=>notice(e.message,true)));
  address.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();call('navigate',current,address.value).then(paint).catch(err=>notice(err.message,true));address.blur();}if(e.key==='Escape'){address.value=ui.url||'';address.blur();}});
  address.addEventListener('focus',()=>address.select());
  const surface=el('div','chat-browser-surface'),status=el('div','chat-browser-status');
  // Why Petya opened this page: a sign-in, a CAPTCHA or a consent screen on its way (see attend in the feature).
  const need=el('div','chat-browser-attention'),needText=el('span','chat-browser-attention-text'),needAction=el('button','chat-browser-attention-action');
  needAction.type='button';needAction.onclick=()=>call('act',current).catch(e=>notice(e.message,true));
  const needClose=button('Скрыть подсказку','M6 6l12 12M18 6L6 18',()=>call('dismiss',current).then(paint).catch(()=>{}));needClose.classList.add('chat-browser-attention-close');
  need.append(needText,needAction,needClose);need.hidden=true;need.setAttribute('role','status');
  bar.append(back,forward,reload,address,external);
  // Tabs: one per page; «+» opens a new one, × closes it (the last one closes the browser).
  const strip=el('div','chat-browser-tabs');strip.setAttribute('role','tablist');strip.setAttribute('aria-label','Вкладки браузера');
  root.append(strip,bar,need,surface,status);
  return {root,strip,bar,address,back,forward,reload,surface,status,need,needText,needAction,url:'',loading:false,tabsKey:''};
 }
 function paint(state){
  if(!ui||!state||(state.topicId&&state.topicId!==current))return;
  ui.url=state.url||'';ui.loading=!!state.loading;
  // Another tab in front: its address replaces whatever was being typed.
  const switched=state.active&&state.active!==ui.activeTab;if(state.active)ui.activeTab=state.active;
  if(switched||document.activeElement!==ui.address)ui.address.value=ui.url;
  ui.back.disabled=!state.canBack;ui.forward.disabled=!state.canForward;
  ui.reload.title=state.loading?'Остановить':'Обновить';ui.reload.classList.toggle('loading',!!state.loading);
  ui.need.hidden=!state.attention;ui.needText.textContent=state.attention?.message||'';ui.needAction.textContent=state.attention?.action||'';ui.needAction.hidden=!state.attention?.action;
  paintTabs(state);
  ui.status.textContent=state.error?'Не удалось открыть страницу: '+state.error:'';ui.status.hidden=!state.error;
  const box=window.resultKit?.panelBox();if(box){const t=box.querySelector('.kit-panel-title'),sub=box.querySelector('.kit-panel-subtitle');if(t)t.textContent=state.title||'Браузер';if(sub){sub.textContent=state.url?new URL(state.url).host:'';sub.hidden=!state.url;}}
 }
 const host=url=>{try{return new URL(url).host.replace(/^www\./,'');}catch{return '';}};
 function paintTabs(state){
  if(!Array.isArray(state.tabs))return;
  const sig=JSON.stringify([state.active,state.tabs]);if(sig===ui.tabsKey)return;ui.tabsKey=sig;
  const items=state.tabs.map(tab=>{
   const item=el('div','chat-browser-tab'+(tab.id===state.active?' active':'')+(tab.loading?' loading':''));
   const pick=el('button','chat-browser-tab-title',tab.title||host(tab.url)||'Новая вкладка');pick.type='button';pick.title=(tab.title?tab.title+'\n':'')+(tab.url||'');
   pick.setAttribute('role','tab');pick.setAttribute('aria-selected',String(tab.id===state.active));
   pick.onclick=()=>{if(tab.id!==state.active)call('selectTab',current,tab.id).then(paint).then(sync).catch(e=>notice(e.message,true));};
   pick.onauxclick=e=>{if(e.button===1)closeTab(tab.id);};
   const x=button('Закрыть вкладку','M6 6l12 12M18 6L6 18',()=>closeTab(tab.id));x.classList.add('chat-browser-tab-close');
   item.append(pick,x);return item;});
  const add=button('Новая вкладка','M12 5v14M5 12h14',()=>call('newTab',current,'').then(paint).then(()=>{sync();ui?.address.focus();}).catch(e=>notice(e.message,true)));add.classList.add('chat-browser-tab-add');
  ui.strip.replaceChildren(...items,add);
 }
 async function closeTab(tabId){const state=await call('closeTab',current,tabId).catch(e=>{notice(e.message,true);return null;});if(!state)return;if(!state.open){window.resultKit?.closePanel();return;}paint({...state,topicId:current});sync();}
 // Opens the panel for the current chat (and loads url, if given).
 async function openBrowser(url=''){
  const kit=window.resultKit,id=topic();if(!kit||!id)return;
  current=id;ui=build();
  kit.panel({id:'browser:'+id,title:'Браузер',subtitle:'',className:'kit-panel-browser',body:ui.root,actions:[]});
  observer?.disconnect();observer=new ResizeObserver(sync);observer.observe(ui.surface);
  const state=await call('open',id,url);paint({...state,topicId:id});sync();
 }
 window.openChatBrowser=openBrowser;
 // Petya stopped at a page that needs the person: bring the chat's browser up (the chat stays open beside it).
 window.petyaEvents.onChatBrowser?.(state=>{
  if(state.reveal&&state.topicId===topic()){if(document.getElementById('home')?.hidden&&typeof view==='function')view('home');if(!(ui&&current===state.topicId))openBrowser('').catch(()=>{});else{paint(state);sync();}return;}
  if(state.topicId===current)paint(state);});
 document.addEventListener('petya-panel',e=>{
  // Another panel (a file preview) took the place: hide the page; the chat keeps its browser.
  if(e.detail.open&&ui&&e.detail.id!=='browser:'+current){observer?.disconnect();observer=null;ui=null;call('hide').catch(()=>{});return;}
  if(!String(e.detail.id||'').startsWith('browser:')||e.detail.open)return;
  const id=e.detail.id.slice(8);observer?.disconnect();observer=null;ui=null;
  // × / Esc closes this chat's browser; switching chats only hides it (it comes back with the chat).
  if(e.detail.reason==='chat')call('hide').catch(()=>{});else call('close',id).catch(()=>{});
 });
 // Another chat: bring back its browser if it had one open.
 let restoring=0;const restore=async()=>{const id=topic(),mine=++restoring;if(!id||(ui&&current===id))return;
  try{const state=await call('state',id);if(mine!==restoring||topic()!==id)return;if(state.open&&!(ui&&current===id))await openBrowser('');}catch{}};
 for(const ev of ['petya-chat-opened','petya-dialogue-state'])document.addEventListener(ev,()=>setTimeout(restore,0));
 document.addEventListener('petya-view',()=>setTimeout(()=>{if(ui)sync();else restore();},0));
 window.addEventListener('resize',sync);
 new MutationObserver(()=>{if(ui)sync();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
 // Links in chat messages open next to the chat; Cmd/Ctrl/Shift+click keeps the system browser.
 document.addEventListener('click',e=>{
  const a=e.target.closest?.('a[href]');if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0)return;
  if(!a.closest('.chat-feed, #dialogue-messages, .kit-panel-body')||a.closest('.chat-browser'))return;
  let url;try{url=new URL(a.href);}catch{return;}if(!['https:','http:'].includes(url.protocol))return;
  // An app may open its service's links in the service's own program (window.petyaLinkOpeners, e.g. a messenger's message links).
  for(const opener of window.petyaLinkOpeners||[]){let opened=false;try{opened=opener(url);}catch{opened=false;}if(opened){e.preventDefault();return;}}
  e.preventDefault();openBrowser(url.href).catch(err=>notice(err.message,true));
 },true);
 // A button in the chat header opens this chat's browser.
 const addButton=()=>{const heading=document.querySelector('.chat-heading');if(!heading||document.getElementById('chat-browser-open'))return;
  const b=el('button','quiet');b.type='button';b.id='chat-browser-open';b.title='Браузер справа от чата';b.setAttribute('aria-label',b.title);
  b.innerHTML=icon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z');b.append(' Браузер');
  b.onclick=()=>{if(ui&&current===topic())window.resultKit.closePanel();else openBrowser('');};heading.append(b);};
 addButton();document.addEventListener('petya-chat-opened',addButton);
})();
