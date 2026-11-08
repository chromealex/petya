// Browser next to the chat: a web view docked in the right panel of the main window, one per chat. Each chat
// remembers its page (topic.browser = {url, title, open}), so switching chats brings back that chat's page.
// The renderer (src/ui/chat-browser.js) draws the panel and its toolbar and reports where the page goes; the
// page itself is a WebContentsView laid over that spot. Only http(s) pages; pop-ups open in the same view.
// Petya's own browsing uses the same sessions: when a search or a service page stops at a sign-in, a CAPTCHA or
// a consent screen, that page opens here (attend), the person passes it, and Petya goes on with the same cookies.
const DEFAULT='https://www.google.com/';
// Browser sessions shared with Petya's own browsing (src/search-browser.cjs, src/service-browser.cjs).
const WEB='petya-web-search';
function setup(s){
 const views=new Map(),attention=new Map();let shown=null,rect=null;
 const topic=id=>{const t=s.dialogue.state.topics.find(t=>t.id===id);if(!t)throw Error('Чат не найден.');return t;};
 const web=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
 const send=(id,extra={})=>{const w=s.win;if(!w||w.isDestroyed())return;w.webContents.send('chat-browser',{topicId:id,...state(id),...extra});};
 function state(id){
  const t=s.dialogue.state.topics.find(t=>t.id===id),v=views.get(id)?.webContents;
  const need=attention.get(id);
  return {attention:need?{message:need.message,action:need.action||''}:null,open:!!t?.browser?.open,url:v&&!v.isDestroyed()?v.getURL()||t?.browser?.url||'':t?.browser?.url||'',title:v&&!v.isDestroyed()?v.getTitle():t?.browser?.title||'',
   loading:!!v&&!v.isDestroyed()&&v.isLoading(),canBack:!!v&&!v.isDestroyed()&&v.navigationHistory.canGoBack(),canForward:!!v&&!v.isDestroyed()&&v.navigationHistory.canGoForward()};
 }
 const remember=(id,patch)=>{const t=s.dialogue.state.topics.find(t=>t.id===id);if(!t)return;t.browser={...(t.browser||{}),...patch};s.dialogue.persist();};
 const sessionOf=name=>{const {session}=require('electron');return require('../company-browser-session.cjs').companySession(session,s.dataRoot,name||WEB,true);};
 function view(id,partition){
  const old=views.get(id);
  if(old&&(!partition||old.__partition===partition))return old;
  if(old)drop(id);
  const {WebContentsView}=require('electron');
  const ses=sessionOf(partition||WEB);
  if(!ses.__petyaGuard){ses.__petyaGuard=true;ses.setPermissionRequestHandler((_wc,permission,done)=>done(['fullscreen','clipboard-sanitized-write'].includes(permission)));}
  const v=new WebContentsView({webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});
  v.__partition=partition||WEB;v.setBackgroundColor('#ffffff');
  const wc=v.webContents;
  wc.setWindowOpenHandler(({url})=>{const target=web(url);if(target)wc.loadURL(target).catch(()=>{});return {action:'deny'};});
  wc.on('will-navigate',(e,url)=>{if(!web(url))e.preventDefault();});
  const update=()=>{if(wc.isDestroyed())return;const url=wc.getURL();if(web(url))remember(id,{url,title:wc.getTitle()});check(id,url);send(id);};
  for(const ev of ['did-navigate','did-navigate-in-page','page-title-updated','did-start-loading','did-stop-loading'])wc.on(ev,update);
  wc.on('did-fail-load',(_e,code,description,url,main)=>{if(main&&code!==-3)send(id,{error:description||('Ошибка '+code)});});
  views.set(id,v);return v;
 }
 // The check is passed once the page leaves it (attend's `passed`): Petya continues by itself.
 function check(id,url){const need=attention.get(id);if(!need||!need.passed||!web(url))return;let done=false;try{done=need.passed(url);}catch{}if(!done)return;attention.delete(id);try{need.onPassed?.(url);}catch{}}
 function drop(id){const v=views.get(id);if(!v)return;const w=s.win;if(w&&!w.isDestroyed()&&w.contentView.children.includes(v))w.contentView.removeChildView(v);if(!v.webContents.isDestroyed())v.webContents.close();views.delete(id);if(shown===id)shown=null;}
 function attach(id){
  const w=s.win;if(!w||w.isDestroyed())return;
  for(const [other,v] of views)if(other!==id&&w.contentView.children.includes(v))w.contentView.removeChildView(v);
  shown=id;const v=views.get(id);if(!v||!rect)return;
  if(!w.contentView.children.includes(v))w.contentView.addChildView(v);
  const scale=w.webContents.getZoomFactor();v.setBounds({x:Math.round(rect.x*scale),y:Math.round(rect.y*scale),width:Math.max(0,Math.round(rect.width*scale)),height:Math.max(0,Math.round(rect.height*scale))});
 }
 function hide(){const w=s.win;if(w&&!w.isDestroyed())for(const v of views.values())if(w.contentView.children.includes(v))w.contentView.removeChildView(v);shown=null;return true;}
 async function open(id,url='',{partition}={}){
  const t=topic(id),target=web(url)||t.browser?.url||DEFAULT;
  const v=view(id,partition);remember(id,{open:true,url:target});
  if(url||!v.webContents.getURL())await v.webContents.loadURL(web(target)||DEFAULT).catch(()=>{});
  return state(id);
 }
 // Text from the address bar: an address, or a search.
 function navigate(id,input){
  const text=String(input||'').trim().slice(0,2000);if(!text)throw Error('Введите адрес или запрос.');
  const url=web(text)||(/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)?'https://'+text:'https://www.google.com/search?'+new URLSearchParams({q:text}));
  return open(id,url);
 }
 const act=(id,fn)=>{const v=views.get(id);if(!v||v.webContents.isDestroyed())throw Error('Браузер этого чата закрыт.');fn(v.webContents);return state(id);};
 function close(id){drop(id);attention.delete(id);remember(id,{open:false});return state(id);}
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
 // The page Petya reads after the person signed in (src/service-browser.cjs → read).
 const contents=(id,partition)=>{const v=views.get(id);return v&&!v.webContents.isDestroyed()&&(!partition||v.__partition===partition)?v.webContents:null;};
 const find=partition=>{const active=s.dialogue.active?.()?.id;if(active&&contents(active,partition))return contents(active,partition);for(const id of views.keys()){const wc=contents(id,partition);if(wc)return wc;}return null;};
 // Chats removed from the dialogue lose their views.
 const prune=()=>{for(const id of [...views.keys()])if(!s.dialogue.state.topics.some(t=>t.id===id&&!t.archived))close(id);};
 const timer=setInterval(prune,60000);timer.unref?.();
 return {chatBrowser:{open,navigate,close,state,attend,contents,find,WEB},ipc:{
  state:id=>state(String(id||'')),
  open:(id,url)=>open(String(id),url),
  navigate:(id,input)=>navigate(String(id),input),
  show:(id,box)=>{if(box&&[box.x,box.y,box.width,box.height].every(Number.isFinite))rect=box;if(views.has(id)||topic(id).browser?.open){view(id);if(!views.get(id).webContents.getURL())open(id).catch(()=>{});attach(id);}return state(id);},
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
