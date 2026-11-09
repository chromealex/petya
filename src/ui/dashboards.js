// Dashboards (src/features/dashboards.cjs): a grid of widgets made from chat cards. Here: the dashboard screen
// (in place of the chat, the project sidebar stays),
// the dashboards in the project sidebar, «Дашборд» in the chat header, «В дашборд…» on answers with cards, the
// project's start dashboard under «Чем помочь?», and the button under Petya's «Собрал дашборд…» reply.
// Widgets draw with the same extension renderers as the chat (window.extensionHost.render).
(()=>{
 const call=(method,...args)=>window.petya.feature('dashboards',method,...args);
 const kit=()=>window.resultKit;
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined&&text!==null)n.textContent=text;return n;};
 const icon=d=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
 const ICON={grid:'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',more:'M5 12h.01M12 12h.01M19 12h.01',pin:'M12 17v5M8 3h8l-1 6 4 4H5l4-4z',back:'M15 18l-6-6 6-6',plus:'M12 5v14M5 12h14',share:'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',drag:'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01'};
 const button=(label,path,onClick,className='')=>{const b=el('button',className);b.type='button';if(path){b.innerHTML=icon(path);if(label){b.title=label;b.setAttribute('aria-label',label);}}else b.textContent=label;b.onclick=onClick;return b;};
 const fail=e=>{const k=kit();if(k)k.toast(e.message||String(e),{error:true});else notice(e.message,true);};
 const WIDTHS=[[3,'Четверть'],[4,'Треть'],[6,'Половина'],[8,'Две трети'],[12,'Во всю ширину']];
 const EVERY_LABEL={0:'Только вручную',5:'Каждые 5 минут',15:'Каждые 15 минут',60:'Каждый час',240:'Каждые 4 часа',1440:'Раз в день'};
 const shell=document.querySelector('#home .chat-shell');
 const screen=el('section','dash-screen');screen.setAttribute('aria-label','Дашборд');screen.hidden=true;shell?.append(screen);
 let current=null,openId='';
 // The dashboard takes the chat's place; opening any chat brings the chat back.
 function close(){if(!openId)return;call('watch',openId,false).catch(()=>{});openId='';current=null;screen.hidden=true;shell?.classList.remove('showing-dashboard');markSidebar();}

 // --- One widget -------------------------------------------------------------------------------------------------
 // Loading without data yet: a calm placeholder of the card's shape, not a line of text.
 const skeleton=()=>{const box=el('div','dash-skeleton');box.setAttribute('aria-label','Загружаю…');for(const width of [72,100,88,56])box.append(Object.assign(el('span'),{style:'width:'+width+'%'}));return box;};
 async function drawBody(body,w){
  body.replaceChildren();
  if(w.data&&Object.keys(w.data).length){
   const holder=el('div','dash-widget-content');body.append(holder);
   try{await window.extensionHost?.render(holder,{role:'assistant',extensionData:w.data,...w.data});}catch{}
   if(!holder.childElementCount&&w.text)holder.append(el('p','dash-widget-text',w.text));
  }else if(w.text)body.append(el('p','dash-widget-text',w.text));
  // The very first load only: a refresh keeps what is shown and spins in the corner (no text, no shift).
  else if(!w.at&&!w.error)body.append(skeleton());
  else if(!w.error)body.append(el('p','dash-widget-empty','Пока нет данных.'));
 }
 function meta(w,d){
  const box=el('div','dash-widget-meta');
  // An example is marked once, in the dashboard's header; its widgets need no «снимок» each.
  if(d?.demo){box.hidden=true;return box;}
  if(!w.live)box.append(el('span','dash-tag','снимок'));
  if(w.at){const t=window.timeElement?window.timeElement(w.at,{prefix:'Обновлено: '}):el('span',null,new Date(w.at).toLocaleString(window.petyaLocale));box.append(t);}
  return box;
 }
 function widget(d,w,{compact=false}={}){
  const card=el('article','dash-widget');card.dataset.size=w.size;card.dataset.id=w.id;card.dataset.kind=w.kind;card.classList.toggle('refreshing',!!w.loading);
  const head=el('header','dash-widget-head'),names=el('div','dash-widget-names'),title=el('h3','dash-widget-title',w.title);title.title=w.describe;
  names.append(title,meta(w,d));head.append(names);
  const spin=el('span','dash-widget-spin');spin.setAttribute('role','status');spin.setAttribute('aria-label','Обновляю');head.append(spin);
  if(Number.isFinite(w.count)&&w.count!==null)head.append(el('span','dash-count',String(w.count)));
  if(!compact){
   const handle=el('span','dash-widget-drag');handle.innerHTML=icon(ICON.drag);handle.title='Перетащите за заголовок, чтобы переставить';head.prepend(handle);
   const tools=el('div','dash-widget-tools');
   if(w.live){const r=button('Обновить',ICON.refresh,()=>{card.classList.add('refreshing');r.classList.add('loading');call('refresh',d.id,w.id).then(paint).catch(fail).finally(()=>{card.classList.remove('refreshing');r.classList.remove('loading');});},'dash-tool dash-refresh');if(w.loading)r.classList.add('loading');tools.append(r);}
   const more=button('Действия с виджетом',ICON.more,()=>kit().menu(more,async()=>widgetMenu(d,w),option=>option.run()),'dash-tool');
   tools.append(more);head.append(tools);
  }
  const body=el('div','dash-widget-body');
  if(w.error){const err=el('p','dash-widget-error');if(kit()?.linkText)kit().linkText(err,w.error);else err.textContent=w.error;body.append(err);}
  card.append(head,body);
  const content=el('div');body.append(content);card.drawn=drawBody(content,w).catch(()=>{});
  if(!compact){const grip=el('span','dash-resize');grip.title='Потяните, чтобы изменить размер';grip.setAttribute('aria-hidden','true');card.append(grip);}
  return card;
 }
 function widgetMenu(d,w){
  const rows=[{label:'Ширина',note:true},...WIDTHS.map(([cols,label])=>({label,current:w.pos?.w===cols,run:()=>setWidth(d,w,cols)}))];
  if(w.live)rows.push({label:'Обновлять',note:true},...Object.entries(EVERY_LABEL).map(([every,label])=>({label,current:w.every===Number(every),run:()=>call('widget',d.id,w.id,{every:Number(every)}).then(paint).catch(fail)})));
  rows.push({label:'Ещё',note:true},{label:'Переименовать',run:()=>renameWidget(d,w)});
  if(w.kind==='jira')rows.push({label:'Изменить запрос JQL',hint:w.describe.replace(/^Jira · /,''),run:()=>editJql(d,w)});
  // A web widget: its page opens next to the chat (to sign in or check the figures).
  if(w.kind==='web'&&w.url)rows.push({label:'Открыть в браузере',hint:w.describe.replace(/^Страница · /,''),run:()=>{if(typeof view==='function')view('home');window.openChatBrowser?.(w.url);}});
  if(w.chat?.topicId)rows.push({label:'Открыть чат с карточкой',run:()=>openChat(w.chat.topicId)});
  rows.push({label:'Убрать с дашборда',run:()=>removeWidget(d,w)});
  return rows;
 }
 async function openChat(id){try{close();await selectDialogueTopic(id);}catch(e){fail(e);}}
 function ask(title,value,{multiline=false,hint=''}={}){
  return new Promise(resolve=>{
   const dialog=el('dialog','ux-topic-dialog dash-dialog'),form=el('form'),input=el(multiline?'textarea':'input');input.value=value||'';if(multiline)input.rows=4;
   const ok=el('button','primary','Сохранить');ok.type='submit';const cancel=el('button',null,'Отмена');cancel.type='button';
   const row=el('div','actions');row.append(ok,cancel);form.append(el('h3',null,title),...(hint?[el('p','small',hint)]:[]),input,row);dialog.append(form);document.body.append(dialog);
   const done=v=>{dialog.close();dialog.remove();resolve(v);};
   form.onsubmit=e=>{e.preventDefault();done(input.value.trim());};cancel.onclick=()=>done(null);dialog.addEventListener('cancel',e=>{e.preventDefault();done(null);});
   dialog.showModal();input.focus();input.select?.();
  });
 }
 async function renameWidget(d,w){const v=await ask('Название виджета',w.title);if(v)call('widget',d.id,w.id,{title:v}).then(paint).catch(fail);}
 async function editJql(d,w){const v=await ask('Запрос JQL',w.describe.replace(/^Jira · /,''),{multiline:true,hint:'Например: project = BW AND issuetype = Bug AND statusCategory != Done ORDER BY priority DESC'});if(v)call('widget',d.id,w.id,{jql:v}).then(paint).catch(fail);}
 async function removeWidget(d,w){
  try{const r=await call('removeWidget',d.id,w.id);paint(r.view);kit().toast('«'+w.title+'» убран с дашборда.',{undo:async()=>paint(await call('restoreWidget',d.id,r.undo.widget,r.undo.index))});}catch(e){fail(e);}
 }

 // --- The dashboard screen ---------------------------------------------------------------------------------------
 // --- Layout: a 12-column grid the person arranges ---------------------------------------------------------------
 // Each widget has {x, y, w, h} in columns and 32-px rows. Drag a widget by its header, resize it by the corner;
 // the others make room and everything rises to close gaps. A new widget takes the first free spot, its height is
 // fitted to its data once. Below ~760 px of width the widgets simply stack in reading order.
 const COLS=12,ROW=20,GAP=12,PITCH=ROW+GAP;
 const WIDTH={auto:6,s:4,m:6,l:8,w:12};
 const overlap=(a,b)=>a!==b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 function guessH(w){
  const c=w.data?.charts?.[0];
  if(c?.type==='kpi')return 6;if(c?.type==='line'||c?.type==='donut')return 11;if(c?.type==='bars')return Math.min(14,4+(c.rows?.length||3));
  if(Array.isArray(w.data?.jiraItems))return Math.min(22,6+w.data.jiraItems.length*5);return 10;
 }
 function freeSpot(items,it){for(let y=0;;y++)for(let x=0;x+it.w<=COLS;x++){it.x=x;it.y=y;if(!items.some(p=>overlap(p,it)))return it;}}
 // The moved widget keeps its spot; whatever it covers moves down; then everything rises as far as it can.
 function settle(items,keep=null){
  const placed=[];
  for(const it of [...items].sort((a,b)=>(b===keep)-(a===keep)||a.y-b.y||a.x-b.x)){if(it!==keep)while(placed.some(p=>overlap(p,it)))it.y++;placed.push(it);}
  for(const it of [...items].sort((a,b)=>a.y-b.y||a.x-b.x))while(it.y>0){it.y--;if(items.some(p=>overlap(p,it))){it.y++;break;}}
  return items;
 }
 function layoutOf(d){
  const items=[],fresh=[];
  for(const w of d.widgets){const it={id:w.id,...(w.pos||{}),fit:!!w.pos?.fit};if(w.pos)items.push(it);else fresh.push([w,it]);}
  for(const [w,it] of fresh){it.w=WIDTH[w.size]||6;it.h=guessH(w);it.fit=true;freeSpot(items,it);items.push(it);}
  return {items:settle(items),changed:fresh.length>0};
 }
 const place=(card,it)=>{card.style.gridColumn=(it.x+1)+' / span '+it.w;card.style.gridRow=(it.y+1)+' / span '+it.h;};
 const saveLayout=(d,items)=>call('layout',d.id,items.map(({id,x,y,w,h,fit})=>({id,x,y,w,h,fit}))).then(v=>{if(v.id===openId)current=v;return v;}).catch(fail);
 function grid(d,{compact=false}={}){
  const box=el('div','dash-grid free'+(compact?' compact':''));
  const {items,changed}=layoutOf(d),byId=new Map(items.map(i=>[i.id,i]));
  const cards=d.widgets.map(w=>{const card=widget(d,w,{compact});place(card,byId.get(w.id));box.append(card);return card;});
  // Stack when the grid is narrow (the start screen in a small window, a narrow main window).
  const stack=()=>box.classList.toggle('stacked',box.clientWidth>0&&box.clientWidth<760);
  new ResizeObserver(stack).observe(box);
  if(compact)return box;
  editable(box,d,items,byId);
  // Heights of new widgets follow their data once it is drawn.
  Promise.all(cards.map(c=>c.drawn)).then(()=>{
   let fitted=false;
   for(const card of cards){const it=byId.get(card.dataset.id),w=d.widgets.find(x=>x.id===it.id);if(!it.fit||!(w.data&&Object.keys(w.data).length||w.text))continue;
    const head=card.querySelector('.dash-widget-head'),content=card.querySelector('.dash-widget-body>div:last-child');if(!head||!content||!box.isConnected||box.classList.contains('stacked'))continue;
    const natural=head.offsetHeight+content.scrollHeight+(card.querySelector('.dash-widget-error')?.offsetHeight||0)+34;
    it.h=Math.min(30,Math.max(4,Math.ceil((natural+GAP)/PITCH)));it.fit=false;fitted=true;}
   if(fitted){settle(items);for(const card of cards)place(card,byId.get(card.dataset.id));}
   if(fitted||changed)saveLayout(d,items);
  });
  return box;
 }
 function editable(box,d,items,byId){
  let op=null;
  const ghost=el('div','dash-ghost-cell');ghost.hidden=true;box.append(ghost);
  const apply=()=>{for(const card of box.querySelectorAll(':scope>.dash-widget'))if(card!==op?.card||op.resize)place(card,byId.get(card.dataset.id));if(op){place(ghost,op.it);}};
  box.addEventListener('pointerdown',e=>{
   if(e.button!==0||box.classList.contains('stacked'))return;
   const card=e.target.closest('.dash-widget');if(!card||card.parentElement!==box)return;
   const resize=e.target.closest('.dash-resize'),head=e.target.closest('.dash-widget-head');
   if(!resize&&(!head||e.target.closest('button,a,input,select,textarea')))return;
   e.preventDefault();
   const it=byId.get(card.dataset.id),r=card.getBoundingClientRect();
   op={card,it,resize:!!resize,before:JSON.stringify(items.map(({id,x,y,w,h})=>[id,x,y,w,h])),sx:e.clientX,sy:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,left:r.left,top:r.top};
   try{card.setPointerCapture(e.pointerId);}catch{}card.classList.add(op.resize?'resizing':'dragging');box.classList.add('editing');ghost.hidden=false;apply();
  });
  box.addEventListener('pointermove',e=>{
   if(!op)return;
   const g=box.getBoundingClientRect(),colPitch=(g.width+GAP)/COLS,it=op.it;
   if(op.resize){
    const r=op.card.getBoundingClientRect();
    it.w=Math.max(2,Math.min(COLS-it.x,Math.round((e.clientX-r.left+GAP)/colPitch)));
    it.h=Math.max(3,Math.min(60,Math.round((e.clientY-r.top+GAP)/PITCH)));it.fit=false;
   }else{
    it.x=Math.max(0,Math.min(COLS-it.w,Math.round((e.clientX-g.left-op.dx)/colPitch)));
    it.y=Math.max(0,Math.round((e.clientY-g.top-op.dy)/PITCH));
    op.card.style.transform='translate('+(e.clientX-op.sx)+'px,'+(e.clientY-op.sy)+'px)';
   }
   settle(items,it);apply();
   // Near the screen's edge the dashboard scrolls along.
   const s=screen.getBoundingClientRect();if(e.clientY>s.bottom-40)screen.scrollTop+=14;else if(e.clientY<s.top+40)screen.scrollTop-=14;
  });
  const end=()=>{
   if(!op)return;const {card,before}=op;
   card.style.transform='';card.classList.remove('dragging','resizing');box.classList.remove('editing');ghost.hidden=true;op=null;settle(items);apply();
   if(JSON.stringify(items.map(({id,x,y,w,h})=>[id,x,y,w,h]))!==before)saveLayout(d,items);
  };
  box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
 }
 // «Ширина» in the widget menu: the same as resizing by the corner.
 function setWidth(d,w,cols){
  const grid=screen.querySelector('.dash-grid.free');if(!grid)return;const {items}=layoutOf(d),it=items.find(i=>i.id===w.id);if(!it)return;
  it.w=cols;it.x=Math.min(it.x,COLS-cols);it.fit=false;settle(items,it);saveLayout(d,items).then(v=>v&&paint(v));
 }
 function header(d){
  const head=el('header','dash-head');
  const left=el('div','dash-head-title');
  if(d.fromChat){const back=button('К чату',ICON.back,()=>openChat(d.fromChat),'dash-tool');left.append(back);}
  const names=el('div','dash-head-names');
  const h=el('h1',null,d.title);h.title='Нажмите, чтобы переименовать';h.tabIndex=0;h.onclick=async()=>{const v=await ask('Название дашборда',d.title);if(v)call('rename',d.id,v).then(paint).catch(fail);};
  // One quiet line under the title: whose it is, how many widgets, when it was last refreshed.
  const sub=el('div','dash-sub');
  if(d.demo)sub.append(el('span','dash-tag demo','Демо-данные'));
  sub.append(el('span',null,d.shared?'Общий · '+d.shared.folder+'/.petya':'Личный'));
  const count=d.widgets.length;sub.append(el('span',null,count+' '+(count%10===1&&count%100!==11?'виджет':count%10>=2&&count%10<=4&&(count%100<10||count%100>=20)?'виджета':'виджетов')));
  const latest=Math.max(0,...d.widgets.filter(w=>w.live).map(w=>w.at||0));
  if(latest&&window.timeElement){const s=el('span');s.append('обновлено ',window.timeElement(latest));sub.append(s);}
  if(d.start)sub.append(el('span',null,'стартовый экран проекта'));
  names.append(h,sub);left.append(names);
  const tools=el('div','dash-head-tools');
  const refresh=button('Обновить всё',ICON.refresh,()=>{refresh.classList.add('loading');screen.querySelectorAll('.dash-widget').forEach(c=>{if(c.querySelector('.dash-refresh'))c.classList.add('refreshing');});call('refresh',d.id,'').then(paint).catch(fail).finally(()=>{refresh.classList.remove('loading');screen.querySelectorAll('.dash-widget.refreshing').forEach(c=>c.classList.remove('refreshing'));});},'dash-ghost');refresh.append(' Обновить');
  const add=button('Добавить виджет',ICON.plus,()=>adder.hidden?openAdder(d):(adder.hidden=true),'primary dash-add');add.append(' Виджет');
  tools.append(refresh,add);
  const more=button('Действия с дашбордом',ICON.more,()=>kit().menu(more,async()=>dashboardMenu(d),o=>o.run()),'dash-tool');tools.append(more);
  // Delete is the red trash can (AGENTS.md → Interface rules).
  if(window.deleteButton)tools.append(window.deleteButton(d.shared?'Удалить дашборд и его файл в папке проекта':'Удалить дашборд',()=>removeDashboard(d)));
  head.append(left,tools);
  return head;
 }
 async function dashboardMenu(d){
  const rows=[{label:'Открыть в отдельном окне',hint:'Маленькое окно поверх других — держать дашборд перед глазами',run:()=>call('popout',d.id).catch(fail)},
   {label:d.start?'Не показывать при открытии проекта':'Показывать при открытии проекта',hint:'Под «Чем помочь?» в новом чате проекта',run:()=>call('start',d.projectId,d.start?'':d.id).then(()=>open(d.id)).then(changed).catch(fail)}];
  if(!d.shared){
   const folders=await call('folders',d.projectId);
   if(folders.length)for(const f of folders)rows.push({label:'Поделиться через папку «'+f.name+'»',hint:'Файл .petya/dashboards/… — закоммитьте его, и команда увидит дашборд',run:()=>share(d,f.index)});
   else rows.push({label:'Поделиться с командой',hint:'Нужна папка проекта: добавьте её в настройках проекта',note:false,run:()=>window.openProjectSettings?.(d.projectId)});
  }else rows.push({label:'Сделать личную копию',run:()=>call('copy',d.id).then(c=>{changed();open(c.id);}).catch(fail)});
  return rows;
 }
 async function share(d,index){
  try{const r=await call('share',d.id,index);changed();await open(r.id);kit().toast('Сохранено в '+r.folder+'/'+r.file+'. Закоммитьте файл — команда увидит дашборд.'+(r.kept?' Снимков карточек: '+r.kept+' — они остались в личном дашборде.':''),{timeout:12000});}catch(e){fail(e);}
 }
 async function removeDashboard(d){
  if(!await window.petyaConfirm('Удалить дашборд «'+d.title+'»?'+(d.shared?' Файл в папке проекта тоже будет удалён.':'')))return;
  try{await call('remove',d.id);close();changed();}catch(e){fail(e);}
 }
 // «Добавить виджет»: a description, or one of the ready ones.
 const adder=el('div','dash-adder');adder.hidden=true;
 async function openAdder(d){
  adder.replaceChildren();adder.hidden=false;
  const form=el('form','dash-adder-form'),input=el('input');input.placeholder='Что показать? Например: «баги спринта, крэши за неделю»';input.setAttribute('aria-label','Что добавить на дашборд');
  const go=el('button','primary','Добавить');go.type='submit';form.append(input,go);
  form.onsubmit=async e=>{e.preventDefault();if(!input.value.trim())return;go.disabled=true;try{const r=await call('addFrom',d.id,input.value);paint(r.view);input.value='';if(r.missed.length)kit().toast(r.note||'Не нашёл источника для: '+r.missed.join(', '),{error:true});}catch(err){fail(err);}finally{go.disabled=false;}};
  const ready=el('div','dash-adder-ready');
  adder.append(form,el('p','small','Готовые виджеты подключённых приложений:'),ready);
  try{const rows=await call('catalog',d.projectId);if(!rows.length)ready.append(el('p','small','Подключите Jira, «Крэши», «Отзывы», «Сборки» или «Календарь» — их данные можно держать на дашборде. Любую карточку из чата можно добавить через «•••» → «В дашборд…».'));
   const demo=el('button','dash-chip demo');demo.type='button';demo.append(el('b',null,'Пример'),' Аналитика игры');demo.title='Отдельный дашборд с выдуманными числами: DAU, выручка, удержание, воронка';demo.onclick=()=>example(d.projectId);ready.append(demo);
   for(const r of rows){const chip=el('button','dash-chip');chip.type='button';chip.append(el('b',null,r.app),' '+r.title);chip.onclick=()=>call('addSource',d.id,r.source,r.title).then(paint).catch(fail);ready.append(chip);}}catch(e){ready.append(el('p','small',e.message));}
  input.focus();
 }
 function paint(d){
  if(!d||d.id!==openId)return;current=d;
  const focus=document.activeElement?.closest?.('.dash-widget')?.dataset.id;
  screen.replaceChildren(header(d),...(d.demo?[demoNote()]:[]),adder,d.widgets.length?grid(d):empty(d));
  if(focus)screen.querySelector('.dash-widget[data-id="'+focus+'"] .dash-tool')?.focus();
 }
 function empty(d){const box=el('div','dash-empty');const ic=el('div','dash-empty-icon');ic.innerHTML=icon(ICON.grid);box.append(ic,el('h2',null,'Пока пусто'),el('p',null,'Добавьте виджет или откройте чат и выберите «•••» → «В дашборд…» у ответа с карточкой.'));const row=el('div','dash-empty-actions');row.append(button('Добавить виджет',null,()=>openAdder(d),'primary'),button('Посмотреть пример',null,()=>example(d.projectId)));box.append(row);return box;}
 function demoNote(){const box=el('div','dash-note');box.append(el('span',null,'Это пример с выдуманными числами. Подключите аналитику игры — и такие виджеты покажут ваши данные; карточки из чата добавляются через «•••» → «В дашборд…».'));return box;}
 async function example(projectId){try{const d=await call('example',projectId||'');await changed();open(d.id);}catch(e){fail(e);}}
 window.openDashboardExample=example;
 async function open(id){
  try{
   if(openId&&openId!==id)call('watch',openId,false).catch(()=>{});
   if(typeof view==='function'&&document.getElementById('home')?.hidden)view('home');
   window.resultKit?.closePanel?.('chat');
   openId=id;adder.hidden=true;screen.dataset.id=id;screen.hidden=false;shell?.classList.add('showing-dashboard');
   const d=await call('get',id);paint(d);call('watch',id,true).catch(()=>{});markSidebar();
  }catch(e){fail(e);}
 }
 window.openDashboard=open;
 // The tray menu and the small dashboard window open a dashboard here.
 window.petyaEvents.onDashboardOpen?.(id=>open(String(id)));
 document.addEventListener('petya-chat-opened',close);
 window.closeDashboard=close;

 // Widgets report their refresh; the open screen and the start dashboard repaint.
 let pending=null;
 window.petyaEvents.onDashboards?.(state=>{
  if(state.id===openId&&current){const w=current.widgets.find(x=>x.id===state.widgetId);if(w&&state.loading){w.loading=true;const card=screen.querySelector('.dash-widget[data-id="'+state.widgetId+'"]');card?.classList.add('refreshing');card?.querySelector('.dash-refresh')?.classList.add('loading');}}
  clearTimeout(pending);pending=setTimeout(async()=>{if(openId&&state.id===openId)paint(await call('peek',openId).catch(()=>null));if(start?.dataset.id===state.id)drawStart(true);},150);
 });

 // --- Sidebar: the project's dashboards under its chats --------------------------------------------------------
 let lists=new Map(),loadingLists=null;
 async function loadLists(){loadingLists=loadingLists||call('list','').then(rows=>{lists=new Map();for(const r of rows){if(!lists.has(r.projectId))lists.set(r.projectId,[]);lists.get(r.projectId).push(r);}}).finally(()=>{loadingLists=null;});return loadingLists;}
 function fill(box){
  const rows=lists.get(box.dataset.project)||[];box.replaceChildren();box.hidden=!rows.length;
  for(const d of rows){
   const row=el('div','project-chat-row project-dashboard-row'),b=el('button','project-sidebar-chat');b.type='button';b.dataset.dashboard=d.id;
   const ic=el('span','project-dashboard-icon');ic.innerHTML=icon(ICON.grid);
   b.append(ic,el('span','project-chat-title',d.title));if(d.shared)b.append(el('span','project-dashboard-shared','общий'));
   b.title=d.title+' · '+d.widgets+' '+(d.widgets===1?'виджет':d.widgets<5&&d.widgets>1?'виджета':'виджетов')+(d.shared?' · общий, '+d.folder+'/.petya':'')+(d.start?' · стартовый экран':'');
   b.onclick=()=>open(d.id);row.append(b);box.append(row);
  }
  markSidebar();
 }
 window.projectSidebarExtras=(projectId,group)=>{const box=el('div','project-dashboards');box.dataset.project=projectId;box.hidden=true;group.append(box);
  if(lists.size)fill(box);loadLists().then(()=>{if(box.isConnected)fill(box);}).catch(()=>{});};
 function markSidebar(){for(const b of document.querySelectorAll('.project-dashboard-row button')){if(b.dataset.dashboard===openId)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}}
 async function changed(){await loadLists().catch(()=>{});for(const box of document.querySelectorAll('.project-dashboards'))fill(box);refreshHeading();drawStart(true);}
 window.dashboardsChanged=changed;

 // --- Chat header: «Дашборд» -------------------------------------------------------------------------------------
 const topic=()=>typeof topicSelect!=='undefined'?topicSelect.value:'';
 let headingButton=null;
 async function refreshHeading(){
  const heading=document.querySelector('.chat-heading');if(!heading)return;
  if(!headingButton){headingButton=el('button','quiet');headingButton.type='button';headingButton.id='chat-dashboard-open';heading.append(headingButton);}
  const id=topic();headingButton.hidden=!id;if(!id)return;
  let linked=null;try{linked=await call('chatDashboard',id);}catch{}
  if(topic()!==id)return;
  headingButton.innerHTML=icon(ICON.grid);headingButton.append(linked?' Дашборд':' Сделать дашбордом');
  headingButton.title=linked?'Открыть дашборд этого чата «'+linked.title+'»':'Собрать карточки этого чата в дашборд: они будут обновляться сами';
  headingButton.setAttribute('aria-label',headingButton.title);
  headingButton.onclick=async()=>{try{if(linked)return open(linked.id);const d=await call('fromChat',id);await changed();open(d.id);}catch(e){fail(e);}};
 }
 for(const ev of ['petya-chat-opened','petya-dialogue-state'])document.addEventListener(ev,()=>setTimeout(refreshHeading,0));

 // --- «В дашборд…» on answers with cards, and the button under «Собрал дашборд…» ------------------------------
 const hasCard=m=>m&&m.role==='assistant'&&!m.error&&(m.jiraItems?.length||Object.keys(m.extensionData||{}).some(k=>k!=='attachments'&&k!=='extensionOffer'));
 const enhance=window.enhanceChatMessage;
 window.enhanceChatMessage=(node,message)=>{
  enhance?.(node,message);
  if(message?.dashboard?.id){const b=button('Открыть дашборд «'+message.dashboard.title+'»',null,()=>open(message.dashboard.id),'dash-open-reply');b.prepend(Object.assign(el('span'),{innerHTML:icon(ICON.grid)}));node.querySelector('.message-content')?.after(b)||node.append(b);}
  if(!hasCard(message)||!message.at)return;
  const items=node.querySelector('.answer-menu-items');if(!items)return;
  const pin=button('В дашборд…',null,()=>{
   const index=Number(node.dataset.messageIndex),id=topic();
   kit().menu(pin,async()=>{const rows=await call('listForChat',id);
     return [...rows.map(d=>({label:d.title,hint:d.shared?'общий':'',id:d.id})),{label:'Новый дашборд',id:''}];},
    async option=>{try{const r=await call('pin',option.id,id,index);await changed();node.closest('details')?.removeAttribute('open');
     kit().toast((r.live?'Добавил «':'Добавил снимок «')+r.widget+'» в «'+r.dashboard.title+'»'+(r.live?'':' — эта карточка не обновляется сама'),{action:{label:'Открыть',run:()=>open(r.dashboard.id)}});}catch(e){fail(e);}});
  });
  pin.title='Добавить карточку на дашборд — она будет обновляться';items.append(pin);
 };

 // --- Start screen: the project's dashboard under «Чем помочь?» -------------------------------------------------
 let start=null,startRevision=0;
 async function drawStart(force=false){
  const welcome=document.querySelector('#home .chat-welcome');if(!welcome)return;
  if(!start){start=el('section','dash-start');start.hidden=true;start.setAttribute('aria-label','Дашборд проекта');welcome.append(start);}
  if(topic()){start.hidden=true;if(start.dataset.id)call('watch',start.dataset.id,false).catch(()=>{});start.dataset.id='';return;}
  const mine=++startRevision;let d=null;try{d=await call('startOf','');}catch{}
  if(mine!==startRevision)return;
  if(!d){welcome.classList.remove('with-dashboard');start.dataset.id='';
   // No dashboards in the project yet: one quiet line that they exist, with the analytics example.
   await loadLists().catch(()=>{});if(mine!==startRevision)return;
   const any=[...lists.values()].some(rows=>rows.length);start.hidden=any;if(any)return;
   const hint=el('p','dash-hint'),ic=el('span','dash-hint-icon');ic.innerHTML=icon(ICON.grid);
   hint.append(ic,'Дашборды: карточки чата на одном экране, обновляются сами. ',button('Пример аналитики',null,()=>example(''),'dash-link'));
   start.replaceChildren(hint);return;}
  if(start.dataset.id!==d.id)call('watch',d.id,true).catch(()=>{});
  start.dataset.id=d.id;start.hidden=false;welcome.classList.add('with-dashboard');
  const head=el('div','dash-start-head'),link=button('Открыть «'+d.title+'»',null,()=>open(d.id),'quiet');
  head.append(el('strong',null,d.title),link);
  start.replaceChildren(head,d.widgets.length?grid(d,{compact:true}):el('p','small','В дашборде пока нет виджетов.'));
  // A new chat opens at the top: «Чем помочь?» and the dashboard, not scrolled to the composer.
  if(!force){const feed=document.querySelector('#home .chat-feed');if(feed)feed.scrollTop=0;}
 }
 for(const ev of ['petya-chat-opened','petya-dialogue-state','petya-topic-changed'])document.addEventListener(ev,()=>setTimeout(drawStart,0));
 setTimeout(()=>{drawStart();refreshHeading();},0);
})();
