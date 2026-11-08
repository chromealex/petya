// «Поиск файлов по смыслу», renderer: found files with a type badge, path, the best matching piece with the query's
// words highlighted, a similarity bar, the modification time and «Открыть» / «Показать в папке» / «Спросить по
// этому файлу»; while the index is off, the card explains what will be read and downloaded and turns it on only
// when the user presses the button.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('file-search-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('fileSearch',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const megabytes=n=>Math.round((Number(n)||0)/1e6).toLocaleString(locale())+' МБ';
 const finder=c=>(c.platform||window.petyaPlatform)==='win32'?'Показать в Проводнике':(c.platform||window.petyaPlatform)==='darwin'?'Показать в Finder':'Показать в папке';
 // Badge colour by file kind (the label is the extension itself).
 const TINT={slides:'#e0a96d',pdf:'#e08a7a',doc:'#7aa7e0',sheet:'#8cc79a',code:'#b59ad8',markdown:'#9fb7c9',text:'#a9b0aa'};
 function badge(k,h){const b=k.el('span','fs-badge',(h.ext||'·').slice(0,4).toUpperCase());b.style.setProperty('--tint',TINT[h.kind]||TINT.text);b.setAttribute('aria-hidden','true');return b;}
 function where(h){
  const l=h.loc||{};
  if(l.slide)return 'слайд '+l.slide;if(l.page)return 'стр. '+l.page;if(l.sheet)return 'лист '+l.sheet;
  if(l.heading)return '§ '+l.heading;if(l.line)return 'строка '+l.line;return '';
 }
 // The snippet as text nodes and <mark>s; ranges come from the main process and are only character offsets.
 function snippet(k,h){
  const p=k.el('p','fs-snippet selectable');p.dataset.noI18n='';
  const text=String(h.snippet||'');let at=0;
  for(const [a,b] of (h.ranges||[]).filter(r=>Array.isArray(r)&&r[0]>=0&&r[1]<=text.length&&r[0]<r[1]).sort((x,y)=>x[0]-y[0])){
   if(a<at)continue;p.append(document.createTextNode(text.slice(at,a)),k.el('mark',null,text.slice(a,b)));at=b;
  }
  p.append(document.createTextNode(text.slice(at)));return p;
 }
 function score(k,h,top){
  const box=k.el('span','fs-score');const value=Math.max(0,Math.min(1,Number(h.score)||0));
  const track=k.el('span','fs-score-track');const fill=k.el('span','fs-score-fill');
  // Bars are relative to the best hit, so the order is visible at a glance; the exact cosine is in the tooltip.
  fill.style.width=Math.max(6,Math.round(100*value/Math.max(top,0.01)))+'%';track.append(fill);
  box.title='Сходство по смыслу: '+value.toLocaleString(locale(),{maximumFractionDigits:2});
  box.setAttribute('role','meter');box.setAttribute('aria-valuemin','0');box.setAttribute('aria-valuemax','1');box.setAttribute('aria-valuenow',String(value));box.setAttribute('aria-label','Сходство по смыслу');
  box.append(track,k.el('span','fs-score-value',value.toLocaleString(locale(),{minimumFractionDigits:2,maximumFractionDigits:2})));
  return box;
 }
 function action(k,label,run,cls=''){const b=k.el('button',cls,label);b.type='button';b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{await run();}catch(err){k.toast(err.message,{error:true});}finally{b.disabled=false;}};return b;}
 function hitRow(k,c,h,top,index){
  const row=k.el('article','fs-hit'+(index===0?' best':''));row.dataset.path=h.path;
  const main=k.el('div','fs-main');
  const head=k.el('div','fs-head');const name=k.el('strong','fs-name',h.name);name.dataset.noI18n='';name.title=h.path;head.append(name);
  const loc=where(h);if(loc){const tag=k.el('span','fs-loc',loc);if(h.loc?.heading)tag.dataset.noI18n='';head.append(tag);}
  const dir=k.el('div','fs-path selectable',h.dir);dir.dataset.noI18n='';dir.title=h.path;
  const foot=k.el('div','fs-foot');foot.append(score(k,h,top));
  if(h.mtime){const t=window.timeElement?window.timeElement(new Date(h.mtime)):k.el('time',null,new Date(h.mtime).toLocaleDateString(locale()));t.classList?.add('fs-time');const m=k.el('span','fs-modified','изменён ');m.append(t);foot.append(m);}
  const acts=k.el('div','fs-actions');
  acts.append(action(k,'Открыть',()=>call('open',h.path),'primary'),action(k,finder(c),()=>call('reveal',h.path)),
   action(k,'Спросить по этому файлу',async()=>{const r=await call('ask',h.path);if(typeof refreshAttachments==='function')await refreshAttachments();await k.ask('Что в файле «'+r.attached+'» '+(c.query?'про «'+c.query+'»':'главное')+'?');k.toast('Файл прикреплён к сообщению — допишите вопрос и отправьте.');}));
  main.append(head,dir,snippet(k,h),foot,acts);
  row.append(badge(k,h),main);
  return row;
 }
 function progressLine(k,b){
  if(!b)return null;
  const box=k.el('div','fs-building');const pct=b.total?Math.floor(100*b.done/b.total):0;
  const bar=k.el('span','fs-building-bar');const fill=k.el('span','fs-building-fill');fill.style.width=pct+'%';bar.append(fill);
  box.append(k.el('span',null,(b.paused?'Индекс на паузе: ':'Индекс строится: ')+b.done.toLocaleString(locale())+' из '+b.total.toLocaleString(locale())),bar);
  return box;
 }
 function results(k,c,parent){
  const hits=c.hits||[],top=hits[0]?.score||1;
  const body=k.el('div','fs-body');
  const line=progressLine(k,c.building);if(line)body.append(line);
  if(!hits.length)body.append(k.el('p','fs-empty',c.building?'Пока ничего похожего: проиндексирована только часть файлов.':'Ничего похожего в проиндексированных папках. Опишите файл иначе — например, о чём он или что в нём есть.'));
  else body.append(k.collapse(hits.map((h,i)=>hitRow(k,c,h,top,i)),3,'Ещё файлы'));
  const status=c.building?{label:c.building.paused?'Индекс на паузе':'Индекс строится',tone:'progress'}:{label:'В индексе: '+(c.indexed||0).toLocaleString(locale()),tone:'done'};
  const subtitle=k.el('span','fs-query','«'+c.query+'»');subtitle.dataset.noI18n='';
  const actions=hits.length?[]:[{label:'Повторить поиск',run:()=>k.ask(c.request||c.query,{send:true})}];
  parent.append(k.card({app:'Поиск файлов',initial:'⌕',color:'#4f6a8a',key:'По смыслу',status,subtitle,body,actions,className:'fs-card'}));
 }
 // Index off or model missing: what will happen, then the user's explicit «включить».
 function setup(k,c,parent){
  const body=k.el('div','fs-body');let node;
  const intro=k.el('p','fs-intro',c.state==='model'?'Для поиска по смыслу нужна локальная модель '+c.model+' ('+megabytes(c.bytes)+'). Она работает в Ollama на этом компьютере.':'Поиск по смыслу идёт по локальному индексу. Петя прочитает текст файлов в этих папках, разобьёт на фрагменты и посчитает их смысл моделью '+c.model+' в Ollama. Индекс хранится только на этом компьютере; ключи, .env и папки сборки пропускаются.');
  body.append(intro);
  if(c.state!=='model'){
   const list=k.el('ul','fs-folders');
   for(const f of c.folders||[]){const li=k.el('li');const p=k.el('span','fs-folder-path',f.path);p.dataset.noI18n='';li.append(p);if(f.project){const t=k.el('span','fs-folder-tag','проект '+f.project);t.dataset.noI18n='';li.append(t);}list.append(li);}
   if(!(c.folders||[]).length)list.append(k.el('li','fs-empty','Папок пока нет: добавьте папку проекта или любую другую.'));
   body.append(list);
  }
  const state=k.el('p','fs-state');state.setAttribute('role','status');body.append(state);
  let timer=null;
  const watch=()=>{clearTimeout(timer);timer=setTimeout(async()=>{
   if(!node?.isConnected)return;
   try{const st=await call('status');const ix=st.index||{};
    if(ix.preparing){state.textContent=ix.preparing.message+(ix.preparing.total?' '+Math.floor(100*ix.preparing.received/ix.preparing.total)+'%':'');watch();return;}
    if(ix.phase&&ix.phase!=='idle'&&ix.collection==='files'){state.textContent='Индексирую: '+(ix.done||0)+' из '+(ix.total||0)+' файлов';watch();return;}
    if(st.enabled&&ix.modelInstalled&&(st.files?.items||0)>0){state.textContent='Индекс готов: '+st.files.items.toLocaleString(locale())+' файлов.';again.hidden=false;return;}
    state.textContent=ix.phase==='listing'?'Собираю список файлов…':'Готовлю индекс…';watch();
   }catch(e){state.textContent=e.message;}
  },1000);};
  const again=k.el('button','primary','Повторить поиск');again.type='button';again.hidden=true;again.onclick=()=>k.ask(c.request||c.query,{send:true});
  const enable=c.state==='model'?{label:'Скачать модель ('+megabytes(c.bytes)+')',primary:true,run:async()=>{await call('prepareModel');state.textContent='Загрузка модели началась — прогресс в центре уведомлений.';watch();}}
   :{label:c.modelInstalled?'Включить индекс':'Скачать модель и включить ('+megabytes(c.bytes)+')',primary:true,run:async()=>{if(!(c.folders||[]).length){k.toast('Сначала добавьте папку.',{error:true});return;}await call('enable',true);state.textContent=c.modelInstalled?'Индекс включён — собираю список файлов…':'Загружаю модель — прогресс в центре уведомлений.';watch();}};
  const add={label:'Добавить папку',run:async()=>{const st=await call('addFolder');c={...c,folders:(st.folders||[]).filter(f=>f.exists)};const next=build();node.replaceWith(next);node=next;}};
  const settings={label:'Настройки',run:()=>{if(typeof view==='function')view('settings');const card=document.querySelector('[data-extension="file-search"]');if(card)window.revealSettings?.(card);}};
  const build=()=>{const b=body;return k.card({app:'Поиск файлов',initial:'⌕',color:'#4f6a8a',key:'По смыслу',status:{label:c.state==='model'?'Нужна модель':'Индекс выключен',tone:'alert'},title:c.state==='model'?'Скачать модель для поиска по смыслу?':'Включить поиск по смыслу?',body:b,actions:[enable,...c.state==='model'?[]:[add],settings,again],className:'fs-card fs-setup'});};
  node=build();parent.append(node);
 }
 window.renderFileSearch=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.fs-card'))return;
  const c={...data};
  if(c.state==='results')results(k,c,parent);
  else if(c.state==='setup'||c.state==='model')setup(k,c,parent);
  else{const body=k.el('p','fs-empty',c.error||'Поиск сейчас недоступен.');body.dataset.noI18n='';parent.append(k.card({app:'Поиск файлов',initial:'⌕',color:'#4f6a8a',key:'По смыслу',status:{label:'Ошибка',tone:'alert'},body,actions:[{label:'Повторить',run:()=>k.ask(c.request||c.query,{send:true})}],className:'fs-card'}));}
 };
})();
