// Browser next to the chat: a web view docked in the right panel of the main window, one per chat. Each chat
// remembers its page (topic.browser = {url, title, open}), so switching chats brings back that chat's page.
// The renderer (src/ui/chat-browser.js) draws the panel and its toolbar and reports where the page goes; the
// page itself is a WebContentsView laid over that spot. Only http(s) pages; pop-ups open in the same view.
const DEFAULT='https://www.google.com/';
function setup(s){
 const views=new Map();let shown=null,rect=null;
 const topic=id=>{const t=s.dialogue.state.topics.find(t=>t.id===id);if(!t)throw Error('Чат не найден.');return t;};
 const web=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
 const send=(id,extra={})=>{const w=s.win;if(!w||w.isDestroyed())return;w.webContents.send('chat-browser',{topicId:id,...state(id),...extra});};
 function state(id){
  const t=s.dialogue.state.topics.find(t=>t.id===id),v=views.get(id)?.webContents;
  return {open:!!t?.browser?.open,url:v&&!v.isDestroyed()?v.getURL()||t?.browser?.url||'':t?.browser?.url||'',title:v&&!v.isDestroyed()?v.getTitle():t?.browser?.title||'',
   loading:!!v&&!v.isDestroyed()&&v.isLoading(),canBack:!!v&&!v.isDestroyed()&&v.navigationHistory.canGoBack(),canForward:!!v&&!v.isDestroyed()&&v.navigationHistory.canGoForward()};
 }
 const remember=(id,patch)=>{const t=s.dialogue.state.topics.find(t=>t.id===id);if(!t)return;t.browser={...(t.browser||{}),...patch};s.dialogue.persist();};
 function view(id){
  if(views.has(id))return views.get(id);
  const {WebContentsView,session}=require('electron');
  const ses=session.fromPartition('persist:petya-browser-'+String(s.companyId||'default'));
  if(!ses.__petyaGuard){ses.__petyaGuard=true;ses.setPermissionRequestHandler((_wc,permission,done)=>done(['fullscreen','clipboard-sanitized-write'].includes(permission)));}
  const v=new WebContentsView({webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});
  v.setBackgroundColor('#ffffff');
  const wc=v.webContents;
  wc.setWindowOpenHandler(({url})=>{const target=web(url);if(target)wc.loadURL(target).catch(()=>{});return {action:'deny'};});
  wc.on('will-navigate',(e,url)=>{if(!web(url))e.preventDefault();});
  const update=()=>{if(wc.isDestroyed())return;const url=wc.getURL();if(web(url))remember(id,{url,title:wc.getTitle()});send(id);};
  for(const ev of ['did-navigate','did-navigate-in-page','page-title-updated','did-start-loading','did-stop-loading'])wc.on(ev,update);
  wc.on('did-fail-load',(_e,code,description,url,main)=>{if(main&&code!==-3)send(id,{error:description||('Ошибка '+code)});});
  views.set(id,v);return v;
 }
 function attach(id){
  const w=s.win;if(!w||w.isDestroyed())return;
  for(const [other,v] of views)if(other!==id&&w.contentView.children.includes(v))w.contentView.removeChildView(v);
  shown=id;const v=views.get(id);if(!v||!rect)return;
  if(!w.contentView.children.includes(v))w.contentView.addChildView(v);
  const zoom=w.webContents.getZoomFactor();v.setBounds({x:Math.round(rect.x*zoom),y:Math.round(rect.y*zoom),width:Math.max(0,Math.round(rect.width*zoom)),height:Math.max(0,Math.round(rect.height*zoom))});
 }
 function hide(){const w=s.win;if(w&&!w.isDestroyed())for(const v of views.values())if(w.contentView.children.includes(v))w.contentView.removeChildView(v);shown=null;return true;}
 async function open(id,url=''){
  const t=topic(id),target=web(url)||t.browser?.url||DEFAULT;
  const v=view(id);remember(id,{open:true,url:target});
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
 function close(id){const v=views.get(id);if(v){const w=s.win;if(w&&!w.isDestroyed()&&w.contentView.children.includes(v))w.contentView.removeChildView(v);v.webContents.close();views.delete(id);}remember(id,{open:false});if(shown===id)shown=null;return state(id);}
 // Chats removed from the dialogue lose their views.
 const prune=()=>{for(const id of [...views.keys()])if(!s.dialogue.state.topics.some(t=>t.id===id&&!t.archived))close(id);};
 const timer=setInterval(prune,60000);timer.unref?.();
 return {chatBrowser:{open,navigate,close,state},ipc:{
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
  external:async id=>{const url=state(id).url;if(!web(url))throw Error('Нет открытой страницы.');await require('electron').shell.openExternal(url);return true;}
 }};
}
module.exports={name:'chatBrowser',setup};
