// «Google Диск», renderer. Modes: `files` — a stacked bar of file kinds over the list (generic kind icon, name, owner,
// relative modified time, open / read / open as a table); `doc` — the document's outline with each section's length
// as a bar and its opening lines; `answer` — the answer with the document's own words as quotes, or the closest places;
// `save` — the new document's preview with an editable title and «Создать документ» (the only write, one ipc call).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('drive-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('googleDrive',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const open=url=>{if(typeof window.openChatBrowser==='function')window.openChatBrowser(url);else window.open(url,'_blank','noopener');};
 const badge={app:'Google Диск',initial:'▤',color:'#3d6b8c'};
 const KIND={document:'Документ',spreadsheet:'Таблица',presentation:'Презентация',pdf:'PDF',folder:'Папка',image:'Изображение',video:'Видео',audio:'Аудио',archive:'Архив',text:'Текст',form:'Форма',drawing:'Рисунок',shortcut:'Ярлык',file:'Файл'};
 const KINDS_MANY={document:'Документы',spreadsheet:'Таблицы',presentation:'Презентации',pdf:'PDF',folder:'Папки',image:'Изображения',video:'Видео',audio:'Аудио',archive:'Архивы',text:'Тексты',form:'Формы',drawing:'Рисунки',shortcut:'Ярлыки',file:'Другие файлы'};
 // Generic stroke icons per kind (static markup, never data): a page with lines, a grid, a slide, a folder, a picture…
 const ICON={
  document:'<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 11.5h6M9.5 14.5h6M9.5 17.5h4"/>',
  spreadsheet:'<rect x="5" y="4.5" width="14" height="15" rx="1.5"/><path d="M5 9.5h14M5 14.5h14M10 9.5v10"/>',
  presentation:'<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M12 16v3.5M9 19.5h6M8 9h5M8 12h8"/>',
  pdf:'<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 16.5c2-1 3.5-3.5 3.8-6.2.1-.9-1-.9-1.1 0-.3 2.6 1.6 5.3 3.4 5.9"/>',
  folder:'<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  image:'<rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4 3 2.5 3-3 3.5 3.5"/>',
  video:'<rect x="4" y="6" width="12" height="12" rx="1.5"/><path d="M16 10.5l4-2.5v8l-4-2.5"/>',
  audio:'<path d="M9 17.5V6.5l9-2v11"/><circle cx="7" cy="17.5" r="2"/><circle cx="16" cy="15.5" r="2"/>',
  form:'<rect x="5" y="4" width="14" height="16" rx="1.5"/><circle cx="9" cy="9.5" r="1"/><circle cx="9" cy="14.5" r="1"/><path d="M11.5 9.5h4.5M11.5 14.5h4.5"/>',
  file:'<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/>'
 };
 const TONE={document:'#86c2ff',spreadsheet:'#a8d98a',presentation:'#e5ce8c',pdf:'#f0b4a8',folder:'#b9a7e8',image:'#9fd8d0',video:'#d9a7d0',audio:'#d9a7d0',form:'#b9a7e8'};
 const tone=kind=>TONE[kind]||'#a6aeaa';
 function icon(k,kind){
  const box=k.el('span','gd-icon');box.style.color=tone(kind);box.setAttribute('aria-hidden','true');
  box.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(ICON[kind]||ICON[{text:'document',archive:'file',drawing:'image',shortcut:'file'}[kind]]||ICON.file)+'</svg>';
  return box;
 }
 const when=iso=>{const d=new Date(iso);if(!iso||Number.isNaN(d.getTime()))return null;if(typeof window.timeElement==='function')return window.timeElement(d);const t=document.createElement('time');t.dateTime=d.toISOString();t.textContent=d.toLocaleDateString(locale());return t;};
 const ownerText=f=>f.mine?'вы':f.shared?'общий диск':'';

 // --- Files: kinds as a stacked bar, then the list ------------------------------------------------------------------
 function kindsBar(k,files){
  const counts=new Map();for(const f of files)counts.set(f.kind,(counts.get(f.kind)||0)+1);
  const box=k.el('div','gd-kinds');
  const bar=k.el('div','gd-kinds-bar');bar.setAttribute('role','img');
  const legend=k.el('div','gd-kinds-legend');
  const list=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  bar.setAttribute('aria-label',list.map(([kind,n])=>(KINDS_MANY[kind]||kind)+': '+n).join(', '));
  for(const [kind,n] of list){
   const seg=k.el('span');seg.style.flex=String(n);seg.style.background=tone(kind);seg.title=(KINDS_MANY[kind]||kind)+': '+n;bar.append(seg);
   const item=k.el('span','gd-kinds-item');const dot=k.el('i');dot.style.background=tone(kind);item.append(dot,k.el('span',null,KINDS_MANY[kind]||KIND.file),k.el('b',null,String(n)));legend.append(item);
  }
  box.append(bar,legend);return box;
 }
 function fileRow(k,f){
  const row=k.el('div','gd-file'+(f.meaning?' gd-meaning':''));
  const name=raw(k.el('button','gd-name',f.name));name.type='button';name.title=f.url;name.onclick=()=>open(f.url);
  const meta=k.el('small','gd-meta');
  meta.append(k.el('span',null,KIND[f.kind]||KIND.file));
  const who=ownerText(f);
  if(who)meta.append(k.el('span',null,who));else if(f.owner)meta.append(raw(k.el('span',null,f.owner)));
  if(f.editor){const ed=k.el('span');ed.append(k.el('span',null,'изменил(а)'),document.createTextNode(' '),raw(k.el('span',null,f.editor)));meta.append(ed);}
  if(f.meaning)meta.append(k.el('span','gd-tag','по смыслу'));
  const main=k.el('div','gd-file-main');main.append(name,meta);
  if(f.piece)main.append(raw(k.el('small','gd-piece',f.piece)));
  const time=k.el('span','gd-when');const t=when(f.modified);if(t)time.append(t);
  const act=k.el('div','gd-row-actions');
  const button=(label,run,title)=>{const b=k.el('button','gd-mini',label);b.type='button';if(title)b.title=title;b.onclick=e=>{e.stopPropagation();run();};act.append(b);};
  // A document is read here; a spreadsheet goes to the chat as its link (the app that reads Google Sheets takes it).
  if(f.kind==='document')button('Прочитать',()=>k.ask(f.url,{send:true}),'Оглавление и ответы по тексту');
  else if(f.kind==='spreadsheet')button('Открыть в чате',()=>k.ask(f.url,{send:true}),'Показать таблицу в чате');
  else button('Открыть',()=>open(f.url));
  row.append(icon(k,f.kind),main,time,act);
  return row;
 }
 function filesBody(k,c){
  const body=k.el('div','gd-body');
  if(!c.files.length){body.append(k.el('p','gd-empty',c.query?'Ничего не найдено. Попробуйте другие слова или название файла в кавычках.':'Файлов нет.'));return body;}
  if(!c.single&&c.files.length>1)body.append(kindsBar(k,c.files));
  const rows=c.files.map(f=>fileRow(k,f));
  const list=k.el('div','gd-files');list.append(...(c.files.length>8?[k.collapse(rows,8)]:rows));body.append(list);
  if(c.more)body.append(k.el('small','kit-meta','Показаны первые '+c.files.length+' — уточните запрос, чтобы найти остальные.'));
  return body;
 }

 // --- A document: outline with section lengths, the opening lines -----------------------------------------------------
 function docBody(k,c){
  const body=k.el('div','gd-body');
  if(c.empty){body.append(k.el('p','gd-empty','В документе нет текста.'));return body;}
  if(c.outline?.length){
   const max=Math.max(1,...c.outline.map(s=>s.words));
   const items=c.outline.map(s=>{
    const li=k.el('div','gd-sec'+(s.level<=1?' top':''));li.style.setProperty('--lvl',String(Math.max(0,Math.min(5,s.level-1))));
    const name=raw(k.el('span','gd-sec-name',s.text));
    const track=k.el('span','gd-sec-track');const fill=k.el('span');fill.style.width=Math.max(2,Math.round(s.words/max*100))+'%';track.append(fill);
    li.append(name,track,k.el('small','gd-sec-n',s.words.toLocaleString(locale())));li.title=s.words+' '+plural(s.words,['слово','слова','слов']);
    return li;
   });
   const ol=k.collapse(items,14,'Всё оглавление');ol.classList.add('gd-outline');ol.setAttribute('role','list');ol.setAttribute('aria-label','Оглавление');
   for(const li of items)li.setAttribute('role','listitem');
   body.append(ol);
  }else body.append(k.el('small','kit-meta','В документе нет заголовков.'));
  if(c.intro){const q=raw(k.el('blockquote','gd-intro',c.intro.replace(/\n{2,}/g,'\n')));body.append(q);}
  if(c.truncated)body.append(k.el('small','kit-meta','Документ очень длинный: прочитано начало.'));
  return body;
 }

 // --- An answer with quotes ---------------------------------------------------------------------------------------
 function quoteNode(k,q){
  const fig=k.el('figure','gd-quote');
  const text=raw(k.el('blockquote',null,q.text));
  const cap=k.el('figcaption');
  cap.append(k.el('span','gd-quote-n','§'+q.n));
  if(q.path)cap.append(raw(k.el('span',null,q.path)));
  fig.append(text,cap);return fig;
 }
 function answerBody(k,c){
  const body=k.el('div','gd-body');
  const ask=raw(k.el('p','gd-question',c.question));body.append(ask);
  if(c.state==='answer'){body.append(raw(k.el('p','gd-answer',c.answer)));body.append(k.el('small','gd-label','Цитаты из документа'));}
  else if(c.state==='none'||c.state==='empty')body.append(k.el('p','gd-answer muted',c.state==='empty'?'В документе нет текста.':'В документе ничего не нашлось про это.'));
  else body.append(k.el('small','gd-label',c.model?'Прямого ответа нет — ближе всего в документе:':'Что в документе об этом:'));
  for(const q of c.quotes||[])body.append(quoteNode(k,q));
  return body;
 }

 // --- Save a Petya answer as a new Google Doc -----------------------------------------------------------------------
 function previewNode(k,blocks){
  const box=raw(k.el('div','gd-preview'));
  let list=null;
  for(const b of blocks.slice(0,40)){
   if(b.type==='li'){if(!list){list=k.el(b.ordered?'ol':'ul');box.append(list);}const li=k.el('li',null,plainText(b.text));if(b.level)li.style.marginLeft=(b.level*16)+'px';list.append(li);continue;}
   list=null;
   if(b.type==='heading')box.append(k.el('h'+Math.min(6,b.level+2),'gd-h',plainText(b.text)));
   else if(b.type==='code')box.append(k.el('pre',null,b.text));
   else if(b.type==='quote')box.append(k.el('blockquote',null,plainText(b.text)));
   else if(b.type==='table'){const t=k.el('table');for(const [i,r] of b.rows.slice(0,8).entries()){const tr=k.el('tr');for(const cell of r)tr.append(k.el(i?'td':'th',null,plainText(cell)));t.append(tr);}box.append(t);}
   else box.append(k.el('p',null,plainText(b.text)));
  }
  return box;
 }
 const plainText=t=>String(t).replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,'$1$2').replace(/\*([^*\s][^*]*)\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1');
 function saveBody(k,c,state){
  const body=k.el('div','gd-body');
  const field=k.el('label','gd-title-field');field.append(k.el('span',null,'Название'));
  const input=k.el('input');input.type='text';input.maxLength=200;input.value=c.done?.title||c.title;input.disabled=!!c.done;raw(input);field.append(input);state.title=()=>input.value;
  body.append(field);
  const page=k.el('div','gd-page');page.append(previewNode(k,c.preview||[]));body.append(page);
  const n=c.text.length;
  const facts=[n.toLocaleString(locale())+' '+plural(n,['символ','символа','символов'])];
  if(c.sections)facts.push(c.sections+' '+plural(c.sections,['раздел','раздела','разделов']));
  if(c.app)facts.push('из «'+c.app+'»');
  body.append(k.el('small','kit-meta',facts.join(' · ')+(c.truncated?' · текст обрезан до 200 000 символов':'')));
  const where=k.el('p','gd-where');
  if(c.done){where.append(k.el('span',null,'Создан: '),raw(k.el('strong',null,c.done.title)));where.classList.add('done');}
  else if(!c.canCreate)where.textContent='Сервисный аккаунт не может создать документ в вашем Диске — подключите аккаунт Google в настройках «Google Диск».';
  else{where.append(k.el('span',null,'Новый документ в «Моём диске»'));if(c.who){where.append(k.el('span',null,' · '));where.append(raw(k.el('span',null,c.who)));}where.append(k.el('span',null,'. Другие файлы Петя не трогает.'));}
  body.append(where);
  return body;
 }
 const openSettings=()=>{if(typeof view==='function')view('settings');const card=document.querySelector('[data-extension="google-drive"]');if(card)window.revealSettings?.(card);};

 window.renderDriveCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.drive-card'))return;
  let card;
  if(c.mode==='files'){
   const n=c.files.length;
   const title=c.single?(c.files[0]?.name||''):c.query?'«'+c.query+'»':c.recent?'Недавно изменённые':'';
   const status=c.single?{label:KIND[c.files[0]?.kind]||KIND.file}:{label:n?n+' '+plural(n,['файл','файла','файлов']):'ничего',tone:n?'accent':''};
   const actions=c.single&&c.files[0]?[{label:'Открыть',primary:true,run:()=>open(c.files[0].url)}]:[{label:'Найти ещё…',run:()=>k.ask('Найди в гугл диске ')}];
   card=k.card({...badge,key:title,status,subtitle:c.who||'',body:filesBody(k,c),actions,className:'drive-card'});
   const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
   if(c.query||c.single){const key=card.querySelector('.kit-key');if(key)raw(key);}
  }else if(c.mode==='doc'){
   const n=c.outline?.length||0;
   const meta=[ownerText(c.doc)||c.doc.owner,(c.total||0).toLocaleString(locale())+' '+plural(c.total||0,['слово','слова','слов'])].filter(Boolean);
   card=k.card({...badge,key:c.doc.title,href:c.doc.url,status:{label:n?n+' '+plural(n,['раздел','раздела','разделов']):'без разделов'},body:docBody(k,c),
    actions:[{label:'Спросить по документу…',primary:true,run:()=>k.ask('По документу: ')},{label:'Открыть в Google Документах',run:()=>open(c.doc.url)}],className:'drive-card'});
   const head=card.querySelector('.kit-card-head');const sub=k.el('span','kit-subtitle gd-sub');
   for(const [i,m] of meta.entries())sub.append(i===0&&!ownerText(c.doc)?raw(k.el('span',null,m)):k.el('span',null,m));
   const t=when(c.doc.modified);if(t)sub.append(t);
   head.append(sub);
  }else if(c.mode==='answer'){
   const status=c.state==='answer'?{label:'по тексту документа',tone:'done'}:c.state==='places'?{label:'точного ответа нет',tone:'progress'}:{label:'не нашёл',tone:'alert'};
   card=k.card({...badge,key:c.doc.title,href:c.doc.url,status,body:answerBody(k,c),
    actions:[{label:'Спросить ещё…',run:()=>k.ask('По документу: ')},{label:'Открыть документ',run:()=>open(c.doc.url)}],className:'drive-card'});
  }else if(c.mode==='save'){
   const state={};
   const status=k.chip(c.done?{label:'создан',tone:'done'}:{label:'ждёт подтверждения',tone:'progress'});
   const body=saveBody(k,c,state);
   const actions=[];
   const opened=url=>({label:'Открыть в Google Документах',primary:true,run:()=>open(url)});
   if(c.done)actions.push(opened(c.done.url));
   else if(c.canCreate)actions.push({label:'Создать документ',primary:true,title:'Петя создаст новый Google Документ с этим текстом',run:async b=>{
    const r=await call('save',c.draftId,state.title());
    if(r?.settings){k.toast(r.text,{error:true,action:{label:'Открыть настройки',run:openSettings}});return;}
    c.done=r.done;status.replaceWith(k.chip({label:'создан',tone:'done'}));
    const row=b.closest('.kit-actions');row.replaceChildren();const o=k.el('button','primary','Открыть в Google Документах');o.type='button';o.onclick=()=>open(r.done.url);row.append(o);
    body.querySelector('input').disabled=true;
    const where=body.querySelector('.gd-where');where.replaceChildren(k.el('span',null,'Создан: '),raw(k.el('strong',null,r.done.title)));where.classList.add('done');
    k.toast(r.already?'Документ уже создан.':'Документ создан в Google Диске.');}});
   card=k.card({...badge,key:c.done?.title||c.title,status,subtitle:'новый документ',body,actions,className:'drive-card'});
  }
  if(!card)return;
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
