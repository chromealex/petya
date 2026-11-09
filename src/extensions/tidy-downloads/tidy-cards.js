// «Уборка загрузок», renderer: one stacked bar of the Downloads folder (each group's share of the total), the groups
// as expandable rows with their files (checkbox, preview for pictures, why it is in the group, size), and per group a
// red trash button and «В папку «Разобрано»» that first ask with the exact count and size; the action runs only on
// that confirmation. Below, the undo list: every action with «Вернуть».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('tidy-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('tidyDownloads',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const U=unit=>' '+(/^ru/i.test(locale())?unit:({ТБ:'TB',ГБ:'GB',МБ:'MB',КБ:'KB',Б:'B'}[unit]||unit));
 function human(bytes){const n=Number(bytes)||0;for(const [d,u] of [[1e12,'ТБ'],[1e9,'ГБ'],[1e6,'МБ'],[1e3,'КБ']])if(n>=d)return (n/d).toLocaleString(locale(),{maximumFractionDigits:n/d>=100?0:1})+U(u);return n+U('Б');}
 const COLORS={duplicates:'#e5ce8c',installers:'#86a8e0',archives:'#b9a3e3',large:'#f0b4a8',screenshots:'#9fd8c8'};
 const IMAGE=/\.(?:png|jpe?g|heic|webp|gif|bmp)$/i;
 const files=n=>{const a=n%100,b=n%10;return n+' '+(a>10&&a<20?'файлов':b===1?'файл':b>=2&&b<=4?'файла':'файлов');};
 const finder=()=>window.petyaPlatform==='win32'?'Показать в Проводнике':'Показать в Finder';
 const when=t=>window.relativeTime?window.relativeTime(new Date(t)):new Date(t).toLocaleDateString(locale());

 function stacked(k,d){
  const box=k.el('div','tidy-total');
  const free=d.groups.reduce((a,g)=>a+g.bytes,0);
  const head=k.el('div','tidy-total-head');
  head.append(k.el('strong',null,human(d.total)),k.el('span','tidy-muted',files(d.files)+(d.folders?' · папок: '+d.folders:'')+' · убрать можно '+human(free)));
  const track=k.el('div','tidy-track');track.setAttribute('role','img');
  track.setAttribute('aria-label','Можно убрать '+human(free)+' из '+human(d.total));
  for(const g of d.groups){const seg=k.el('span','tidy-seg');seg.style.width=Math.max(0.6,100*g.bytes/Math.max(1,d.total)).toFixed(2)+'%';seg.style.background=COLORS[g.id]||'#86a8e0';seg.title=g.label+' · '+human(g.bytes);track.append(seg);}
  const legend=k.el('div','tidy-legend');
  for(const g of d.groups){const i=k.el('span','tidy-legend-item');const dot=k.el('span','tidy-dot');dot.style.background=COLORS[g.id];i.append(dot,k.el('span',null,g.label),k.el('span','tidy-muted',human(g.bytes)));legend.append(i);}
  box.append(head,track,legend);return box;
 }

 function why(k,g,item,days){
  const t=k.el('span','tidy-why');
  if(g.id==='duplicates'){t.append('копия файла ');const n=k.el('span','tidy-name-inline',item.original);n.dataset.noI18n='';t.append(n);}
  else if(g.id==='installers'){t.append('установлено: ');const n=k.el('span','tidy-name-inline',item.app);n.dataset.noI18n='';t.append(n);}
  else if(g.id==='archives'){t.append('распакован в папку ');const n=k.el('span','tidy-name-inline',item.folder);n.dataset.noI18n='';t.append(n);}
  else if(g.id==='large')t.append(item.lastUsed?'последний раз открывали '+when(item.lastUsed):'не открывали больше '+days+' дней');
  else t.append('сохранён '+when(item.mtime));
  return t;
 }

 function groupRow(k,d,g,max,onChange){
  const row=k.el('details','tidy-group');row.dataset.group=g.id;
  const head=k.el('summary','tidy-group-head');
  const label=k.el('span','tidy-group-label');const dot=k.el('span','tidy-dot');dot.style.background=COLORS[g.id];
  label.append(dot,k.el('span','tidy-group-name',g.label),k.el('span','tidy-count',String(g.items.filter(i=>!i.removed).length)));
  const track=k.el('span','tidy-group-track');const fill=k.el('span','tidy-group-fill');fill.style.background=COLORS[g.id];track.append(fill);
  const size=k.el('span','tidy-size');
  head.append(label,track,size,k.el('span','tidy-group-note',g.note));
  row.append(head);
  const body=k.el('div','tidy-group-body');row.append(body);
  // Pictures get a preview only when the row is opened (one small IPC each).
  const thumbs=new Map();
  const previews=()=>{if(!row.open)return;for(const img of body.querySelectorAll('img[data-path]')){const p=img.dataset.path;
   if(!thumbs.has(p))thumbs.set(p,call('thumb',d.scanId,p).then(url=>/^data:image\/(?:png|jpeg);base64,/.test(url||'')?url:'',()=>''));
   thumbs.get(p).then(url=>{if(url)img.src=url;else img.closest('.tidy-thumb')?.classList.add('empty');});}};
  row.addEventListener('toggle',previews);
  const chosen=new Set(g.items.filter(i=>!i.removed&&g.id!=='large').map(i=>i.path));
  function paint(){
   const left=g.items.filter(i=>!i.removed);
   const bytes=left.reduce((a,i)=>a+i.bytes,0);
   fill.style.width=(max?Math.max(left.length?1:0,100*bytes/max):0).toFixed(1)+'%';
   size.textContent=human(bytes);label.querySelector('.tidy-count').textContent=String(left.length);
   body.replaceChildren();
   const list=[];
   for(const item of g.items){
    const li=k.el('div','tidy-file'+(item.removed?' removed':''));
    const box=k.el('input');box.type='checkbox';box.checked=chosen.has(item.path)&&!item.removed;box.disabled=!!item.removed;
    box.setAttribute('aria-label',item.name);
    box.onchange=()=>{box.checked?chosen.add(item.path):chosen.delete(item.path);sync();};
    const thumb=k.el('span','tidy-thumb');
    if(IMAGE.test(item.name)){const img=k.el('img');img.alt='';img.dataset.path=item.path;thumb.append(img);}else thumb.append(k.el('span','tidy-ext',(item.name.match(/\.([a-z0-9]{1,5})$/i)?.[1]||'').toUpperCase()||'·'));
    const text=k.el('span','tidy-file-text');const name=k.el('span','tidy-file-name',item.name);name.dataset.noI18n='';name.title=item.path;
    text.append(name,item.removed?k.el('span','tidy-why','убран'):why(k,g,item,d.days));
    li.append(box,thumb,text,k.el('span','tidy-size',human(item.bytes)));
    list.push(li);
   }
   const stack=k.collapse(list,8,'Ещё');stack.classList.add('tidy-files');body.append(stack);previews();
   const bar=k.el('div','tidy-actions');
   const total=k.el('span','tidy-chosen');
   const trash=(window.deleteButton||((label,fn)=>{const b=k.el('button',null,label);b.onclick=fn;return b;}))('В Корзину…',()=>confirm('trash'));
   trash.classList.add('tidy-trash');
   const moveButton=k.el('button','tidy-move','В папку «Разобрано»…');moveButton.type='button';moveButton.onclick=()=>confirm('move');
   const show=k.el('button',null,finder());show.type='button';show.onclick=()=>call('reveal',d.scanId,[...chosen][0]||'').catch(e=>k.toast(e.message,{error:true}));
   bar.append(total,trash,moveButton,show);body.append(bar);
   function sync(){const picked=g.items.filter(i=>chosen.has(i.path)&&!i.removed);total.textContent='Выбрано: '+files(picked.length)+' · '+human(picked.reduce((a,i)=>a+i.bytes,0));trash.disabled=moveButton.disabled=!picked.length;}
   // The confirmation: the exact count and size, the only button that acts, and «Отмена».
   function confirm(kind){
    body.querySelector('.tidy-confirm')?.remove();
    const picked=g.items.filter(i=>chosen.has(i.path)&&!i.removed);if(!picked.length)return;
    const sum=human(picked.reduce((a,i)=>a+i.bytes,0));
    const box=k.el('div','tidy-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение');
    box.append(k.el('p',null,kind==='trash'?'Переместить '+files(picked.length)+' ('+sum+') в Корзину? Вернуть можно кнопкой «Вернуть» ниже или из Корзины.':'Переместить '+files(picked.length)+' ('+sum+') в папку «Загрузки/Разобрано»? Вернуть можно кнопкой «Вернуть» ниже.'));
    const go=k.el('button','primary',kind==='trash'?'В Корзину · '+sum:'Переместить · '+sum);go.type='button';
    const no=k.el('button',null,'Отмена');no.type='button';no.onclick=()=>box.remove();
    go.onclick=async()=>{go.disabled=no.disabled=true;go.setAttribute('aria-busy','true');
     try{const r=await call(kind,d.scanId,g.id,picked.map(i=>i.path));const done=kind==='trash'?r.removed:r.moved;
      for(const i of g.items)if(done.includes(i.path)){i.removed=true;chosen.delete(i.path);}
      k.toast(r.text,{error:!done.length});paint();onChange();}
     catch(e){k.toast(e.message,{error:true});go.disabled=no.disabled=false;}finally{go.removeAttribute('aria-busy');}};
    const actions=k.el('div','tidy-confirm-actions');actions.append(go,no);box.append(actions);body.append(box);go.focus();
   }
   sync();
  }
  paint();return row;
 }

 function undoList(k,d){
  const box=k.el('div','tidy-undo');box.hidden=true;
  const title=k.el('div','tidy-undo-title','Недавние действия');const list=k.el('ul','tidy-undo-list');box.append(title,list);
  const draw=items=>{
   list.replaceChildren();box.hidden=!items.length;
   for(const a of items.slice(0,5)){
    const li=k.el('li','tidy-undo-item'+(a.undone?' undone':''));
    const what=k.el('span','tidy-undo-what',(a.kind==='trash'?'В Корзину':'В «Разобрано»')+' · '+files(a.items.length)+' · '+human(a.items.reduce((s,i)=>s+(i.bytes||0),0)));
    const t=window.timeElement?window.timeElement(new Date(a.at)):k.el('span',null,when(a.at));t.classList?.add('tidy-muted');
    const group=k.el('span','tidy-muted',a.group||'');
    li.append(what,t);if(a.group&&a.kind==='trash')li.append(group);
    if(a.undone)li.append(k.el('span','tidy-undone','возвращено'));
    else{const back=k.el('button',null,'Вернуть');back.type='button';back.onclick=async()=>{back.disabled=true;try{const r=await call('undo',a.id);k.toast(r.text,{error:!r.back.length&&!r.manual});await refresh();}catch(e){k.toast(e.message,{error:true});back.disabled=false;}};li.append(back);}
    list.append(li);
   }
  };
  const refresh=()=>call('actions').then(draw).catch(()=>draw(d.undo||[]));
  draw(d.undo||[]);refresh();
  return {box,refresh};
 }

 window.renderTidyDownloads=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.tidy-card'))return;
  const body=k.el('div','tidy-body');
  const undo=undoList(k,d);
  if(d.groups.length){
   body.append(stacked(k,d));
   const rows=k.el('div','tidy-groups');const max=Math.max(1,...d.groups.map(g=>g.bytes));
   for(const g of d.groups)rows.append(groupRow(k,d,g,max,()=>undo.refresh()));
   body.append(rows);
  }else{
   body.append(stacked(k,d),k.el('p','tidy-muted','Ничего явно лишнего: нет дубликатов, установленных установщиков, распакованных архивов, старых больших файлов и скриншотов.'));
  }
  body.append(undo.box);
  const meta=[];
  const root=k.el('div','tidy-root',d.root);root.dataset.noI18n='';body.prepend(root);
  if(d.elapsedMs)meta.push('проверено за '+Math.max(1,Math.round(d.elapsedMs/1000))+' с');
  if(d.skipped)meta.push('закрытых файлов: '+d.skipped);
  meta.push('ничего не удаляется без подтверждения');
  const status=d.cancelled?{label:'остановлено',tone:'progress'}:d.partial?{label:'частично',tone:'progress'}:d.groups.length?{label:'есть что убрать',tone:'accent'}:{label:'порядок',tone:'done'};
  parent.append(k.card({app:'Уборка загрузок',initial:'⇣',color:'#4a6f8a',key:'Загрузки',status,subtitle:d.at?new Date(d.at).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'',body,meta,className:'tidy-card',
   actions:[{label:'Проверить снова',run:()=>k.ask('разбери загрузки',{send:true})},{label:'Открыть «Загрузки»',run:()=>call('reveal',d.scanId,d.root).catch(e=>k.toast(e.message,{error:true}))}]}));
 };
})();
