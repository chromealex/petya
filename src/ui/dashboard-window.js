// The small dashboard window: the dashboard's widgets in one column, refreshed by themselves; cards are drawn by
// the same extension renderers as in the chat (their card scripts are loaded here, settings scripts are not).
(()=>{
 const api=window.petyaDashboard,root=document.getElementById('dashboard-window');
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined&&text!==null)n.textContent=text;return n;};
 window.notice=window.notice||((text,error)=>window.resultKit?.toast(String(text),{error:!!error}));
 const entries=(window.petyaExtensionDescriptors||[]).filter(e=>e.results&&Object.keys(e.results).length);
 // Card renderers only: settings, chat and notification scripts belong to the main window.
 const card=file=>!/^(?:settings|chat|notifications)\.js$|-notifications\.js$/.test(file);
 const loaded=new Set();
 const load=src=>new Promise(resolve=>{if(loaded.has(src))return resolve();loaded.add(src);const s=document.createElement('script');s.src=src;s.onload=s.onerror=()=>resolve();document.body.append(s);});
 const ready=Promise.all(entries.flatMap(e=>(e.scripts||[]).map(s=>Array.isArray(s)?s[0]:s).filter(card).map(f=>load('../extensions/'+e.id+'/'+f))));
 async function render(holder,data){
  await ready;
  for(const e of entries)for(const [key,handler] of Object.entries(e.results)){if(!data[key]||typeof window[handler]!=='function')continue;try{window[handler](holder,data[key]);}catch{}}
 }
 let pinned=true;
 async function paint(){
  let d;try{d=await api.get();}catch(e){root.replaceChildren(el('p','dash-widget-error',e.message));return;}
  document.title='Петя · '+d.title;
  const head=el('header','dash-window-head'),title=el('h1',null,d.title);
  const top=el('button',null,'Поверх окон');top.type='button';top.setAttribute('aria-pressed',String(pinned));top.title='Держать окно поверх других';
  top.onclick=async()=>{pinned=await api.top(!pinned);top.setAttribute('aria-pressed',String(pinned));};
  const refresh=el('button',null,'Обновить');refresh.type='button';refresh.onclick=()=>api.refresh('').then(paint).catch(e=>notice(e.message,true));
  const main=el('button',null,'В Пете');main.type='button';main.title='Открыть дашборд в главном окне';main.onclick=()=>api.openMain();
  head.append(title,top,refresh,main);
  const grid=el('div','dash-grid compact');
  for(const w of d.widgets){
   const box=el('article','dash-widget');box.dataset.size=w.size;box.dataset.kind=w.kind;
   const h=el('header','dash-widget-head'),meta=el('div','dash-widget-meta'+(w.live?'':' snapshot'));
   if(w.loading)meta.append(el('span','dash-widget-loading','Обновляю…'));else if(w.at&&window.timeElement)meta.append(w.live?'обновлено ':'снимок · ',window.timeElement(w.at,{prefix:'Обновлено: '}));
   h.append(el('h3','dash-widget-title',w.title),meta);
   const body=el('div','dash-widget-body');if(w.error)body.append(el('p','dash-widget-error',w.error));
   const holder=el('div','dash-widget-content');body.append(holder);
   if(w.data&&Object.keys(w.data).length)render(holder,w.data).then(()=>{if(!holder.childElementCount&&w.text)holder.append(el('p','dash-widget-text',w.text));});
   else if(w.text)holder.append(el('p','dash-widget-text',w.text));
   else if(!w.error)holder.append(el('p','dash-widget-empty','Пока нет данных.'));
   box.append(h,body);grid.append(box);
  }
  root.replaceChildren(head,d.widgets.length?grid:el('p','dash-widget-empty','В дашборде нет виджетов.'));
 }
 let timer;api.onUpdate(()=>{clearTimeout(timer);timer=setTimeout(paint,200);});
 paint();
})();
