// Result kit: shared building blocks for extension result cards in the chat.
// Extensions (src/extensions/*) own their data, adapters and renderers; this file only offers the common
// card anatomy, chip menus, undo toasts, list views and selection, so every app looks and behaves the same.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href='result-kit.css';document.head.append(style);
 const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined&&text!==null)node.textContent=String(text);return node;};
 const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:','slack:','mailto:'].includes(url.protocol)?url.href:'';}catch{return '';}};
 const store={get(key,fallback){try{return localStorage.getItem('petya-kit-'+key)||fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('petya-kit-'+key,value);}catch{}}};

 // --- Floating menu for chips -------------------------------------------------------------
 let openMenu=null;
 function closeMenu(){openMenu?.remove();openMenu=null;}
 document.addEventListener('pointerdown',event=>{if(openMenu&&!openMenu.contains(event.target)&&!event.target.closest?.('.kit-chip[aria-expanded="true"]'))closeMenu();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openMenu){event.preventDefault();event.stopPropagation();const owner=openMenu.owner;closeMenu();owner?.setAttribute('aria-expanded','false');owner?.focus();}},true);
 async function menu(anchor,load,pick){
  closeMenu();
  const box=el('div','kit-menu');box.setAttribute('role','menu');box.owner=anchor;openMenu=box;document.body.append(box);
  const place=()=>{const r=anchor.getBoundingClientRect();box.style.left=Math.min(r.left,innerWidth-box.offsetWidth-8)+'px';box.style.top=(r.bottom+6+box.offsetHeight>innerHeight?r.top-box.offsetHeight-6:r.bottom+6)+'px';};
  box.append(el('div','kit-menu-note','Загружаю…'));place();anchor.setAttribute('aria-expanded','true');
  let options;try{options=await load();}catch(e){box.replaceChildren(el('div','kit-menu-note error',e.message));place();return;}
  if(openMenu!==box)return;
  box.replaceChildren();
  if(!options.length)box.append(el('div','kit-menu-note','Нет вариантов'));
  for(const option of options){
   if(option.note){box.append(el('div','kit-menu-note',option.label));continue;}
   const item=el('button','kit-menu-item'+(option.who?' with-person':''));item.type='button';item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(!!option.current));
   const text=el('span','kit-menu-text',option.label);if(option.hint)text.append(el('small',null,option.hint));
   if(option.who)item.append(avatar(option.who,{size:22}));item.append(text);
   item.onclick=async()=>{closeMenu();anchor.setAttribute('aria-expanded','false');if(!option.current)await pick(option);};
   box.append(item);
  }
  place();box.querySelector('[aria-checked="false"]')?.focus();
 }

 // --- Toast with undo -----------------------------------------------------------------------
 const toasts=el('div','kit-toasts');toasts.setAttribute('role','status');toasts.setAttribute('aria-live','polite');document.body.append(toasts);
 function toast(text,{undo,action,error=false,timeout=7000}={}){
  const node=el('div','kit-toast'+(error?' error':''));node.append(el('span',null,text));
  if(action){const b=el('button',null,action.label);b.type='button';b.onclick=()=>{node.remove();action.run();};node.append(b);}
  if(undo){const b=el('button',null,'Отменить');b.type='button';b.onclick=async()=>{b.disabled=true;try{await undo();node.remove();}catch(e){node.replaceChildren(el('span',null,e.message));node.classList.add('error');}};node.append(b);}
  const close=el('button','kit-toast-close','×');close.type='button';close.setAttribute('aria-label','Закрыть');close.onclick=()=>node.remove();node.append(close);
  toasts.append(node);setTimeout(()=>node.remove(),timeout);return node;
 }

 // --- Quick edits through the extension's result adapter ----------------------------------------
 // perform(key, action, args) → adapter result. A result with `undo: {action, args}` gets an «Отменить» toast.
 async function quick(key,action,args,{busy}={}){
  if(!window.chatResultsApi)throw Error('Результаты чата ещё загружаются.');
  busy?.setAttribute('aria-busy','true');
  try{
   const result=await window.chatResultsApi.perform(key,action,args);
   const undo=result?.undo&&(()=>window.chatResultsApi.perform(key,result.undo.action,result.undo.args).then(r=>{if(r?.text)toast(r.text);return r;}));
   if(result?.text)toast(result.text,{undo});
   return result;
  }catch(e){toast(e.message,{error:true});throw e;}
  finally{busy?.removeAttribute('aria-busy');}
 }

 // --- Card ------------------------------------------------------------------------------------
 function chip({label,title,tone='',menu:load,pick,onClick,editable=!!load||!!onClick,who}){
  const node=el(editable?'button':'span','kit-chip'+(tone?' tone-'+tone:''),label+(load?' ▾':''));
  if(who)node.prepend(avatar(who,{size:16}));
  if(title)node.title=title;
  if(editable){node.type='button';if(load){node.setAttribute('aria-haspopup','menu');node.setAttribute('aria-expanded','false');node.onclick=event=>{event.stopPropagation();menu(node,load,pick);};}else node.onclick=event=>{event.stopPropagation();onClick();};}
  return node;
 }
 function card({app,initial,color,key,href,status,title,subtitle,meta=[],chips=[],actions=[],side,presentation,body,className=''}){
  // [data-i18n]: interface text even inside a chat message (see i18n.js); content passed in stays as the card marks it.
  const node=el('section','kit-card '+className);node.dataset.i18n='';
  if(presentation){node.dataset.resultPresentation=presentation;node.tabIndex=0;node.onclick=event=>{if(event.target.closest('button,a,input,textarea,select,summary'))return;window.chatResultsApi?.select(presentation);};}
  const head=el('div','kit-card-head');
  // The badge letter follows the app name in the interface language («Проверка тона» → T for «Tone check»).
  if(app){const shown=window.t?window.t(app):app,letter=!initial||/[А-Яа-яЁё]/.test(initial)&&shown!==app&&!/[А-Яа-яЁё]/.test(shown)?Array.from(shown)[0]:initial;const badge=el('span','kit-app',letter||app[0]);badge.style.background=color||'#3a4440';badge.title=app;badge.setAttribute('aria-label',app);head.append(badge);}
  if(key){const url=safeUrl(href);const link=el(url?'a':'span','kit-key',key);if(url){link.href=url;link.target='_blank';link.rel='noopener';}head.append(link);}
  if(status)head.append(status instanceof Node?status:chip(status));
  if(subtitle)head.append(el('span','kit-subtitle',subtitle));
  node.append(head);
  if(title)node.append(el('h4','kit-title',title));
  if(body)node.append(body);
  const fields=chips.filter(Boolean).map(c=>c instanceof Node?c:chip(c));
  if(fields.length){const row=el('div','kit-chips');row.append(...fields);node.append(row);}
  if(meta.length)node.append(el('small','kit-meta',meta.filter(Boolean).join(' · ')));
  // Ready-made nodes (e.g. k.links) go into the same row as the action buttons.
  if(actions.length){const row=el('div','kit-actions');for(const a of actions){if(a instanceof Node){row.append(a);continue;}const b=el('button',a.primary?'primary':'',a.label);b.type='button';if(a.title)b.title=a.title;b.onclick=async event=>{event.stopPropagation();b.disabled=true;try{await a.run(b);}catch(e){toast(e.message,{error:true});}finally{b.disabled=false;}};row.append(b);}node.append(row);}
  // A main action on the right: icon, verb and a short line saying what will happen.
  if(side){
   const main=el('div','kit-card-main');main.append(...node.childNodes);
   const b=el('button','kit-side'+(side.tone?' tone-'+side.tone:''));b.type='button';if(side.title)b.title=side.title;
   b.setAttribute('aria-label',side.label+(side.hint?' — '+side.hint:''));
   const icon=el('span','kit-side-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML=side.icon||'';
   b.append(icon,el('span','kit-side-label',side.label));if(side.hint)b.append(el('small','kit-side-hint',side.hint));
   b.onclick=async event=>{event.stopPropagation();b.disabled=true;b.setAttribute('aria-busy','true');try{await side.run(b);}catch(e){toast(e.message,{error:true});}finally{b.disabled=false;b.removeAttribute('aria-busy');}};
   node.classList.add('has-side');node.append(main,b);
  }
  return node;
 }
 // Icons for side actions (stroke, currentColor).
 const icons={
  run:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.5v13l11-6.5z"/></svg>',
  fix:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>'
 };

 // --- Lists: cards / table / board, remembered per list kind ---------------------------------------
 function views(parent,{id,label,items,modes,initial='cards',limit=5}){
  const wrap=el('div','kit-list');wrap.dataset.i18n='';const bar=el('div','kit-list-bar');const body=el('div','kit-list-body');
  const available=Object.keys(modes);let mode=store.get('view-'+id,initial);if(!available.includes(mode))mode=available[0];
  const names={cards:'Карточки',table:'Таблица',board:'Доска'};
  if(label)bar.append(el('span','kit-list-label',label));
  const switcher=el('div','kit-switch');switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Вид списка');
  const paint=()=>{body.replaceChildren(modes[mode](items));for(const b of switcher.children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));};
  if(available.length>1)for(const m of available){const b=el('button',null,names[m]||m);b.type='button';b.dataset.mode=m;b.onclick=()=>{mode=m;store.set('view-'+id,m);paint();};switcher.append(b);}
  bar.append(switcher);wrap.append(bar,body);paint();parent.append(wrap);return wrap;
 }
 // Collapse a long list of nodes behind «Показать ещё».
 function collapse(nodes,limit,label='Показать ещё'){
  const box=el('div','kit-stack');nodes.slice(0,limit).forEach(n=>box.append(n));
  if(nodes.length>limit){const more=el('details','kit-more');more.append(el('summary',null,label+' · '+(nodes.length-limit)));nodes.slice(limit).forEach(n=>more.append(n));box.append(more);}
  return box;
 }
 function table(columns,rows){
  const box=el('div','kit-table-wrap'),t=el('table','kit-table'),head=el('tr');
  for(const c of columns)head.append(el('th',null,c.label));
  const thead=el('thead');thead.append(head);const tbody=el('tbody');
  for(const row of rows){const tr=el('tr');if(row.presentation)tr.dataset.resultPresentation=row.presentation;for(const c of columns){const td=el('td');const v=c.value(row);td.append(v instanceof Node?v:document.createTextNode(String(v??'')));tr.append(td);}tbody.append(tr);}
  t.append(thead,tbody);box.append(t);return box;
 }
 function board(columns,{onDrop}={}){
  const grid=el('div','kit-board');
  for(const column of columns){
   const col=el('div','kit-column');col.append(el('div','kit-column-head',column.label+' · '+column.items.length));
   for(const item of column.items){const node=item.node;if(onDrop&&item.key){node.draggable=true;node.ondragstart=e=>{e.dataTransfer.setData('text/x-petya-result',item.key);};}col.append(node);}
   if(onDrop){col.ondragover=e=>{if(e.dataTransfer.types.includes('text/x-petya-result')){e.preventDefault();col.classList.add('drop');}};col.ondragleave=()=>col.classList.remove('drop');col.ondrop=e=>{col.classList.remove('drop');const key=e.dataTransfer.getData('text/x-petya-result');if(key){e.preventDefault();onDrop(key,column);}};}
   grid.append(col);
  }
  return grid;
 }

 // --- Batch selection: checkboxes on items, one bar with actions for the selected ones ---------------
 function batch(list,{actions}){
  const chosen=new Set(),bar=el('div','kit-batch');bar.hidden=true;const count=el('span');bar.append(count);
  for(const a of actions){const b=el('button',a.primary?'primary':'',a.label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await a.run([...chosen]);}catch(e){toast(e.message,{error:true});}finally{b.disabled=false;}};bar.append(b);}
  const sync=()=>{bar.hidden=!chosen.size;count.textContent='Выбрано: '+chosen.size;};
  return {bar,toggle(key,on){on?chosen.add(key):chosen.delete(key);sync();},box(key){const input=el('input','kit-check');input.type='checkbox';input.setAttribute('aria-label','Выбрать');input.onclick=e=>e.stopPropagation();input.onchange=()=>{this.toggle(key,input.checked);};return input;},clear(){chosen.clear();sync();}};
 }

 // Remove plain-text lines the cards replace (e.g. «KEY — title» lines), keeping explanations.
 function dropLines(parent,test){for(const node of parent.querySelectorAll(':scope>p,:scope>ul>li,:scope>ol>li'))if(test(node.textContent.trim()))node.remove();for(const list of parent.querySelectorAll(':scope>ul,:scope>ol'))if(!list.children.length)list.remove();}

 // --- Side panel: a full view next to the chat (one at a time), resizable, closes with Esc --------------
 let side=null;
 function panel({id,title,subtitle,actions=[],body,className=''}){
  const home=document.getElementById('home');if(!home)return null;
  if(!side){
   const box=el('aside','kit-panel');box.setAttribute('role','complementary');box.tabIndex=-1;
   const grip=el('div','kit-panel-grip');grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.title='Потяните, чтобы изменить ширину';
   grip.onpointerdown=e=>{e.preventDefault();grip.setPointerCapture(e.pointerId);const right=box.getBoundingClientRect().right;
    grip.onpointermove=m=>{const w=Math.round(Math.min(Math.max(320,right-m.clientX),Math.max(360,innerWidth*0.7)));home.style.setProperty('--kit-panel-w',w+'px');};
    grip.onpointerup=()=>{grip.onpointermove=null;store.set('panel-width',getComputedStyle(home).getPropertyValue('--kit-panel-w').trim());};};
   const head=el('div','kit-panel-head'),titles=el('div','kit-panel-titles'),name=el('h3','kit-panel-title'),sub=el('small','kit-panel-subtitle'),tools=el('div','kit-panel-tools');
   const close=el('button','kit-panel-close','×');close.type='button';close.title='Закрыть (Esc)';close.setAttribute('aria-label','Закрыть панель');close.onclick=()=>closePanel();
   titles.append(name,sub);head.append(titles,tools,close);const content=el('div','kit-panel-body');box.append(grip,head,content);
   side={box,name,sub,tools,content,id:null,topic:null};
   const width=store.get('panel-width','');if(width)home.style.setProperty('--kit-panel-w',width);
  }
  side.id=id;side.topic=typeof topicSelect!=='undefined'?topicSelect.value:'';
  side.name.textContent=title||'';side.sub.textContent=subtitle||'';side.sub.hidden=!subtitle;side.box.setAttribute('aria-label',title||'Просмотр');
  side.tools.replaceChildren(...actions.map(a=>{const b=el('button',null,a.label);b.type='button';if(a.title)b.title=a.title;b.onclick=()=>a.run(b);return b;}));
  side.box.className='kit-panel'+(className?' '+className:'');side.content.replaceChildren(body||el('p','kit-meta','Загружаю…'));side.content.scrollTop=0;
  if(!side.box.isConnected)home.append(side.box);home.classList.add('with-side-panel');
  document.dispatchEvent(new CustomEvent('petya-panel',{detail:{id,open:true}}));
  side.box.focus({preventScroll:true});
  return {set(node){if(side?.id===id)side.content.replaceChildren(node);},get open(){return side?.id===id&&side.box.isConnected;}};
 }
 // reason: 'user' (×, Esc) or 'chat' (another chat was opened) — a per-chat panel (the browser) keeps its state on 'chat'.
 function closePanel(reason='user'){if(!side?.box.isConnected)return;const id=side.id;side.box.remove();side.id=null;document.getElementById('home')?.classList.remove('with-side-panel');document.dispatchEvent(new CustomEvent('petya-panel',{detail:{id,open:false,reason}}));}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!openMenu&&side?.box.isConnected&&!document.querySelector('dialog[open]')&&(side.box.contains(document.activeElement)||document.activeElement===document.body)){e.preventDefault();closePanel();}});
 // A panel belongs to its chat: switching chats closes it.
 for(const ev of ['petya-dialogue-state','petya-chat-opened'])document.addEventListener(ev,()=>{if(side?.box.isConnected&&typeof topicSelect!=='undefined'&&topicSelect.value!==side.topic)closePanel('chat');});
 const panelOpen=id=>!!side?.box.isConnected&&side.id===id;

 // --- People: team photos next to names in cards (Slack authors, Jira assignees, meeting tasks, …) -------------
 let team=null,teamLoad=null;
 const key=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/^@/,'').replace(/\s+/g,' ').trim();
 function loadTeam(force=false){if(force)teamLoad=null;if(!teamLoad)teamLoad=(window.petya?.teamList?.()||Promise.resolve(null)).then(data=>{const index=new Map();
   for(const m of data?.members||[]){for(const n of [m.name,m.email,...String(m.aliases||'').split(/[,;]/),...Object.values(m.accounts||{}).flatMap(a=>[a.name,a.handle,a.id,a.email])])if(key(n)&&!index.has(key(n)))index.set(key(n),m);if(m.slackId)index.set(key(m.slackId),m);}
   team=index;document.querySelectorAll('.kit-person[data-person]').forEach(fillPerson);return index;}).catch(()=>{team=new Map();return team;});return teamLoad;}
 const person=name=>team?.get(key(name))||null;
 function fillPerson(node){const m=person(node.dataset.person);if(!m)return;node.title=m.name+(m.role?' · '+m.role:'');
  if(m.photo&&/^data:image\/(png|jpeg);base64,/.test(m.photo)&&!node.querySelector('img')){const img=el('img');img.src=m.photo;img.alt='';node.replaceChildren(img);node.classList.add('has-photo');}}
 // A round avatar: the team photo when the person is in «Команда», otherwise the initials.
 function avatar(name,{size=20}={}){
  const node=el('span','kit-person');node.dataset.person=String(name||'');node.style.setProperty('--size',size+'px');node.setAttribute('aria-hidden','true');
  node.textContent=String(name||'?').replace(/^@/,'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>Array.from(w)[0]).join('').toLocaleUpperCase()||'?';
  if(team)fillPerson(node);else loadTeam();return node;
 }
 for(const ev of ['petya-team-updated','petya-team-saved'])document.addEventListener(ev,()=>loadTeam(true));

 // Hand a follow-up to the chat: send it right away, or put it into the composer for the user to finish.
 async function ask(text,{send=false}={}){
  const box=document.getElementById('command');
  if(send&&typeof submitChatCommand==='function'){await submitChatCommand(text);return;}
  if(box){box.value=text;box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();box.setSelectionRange?.(text.length,text.length);}
 }
 // --- Cross-app links (src/features/app-links.cjs) ------------------------------------------------------------
 // links(kind, payload, {context, label, onDone}) → a node for an actions row: nothing when no app provides the
 // kind, one button for one provider, a button plus a small «▾» menu for several (the last choice per kind is
 // remembered). `payload` may be a function, read at the press. A provider answering with a prepared chat request
 // ({ask}) hands it to the chat, where that app's own flow previews and confirms it.
 const linkCache=new Map();
 function availableLinks(kind,context){
  const key=kind+'\n'+JSON.stringify(context||{}),hit=linkCache.get(key);
  if(hit&&Date.now()-hit.at<15000)return hit.promise;
  const promise=(window.petya?.feature?window.petya.feature('appLinks','available',kind,context||{}):Promise.resolve([])).catch(()=>[]);
  linkCache.set(key,{at:Date.now(),promise});return promise;
 }
 availableLinks.clear=()=>linkCache.clear();
 // Connections change in settings, or an app is added or removed: the next card asks again.
 document.addEventListener('petya-settings-displayed',availableLinks.clear);
 document.addEventListener('petya-extensions-changed',availableLinks.clear);
 function openSettings(id){if(typeof view==='function')view('settings');const card=document.querySelector('[data-extension="'+id+'"],[data-service="'+id+'"]');if(card)window.revealSettings?.(card);}
 async function runLink(kind,provider,payload,onDone){
  const result=await window.petya.feature('appLinks','run',kind,provider.id,typeof payload==='function'?payload():payload);
  if(result?.settings)toast(result.text||'Нужна настройка приложения',{error:true,action:{label:'Открыть настройки',run:()=>openSettings(result.settings)}});
  else if(result?.ask)await (window.resultKit?.ask||ask)(result.ask,{send:result.send!==false});
  else if(result?.text)toast(result.text);
  onDone?.(result,provider);
  return result;
 }
 function links(kind,payload,{context,label,title,primary=false,onDone,className=''}={}){
  const box=el('span','kit-links'+(className?' '+className:''));box.dataset.kind=kind;
  (window.resultKit?.availableLinks||availableLinks)(kind,context).then(list=>{
   if(!Array.isArray(list)||!list.length)return;
   const memory='link-'+kind;
   let current=list.find(p=>p.id===store.get(memory,''))||list[0];
   // `label` is a fixed text for a single provider, or a function of the provider for any number of them.
   const named=p=>typeof label==='function'?label(p):label&&list.length===1?label:p.label;
   const main=el('button','kit-link'+(primary?' primary':''),named(current));main.type='button';main.dataset.provider=current.id;
   if(title||current.hint)main.title=title||current.hint;
   const press=async provider=>{main.disabled=true;main.setAttribute('aria-busy','true');try{await runLink(kind,provider,payload,onDone);}catch(e){toast(e.message,{error:true});}finally{main.disabled=false;main.removeAttribute('aria-busy');}};
   main.onclick=event=>{event.stopPropagation();press(current);};
   box.append(main);
   if(list.length>1){
    const more=el('button','kit-link-more','▾');more.type='button';more.setAttribute('aria-label','Выбрать приложение');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');
    more.onclick=event=>{event.stopPropagation();menu(more,async()=>list.map(p=>({label:named(p),id:p.id,hint:p.hint||''})),async option=>{
     current=list.find(p=>p.id===option.id)||current;store.set(memory,current.id);main.textContent=named(current);main.dataset.provider=current.id;await press(current);
    });};
    box.classList.add('several');box.append(more);
   }
  });
  return box;
 }
 // --- Outgoing review (src/features/outgoing.cjs, docs/foundations/outgoing.md) ------------------------------------
 // outgoingReview(area, {channel:{service, target, audience}, context, language}) → a node for a send confirmation,
 // between the text and the send button. It reviews the textarea when shown and after edits, lists the findings,
 // and «Заменить» puts one suggestion into the textarea (visible, with «Вернуть»). It never disables sending:
 // the confirmation sends the textarea as it is. A review that fails or is slow simply shows nothing.
 // applyFinding(text, finding) → the text with that suggestion, or null when its span is no longer there.
 function applyFinding(text,f){
  text=String(text??'');if(typeof f?.suggestion!=='string')return null;
  if(!f.span)return f.suggestion;
  let at=-1;
  if(text.slice(f.span.start,f.span.end)===f.span.text)at=f.span.start;
  else{const i=text.indexOf(f.span.text);if(i>=0&&i===text.lastIndexOf(f.span.text))at=i;}
  return at<0?null:text.slice(0,at)+f.suggestion+text.slice(at+f.span.text.length);
 }
 const SEVERITY={problem:'Может задеть',warning:'Лучше поправить',info:'На заметку'};
 const quoteOf=(text,max=60)=>{const q=el('q',null,String(text).length>max?String(text).slice(0,max-1)+'…':String(text));q.dataset.noI18n='';return q;};
 function outgoingReview(area,{channel={},context={},language='',delay=700,timeout=10000}={}){
  const box=el('div','kit-review');box.hidden=true;box.setAttribute('aria-live','polite');
  const head=el('div','kit-review-head'),list=el('div','kit-review-list'),log=el('div','kit-review-log');
  box.append(head,list,log);
  let seq=0,timer=null;const applied=[];
  const put=text=>{area.value=text;area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();};
  const use=(f,next)=>{applied.push({from:f.span?f.span.text:'',to:f.suggestion,before:area.value,after:next});put(next);};
  function paintLog(){
   log.replaceChildren();
   for(const a of applied.slice(-3)){
    const row=el('div','kit-review-done');row.append(el('span',null,a.count?'Заменено фрагментов: '+a.count:a.from?'Заменено:':'Текст заменён'));
    if(a.from&&!a.count)row.append(quoteOf(a.from,40),el('span',null,'→'),quoteOf(a.to||'∅',40));
    const back=el('button','kit-review-undo','Вернуть');back.type='button';
    back.disabled=area.value!==a.after;back.title=back.disabled?'Текст уже изменён после замены':'Вернуть как было';
    back.onclick=()=>{if(area.value!==a.after)return;applied.splice(applied.indexOf(a),1);put(a.before);};
    row.append(back);log.append(row);
   }
  }
  function paint(r){
   const findings=r?.findings||[];
   head.replaceChildren();list.replaceChildren();
   box.dataset.state=findings.length?'found':'clean';
   paintLog();
   if(!findings.length&&!applied.length){box.hidden=true;return;}
   box.hidden=false;
   const title=el('strong',null,'Проверка перед отправкой');
   const bar=el('span','kit-review-bar');bar.setAttribute('aria-hidden','true');
   for(const level of ['problem','warning','info']){const n=findings.filter(f=>f.severity===level).length;if(!n)continue;const seg=el('span','kit-review-seg');seg.dataset.severity=level;seg.style.flexGrow=String(n);bar.append(seg);}
   head.append(title);
   if(findings.length){
    head.append(bar,el('span','kit-review-count','Замечаний: '+findings.length));
    const fixable=findings.filter(f=>f.span&&typeof f.suggestion==='string');
    if(fixable.length>1){
     const all=el('button','kit-review-all','Заменить всё');all.type='button';all.title='Применить все предложенные замены — текст останется в поле, отправите вы';
     all.onclick=()=>{let text=area.value,done=0;for(const f of [...fixable].sort((a,b)=>b.span.start-a.span.start)){const next=applyFinding(text,f);if(next!==null){text=next;done++;}}if(done){applied.push({count:done,before:area.value,after:text});put(text);}};
     head.append(all);
    }
   }else head.append(el('span','kit-review-count','Замечаний нет'));
   head.append(el('small','kit-review-note','Можно отправить как есть'));
   for(const f of findings){
    const row=el('div','kit-review-item');row.dataset.severity=f.severity;
    const dot=el('span','kit-review-dot');dot.title=SEVERITY[f.severity]||'';dot.setAttribute('aria-label',dot.title);
    const body=el('div','kit-review-text');
    if(f.span)body.append(quoteOf(f.span.text));
    body.append(el('span','kit-review-message',f.message));
    row.append(dot,body);
    if(typeof f.suggestion==='string'){
     const b=el('button','kit-review-apply');b.type='button';b.title=f.suggestion||'Убрать фрагмент';
     if(!f.span)b.append(el('span',null,'Заменить весь текст'));
     else if(f.suggestion)b.append(el('span',null,'Заменить на'),quoteOf(f.suggestion,48));
     else b.append(el('span',null,'Убрать'));
     b.onclick=()=>{const next=applyFinding(area.value,f);if(next===null){toast('Текст изменился — проверяю заново');run();return;}use(f,next);};
     row.append(b);
    }
    list.append(row);
   }
  }
  async function run(){
   clearTimeout(timer);const text=area.value,my=++seq;
   if(!text.trim()){paint(null);return;}
   box.dataset.state='checking';
   let r=null;
   try{r=await Promise.race([window.petya?.feature?window.petya.feature('outgoing','review',{text,channel,context,language}):null,new Promise(resolve=>setTimeout(()=>resolve(null),timeout))]);}catch{r=null;}
   if(my!==seq||area.value!==text)return;
   paint(r);
  }
  area.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(run,delay);});
  box.refresh=run;
  setTimeout(run,0);
  return box;
 }
 window.resultKit={panelBox:()=>side?.box||null,el,safeUrl,links,availableLinks,chip,card,menu,toast,quick,views,collapse,table,board,batch,dropLines,store,ask,icons,panel,closePanel,panelOpen,avatar,person:name=>person(name),loadTeam,outgoingReview,applyFinding};
})();
