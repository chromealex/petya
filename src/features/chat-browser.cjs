// Browser next to the chat: a web view docked in the right panel of the main window, with tabs, per chat. Each chat
// remembers its tabs (topic.browser = {tabs, active, url, title, open}), so switching chats brings back that chat's page.
// The renderer (src/ui/chat-browser.js) draws the panel and its toolbar and reports where the page goes; the
// page itself is a WebContentsView laid over that spot. Only http(s) pages; pop-ups open in a new tab.
// Petya's own browsing uses the same sessions: when a search or a service page stops at a sign-in, a CAPTCHA or
// a consent screen, that page opens here (attend), the person passes it, and Petya goes on with the same cookies.
const DEFAULT='https://www.google.com/';
// Browser sessions shared with Petya's own browsing (src/search-browser.cjs, src/service-browser.cjs).
const WEB='petya-web-search';
function setup(s){
 // Tabs per chat: tabs.get(chatId) = {list:[{id,url,title}], active}; one view per open tab, keyed «chat#tab».
 const views=new Map(),attention=new Map(),tabs=new Map();let shown=null,rect=null;
 const MAX_TABS=12;
 const topic=id=>{const t=s.dialogue.state.topics.find(t=>t.id===id);if(!t)throw Error('Чат не найден.');return t;};
 const web=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
 const key=(id,tab)=>id+'#'+tab;
 const newId=()=>require('node:crypto').randomUUID().slice(0,8);
 // The chat's tabs, restored from what it remembered (older chats kept a single page: topic.browser.url).
 function tabsOf(id){
  let t=tabs.get(id);if(t)return t;
  const saved=s.dialogue.state.topics.find(x=>x.id===id)?.browser||{};
  const list=(Array.isArray(saved.tabs)&&saved.tabs.length?saved.tabs:[{id:newId(),url:saved.url||'',title:saved.title||''}])
   .filter(x=>x&&typeof x.id==='string').slice(0,MAX_TABS).map(x=>({id:x.id,url:web(x.url)||'',title:String(x.title||'').slice(0,200)}));
  if(!list.length)list.push({id:newId(),url:'',title:''});
  t={list,active:list.some(x=>x.id===saved.active)?saved.active:list[0].id};tabs.set(id,t);return t;
 }
 const activeView=id=>views.get(key(id,tabsOf(id).active));
 const send=(id,extra={})=>{const w=s.win;if(!w||w.isDestroyed())return;w.webContents.send('chat-browser',{topicId:id,...state(id),...extra});};
 function state(id){
  const t=s.dialogue.state.topics.find(t=>t.id===id),list=t?tabsOf(id):{list:[],active:''},v=t?activeView(id)?.webContents:null,live=v&&!v.isDestroyed();
  const tab=list.list.find(x=>x.id===list.active);
  const need=attention.get(id);
  return {attention:need?{message:need.message,action:need.action||''}:null,open:!!t?.browser?.open,url:live?v.getURL()||tab?.url||'':tab?.url||t?.browser?.url||'',title:live?v.getTitle():tab?.title||t?.browser?.title||'',
   loading:!!live&&v.isLoading(),canBack:!!live&&v.navigationHistory.canGoBack(),canForward:!!live&&v.navigationHistory.canGoForward(),
   active:list.active,tabs:list.list.map(x=>{const wc=views.get(key(id,x.id))?.webContents,ok=wc&&!wc.isDestroyed();return {id:x.id,url:ok?wc.getURL()||x.url:x.url,title:ok?wc.getTitle()||x.title:x.title,loading:!!ok&&wc.isLoading()};})};
 }
 // What the chat remembers: every tab's page, the active one, and (for older code) the active page as url/title.
 const remember=(id,patch={})=>{const t=s.dialogue.state.topics.find(t=>t.id===id);if(!t)return;const list=tabsOf(id),tab=list.list.find(x=>x.id===list.active);
  t.browser={...(t.browser||{}),...patch,tabs:list.list.map(({id,url,title})=>({id,url,title})),active:list.active,url:tab?.url||'',title:tab?.title||''};s.dialogue.persist();};
 const sessionOf=name=>{const {session}=require('electron');return require('../company-browser-session.cjs').companySession(session,s.dataRoot,name||WEB,true);};
 function view(id,partition,tabId=tabsOf(id).active){
  const k=key(id,tabId),old=views.get(k);
  if(old&&(!partition||old.__partition===partition))return old;
  if(old)dropView(k);
  const {WebContentsView}=require('electron');
  const ses=sessionOf(partition||WEB);
  if(!ses.__petyaGuard){ses.__petyaGuard=true;ses.setPermissionRequestHandler((_wc,permission,done)=>done(['fullscreen','clipboard-sanitized-write'].includes(permission)));}
  const v=new WebContentsView({webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});
  v.__partition=partition||WEB;v.setBackgroundColor('#ffffff');
  const wc=v.webContents;
  // Pop-ups and «open in a new tab» links become a new tab of this chat.
  wc.setWindowOpenHandler(({url})=>{const target=web(url);if(target)newTab(id,target,{partition:v.__partition}).catch(()=>{});return {action:'deny'};});
  wc.on('will-navigate',(e,url)=>{if(!web(url))e.preventDefault();});
  const update=()=>{if(wc.isDestroyed())return;const url=wc.getURL(),tab=tabsOf(id).list.find(x=>x.id===tabId);if(tab&&web(url)){tab.url=url;tab.title=wc.getTitle();remember(id);}check(id,url);send(id);};
  for(const ev of ['did-navigate','did-navigate-in-page','page-title-updated','did-start-loading','did-stop-loading'])wc.on(ev,update);
  wc.on('did-fail-load',(_e,code,description,url,main)=>{if(main&&code!==-3&&tabsOf(id).active===tabId)send(id,{error:description||('Ошибка '+code)});});
  views.set(k,v);return v;
 }
 // The check is passed once the page leaves it (attend's `passed`): Petya continues by itself.
 function check(id,url){const need=attention.get(id);if(!need||!need.passed||!web(url))return;let done=false;try{done=need.passed(url);}catch{}if(!done)return;attention.delete(id);try{need.onPassed?.(url);}catch{}}
 function dropView(k){const v=views.get(k);if(!v)return;const w=s.win;if(w&&!w.isDestroyed()&&w.contentView.children.includes(v))w.contentView.removeChildView(v);if(!v.webContents.isDestroyed())v.webContents.close();views.delete(k);}
 function drop(id){for(const k of [...views.keys()])if(k.startsWith(id+'#'))dropView(k);if(shown===id)shown=null;}
 function attach(id){
  const w=s.win;if(!w||w.isDestroyed())return;
  const v=activeView(id);
  for(const other of views.values())if(other!==v&&w.contentView.children.includes(other))w.contentView.removeChildView(other);
  shown=id;if(!v||!rect)return;
  if(!w.contentView.children.includes(v))w.contentView.addChildView(v);
  const scale=w.webContents.getZoomFactor();v.setBounds({x:Math.round(rect.x*scale),y:Math.round(rect.y*scale),width:Math.max(0,Math.round(rect.width*scale)),height:Math.max(0,Math.round(rect.height*scale))});
 }
 function hide(){const w=s.win;if(w&&!w.isDestroyed())for(const v of views.values())if(w.contentView.children.includes(v))w.contentView.removeChildView(v);shown=null;return true;}
 // Loads the active tab's page — not while it is still loading its first page: the address is empty until the page
 // commits, and loading it again from every panel repaint restarted the request forever (a white page).
 async function load(id,url=''){
  const list=tabsOf(id),tab=list.list.find(x=>x.id===list.active),v=view(id),wc=v.webContents;
  const target=web(url)||tab?.url||DEFAULT;if(tab&&web(url))tab.url=web(url);
  if(url||!wc.getURL()&&!wc.isLoading())await wc.loadURL(web(target)||DEFAULT).catch(error=>{if(!/ERR_ABORTED/.test(String(error?.message))&&!wc.isDestroyed())send(id,{error:String(error?.message||error).replace(/^.*?(ERR_[A-Z_]+).*$/s,'$1')});});
 }
 async function open(id,url='',{partition}={}){
  topic(id);const list=tabsOf(id);
  // A page in another browser session (Petya's sign-in) gets its own tab instead of replacing the person's page.
  const current=activeView(id);if(partition&&current&&current.__partition!==partition){const other=list.list.find(x=>views.get(key(id,x.id))?.__partition===partition);if(!other)return newTab(id,url,{partition});list.active=other.id;}
  view(id,partition);remember(id,{open:true});
  const p=load(id,url);if(shown===id)attach(id);await p;
  return state(id);
 }
 async function newTab(id,url='',{partition}={}){
  topic(id);const list=tabsOf(id);if(list.list.length>=MAX_TABS)throw Error('В браузере чата не больше '+MAX_TABS+' вкладок.');
  const tab={id:newId(),url:web(url)||'',title:''};const at=list.list.findIndex(x=>x.id===list.active);list.list.splice(at+1,0,tab);list.active=tab.id;
  view(id,partition,tab.id);remember(id,{open:true});
  const p=load(id,url||DEFAULT);if(shown===id)attach(id);send(id);await p;
  return state(id);
 }
 function selectTab(id,tabId){
  const list=tabsOf(id);if(!list.list.some(x=>x.id===tabId))throw Error('Вкладка закрыта.');
  list.active=tabId;view(id);remember(id);load(id).catch(()=>{});if(shown===id)attach(id);return state(id);
 }
 function closeTab(id,tabId){
  const list=tabsOf(id),at=list.list.findIndex(x=>x.id===tabId);if(at<0)return state(id);
  if(list.list.length===1)return close(id);
  dropView(key(id,tabId));list.list.splice(at,1);
  if(list.active===tabId){list.active=list.list[Math.min(at,list.list.length-1)].id;view(id);load(id).catch(()=>{});}
  remember(id);if(shown===id)attach(id);return state(id);
 }
 // Text from the address bar: an address, or a search.
 function navigate(id,input){
  const text=String(input||'').trim().slice(0,2000);if(!text)throw Error('Введите адрес или запрос.');
  const url=web(text)||(/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)?'https://'+text:'https://www.google.com/search?'+new URLSearchParams({q:text}));
  return open(id,url);
 }
 const act=(id,fn)=>{const v=activeView(id);if(!v||v.webContents.isDestroyed())throw Error('Браузер этого чата закрыт.');fn(v.webContents);return state(id);};
 // Closing the browser keeps only the page that was in front: it opens again with the chat's browser.
 function close(id){drop(id);attention.delete(id);const list=tabs.get(id);if(list){const tab=list.list.find(x=>x.id===list.active)||list.list[0];list.list=[tab];list.active=tab.id;}remember(id,{open:false});return state(id);}
 // Petya stopped at a page that needs the person (sign-in, CAPTCHA, consent): open it next to the chat, in the
 // session Petya browses with, and show why. `passed(url)` says when the check is over; then `onPassed` runs.
 // `action` adds a button to the notice (onAction runs on click). Returns false when no chat can show it.
 async function attend(id,{url,partition=WEB,message='',action='',onAction,passed,onPassed}={}){
  if(!id||!s.dialogue.state.topics.some(t=>t.id===id)||!web(url))return false;
  attention.set(id,{message:String(message).slice(0,300),action,onAction,passed,onPassed});
  await open(id,url,{partition});send(id,{reveal:true});
  const w=s.win;if(w&&!w.isDestroyed()){if(w.isMinimized())w.restore();w.show();w.focus();}
  return true;
 }
 // The page Petya reads after the person signed in (src/service-browser.cjs → read): the active tab first.
 const contents=(id,partition)=>{
  const ok=v=>v&&!v.webContents.isDestroyed()&&(!partition||v.__partition===partition);
  const front=tabs.has(id)?activeView(id):null;if(ok(front))return front.webContents;
  for(const [k,v] of views)if(k.startsWith(id+'#')&&ok(v))return v.webContents;return null;};
 const find=partition=>{const active=s.dialogue.active?.()?.id;if(active&&contents(active,partition))return contents(active,partition);for(const id of tabs.keys()){const wc=contents(id,partition);if(wc)return wc;}return null;};
 // Chats removed from the dialogue lose their views.
 const prune=()=>{for(const id of [...tabs.keys()])if(!s.dialogue.state.topics.some(t=>t.id===id&&!t.archived)){drop(id);tabs.delete(id);attention.delete(id);}};
 const timer=setInterval(prune,60000);timer.unref?.();
 return {chatBrowser:{open,navigate,close,state,attend,contents,find,newTab,WEB},ipc:{
  state:id=>state(String(id||'')),
  open:(id,url)=>open(String(id),url),
  navigate:(id,input)=>navigate(String(id),input),
  newTab:(id,url)=>newTab(String(id),url),
  selectTab:(id,tab)=>selectTab(String(id),String(tab)),
  closeTab:(id,tab)=>closeTab(String(id),String(tab)),
  show:(id,box)=>{if(box&&[box.x,box.y,box.width,box.height].every(Number.isFinite))rect=box;if(activeView(id)||topic(id).browser?.open){view(id);load(id).catch(()=>{});attach(id);}return state(id);},
  bounds:box=>{if(box&&[box.x,box.y,box.width,box.height].every(Number.isFinite)){rect=box;if(shown)attach(shown);}return true;},
  hide,
  back:id=>act(id,wc=>wc.navigationHistory.goBack()),
  forward:id=>act(id,wc=>wc.navigationHistory.goForward()),
  reload:id=>act(id,wc=>wc.reload()),
  stop:id=>act(id,wc=>wc.stop()),
  close:id=>close(String(id)),
  act:id=>{const need=attention.get(String(id));if(!need?.onAction)throw Error('Нет действия.');return need.onAction();},
  dismiss:id=>{attention.delete(String(id));return state(String(id));},
  external:async id=>{const url=state(id).url;if(!web(url))throw Error('Нет открытой страницы.');await require('electron').shell.openExternal(url);return true;}
 }};
}
module.exports={name:'chatBrowser',setup};
