// «Договоры в PDF», renderer. A read contract: a strip of its pages (text layer, OCR, unread scans; marks where
// terms were found), the deadlines on a time axis with «Напомнить» (cross-app kind `reminder`), and every term with
// its verbatim quote, page and clause; «Показать на странице» opens the page text with the quote marked. Two versions:
// a map of clauses by status, the changed terms (was → now) and each changed clause as a word diff. Contract text is
// content: marked data-no-i18n and selectable; never HTML.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('contract-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const english=()=>!!window.petyaLanguage&&window.petyaLanguage!=='ru';
 const plural=(n,[a,b,c])=>{if(english())return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const tt=v=>window.t?window.t(v):v;
 const feature=(method,...args)=>window.petya.feature('pdfContracts',method,...args);
 const day=d=>{const [y,m,dd]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,dd));};
 const dateText=d=>day(d).toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 const KIND_ORDER=['parties','number','price','payment','term','renewal','termination','penalty','ip'];
 const norm=s=>String(s||'').replace(/[«»“”„"]/g,'"').replace(/[‐‑‒–—―−-]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ').trim().toLowerCase();

 function pageStrip(k,c,show){
  const strip=k.el('div','pc-pages');strip.setAttribute('role','list');
  const count={};for(const f of c.fields)count[f.page]=(count[f.page]||0)+1;
  const unread=new Set(c.doc.ocr?.unread||[]),ocr=new Set(c.doc.ocr?.pages||[]);
  const n=Math.min(c.doc.numPages||0,80);
  for(let p=1;p<=n;p++){
   const cell=k.el('button','pc-page'+(unread.has(p)?' unread':ocr.has(p)?' ocr':''));cell.type='button';cell.dataset.page=String(p);cell.setAttribute('role','listitem');
   cell.append(raw(k.el('span','pc-page-n',String(p))));
   if(count[p]){const dot=raw(k.el('span','pc-page-dot',String(count[p])));cell.append(dot);}
   cell.title=(english()?'Page ':'Стр. ')+p+' · '+(unread.has(p)?tt('скан без текста, не прочитан'):ocr.has(p)?tt('распознан OCR'):tt('текстовый слой'))+(count[p]?' · '+count[p]+' '+plural(count[p],['условие','условия','условий']):'');
   if(!unread.has(p))cell.onclick=()=>show(p,null);else cell.disabled=true;
   strip.append(cell);
  }
  const legend=k.el('div','pc-legend');
  const item=(cls,text)=>{const s=k.el('span','pc-key');s.append(k.el('i',cls),k.el('span',null,text));legend.append(s);};
  item('k-text','текст');if(ocr.size)item('k-ocr','OCR');if(unread.size)item('k-unread','скан не прочитан');
  const box=k.el('div','pc-strip');box.append(strip,legend);return box;
 }

 function timeline(k,c){
  const list=c.deadlines||[];if(!list.length)return null;
  const box=k.el('div','pc-deadlines');box.append(k.el('div','pc-section','Сроки'));
  const today=c.today||new Date().toISOString().slice(0,10);
  const all=[today,...list.map(d=>d.date)].sort();const t0=day(all[0]).getTime(),t1=Math.max(t0+86400000,day(all[all.length-1]).getTime());
  const axis=k.el('div','pc-axis');const pos=d=>((day(d).getTime()-t0)/(t1-t0)*100).toFixed(2)+'%';
  const now=k.el('span','pc-today');now.style.left=pos(today);now.title=tt('Сегодня');axis.append(now);
  list.forEach((d,i)=>{const dot=k.el('span','pc-dot'+(d.date<today?' past':''));dot.style.left=pos(d.date);dot.dataset.i=String(i+1);dot.title=dateText(d.date)+' — '+tt(d.label);axis.append(dot);});
  box.append(axis);
  const rows=k.el('ol','pc-deadline-list');
  list.forEach((d,i)=>{
   const li=k.el('li','pc-deadline'+(d.date<today?' past':''));li.dataset.date=d.date;
   li.append(k.el('span','pc-num',String(i+1)),raw(k.el('b','pc-date',(d.approx?'≈ ':'')+dateText(d.date))),k.el('span','pc-what',d.label),raw(k.el('span','pc-ref',(english()?'p. ':'стр. ')+d.page)));
   if(d.date>=today)li.append(k.links('reminder',{date:d.date,text:(c.doc.name?'договор «'+c.doc.name.replace(/\.pdf$/i,'')+'»: ':'')+d.label.toLowerCase()+' (стр. '+d.page+')'},{label:'Напомнить',className:'pc-remind'}));
   rows.append(li);
  });
  box.append(rows);
  return box;
 }

 function fieldsBlock(k,c,show){
  const box=k.el('div','pc-fields');
  const kinds=KIND_ORDER.filter(x=>c.fields.some(f=>f.kind===x));
  const focus=new Set(c.focus||[]);
  for(const kind of kinds){
   const group=k.el('section','pc-group'+(focus.size&&(focus.has(kind)||focus.has('term')&&kind==='renewal')?' focus':''));group.dataset.kind=kind;
   const list=c.fields.filter(f=>f.kind===kind);
   group.append(k.el('div','pc-section',list[0].label));
   for(const f of list){
    const row=k.el('div','pc-field');
    if(f.value)row.append(raw(k.el('div','pc-value',f.value)));
    const q=raw(k.el('blockquote','pc-quote selectable',f.quote));row.append(q);
    const meta=k.el('div','pc-meta');
    meta.append(raw(k.el('span','pc-ref',(english()?'p. ':'стр. ')+f.page+(f.clause&&f.clause!=='0'?' · '+(english()?'cl. ':'п. ')+f.clause:''))),k.el('span','pc-ok','✓ цитата найдена в тексте'));
    if(f.by==='model')meta.append(k.el('span','pc-model','нашла модель'));
    const b=k.el('button','pc-show','Показать на странице');b.type='button';b.onclick=()=>show(f.page,f.quote);meta.append(b);
    row.append(meta);group.append(row);
   }
   box.append(group);
  }
  return box;
 }

 // The page text in place, the quoted lines marked.
 function pageView(k,c,holder){
  return async(n,quote)=>{
   const p=await feature('page',c.doc.id,n);
   const view=k.el('div','pc-pageview');
   const head=k.el('div','pc-pageview-head');head.append(k.el('b',null,(english()?'Page ':'Страница ')+p.n),p.ocr?k.el('span','pc-model','OCR'):'');
   const close=k.el('button',null,'Скрыть');close.type='button';close.onclick=()=>holder.replaceChildren();head.append(close);
   const body=raw(k.el('div','pc-pagetext selectable'));
   const q=norm(quote);let hit=null;
   // A line is marked when it belongs to the quote (the quote may span lines).
   p.lines.forEach((line,i)=>{const l=k.el('div','pc-line',line);const nl=norm(line);if(q&&nl.length>6&&(q.includes(nl)||nl.includes(q.slice(0,40)))){l.classList.add('hit');hit=hit||l;}body.append(l);});
   view.append(head,body);holder.replaceChildren(view);
   if(hit)hit.scrollIntoView?.({block:'nearest'});
  };
 }

 function renderAnalyze(parent,c){
  const k=window.resultKit;
  const body=k.el('div','pc-body');
  const holder=k.el('div','pc-holder');
  const show=pageView(k,c,holder);
  body.append(pageStrip(k,c,show),holder);
  const tl=timeline(k,c);if(tl)body.append(tl);
  if(c.fields.length)body.append(fieldsBlock(k,c,show));
  else body.append(k.el('p','pc-note','Условий, которые Петя ищет, в тексте не нашлось.'));
  const notes=[];
  if(c.doc.ocr?.unread?.length)notes.push([(english()?'Pages ':'Страницы ')+c.doc.ocr.unread.join(', ')+' — ',c.doc.ocr.tool?'сканы, распознать не удалось.':'сканы без текста; локального OCR нет (например, Tesseract) — их условия не разобраны.']);
  if(c.doc.ocr?.pages?.length)notes.push([(english()?'Pages ':'Страницы ')+c.doc.ocr.pages.join(', ')+' — ','распознаны OCR: сверяйте цитаты со сканом.']);
  if(c.doc.fromText)notes.push(['','Файл прикреплён без пути на диске — разобран текст, прочитанный при прикреплении.']);
  if(c.rejected)notes.push([String(c.rejected)+' ',plural(c.rejected,['цитата не нашлась в тексте договора и не показана.','цитаты не нашлись в тексте договора и не показаны.','цитат не нашлись в тексте договора и не показаны.'])]);
  for(const [a,b] of notes){const p=k.el('p','pc-note');if(a)p.append(raw(k.el('span',null,a)));p.append(k.el('span',null,b));body.append(p);}
  const terms=c.fields.filter(f=>f.kind!=='number').length;
  const status=c.doc.ocr?.unread?.length?{label:'есть нечитаемые страницы',tone:'progress'}:{label:terms+' '+plural(terms,['условие','условия','условий']),tone:terms?'done':'progress'};
  const subtitle=c.doc.numPages+' '+plural(c.doc.numPages,['страница','страницы','страниц'])+(c.clauses?' · '+c.clauses+' '+plural(c.clauses,['пункт','пункта','пунктов']):'');
  const card=k.card({app:'Договоры в PDF',initial:'Д',color:'#7a6a3c',key:c.doc.name||tt('Договор'),status,subtitle,body,
   actions:[{label:'Сравнить с прошлой версией',run:()=>k.ask('Сравни с прошлой версией договора')}],className:'contract-card'});
  card.dataset.mode='analyze';card.dataset.card=c.id;
  const key=card.querySelector('.kit-key');if(key)raw(key);
  const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  card.append(k.el('p','pc-disclaimer','Это не юридическая консультация: Петя находит и цитирует условия, но не оценивает их.'));
  parent.append(card);
 }

 function renderCompare(parent,c,before){
  const k=window.resultKit;
  const body=k.el('div','pc-body');
  const map=k.el('div','pc-map');map.setAttribute('role','img');
  for(const r of c.rows){const seg=k.el('span','pc-seg '+r.status);seg.title=(r.new?.num||r.old?.num||'')+' · '+tt({same:'без изменений',changed:'изменён',added:'добавлен',removed:'удалён',moved:'перенумерован'}[r.status]);map.append(seg);}
  map.setAttribute('aria-label',tt('Карта пунктов договора'));
  body.append(map);
  const legend=k.el('div','pc-legend');
  for(const [s,l] of [['changed','изменён'],['added','добавлен'],['removed','удалён'],['moved','перенумерован'],['same','без изменений']])if(c.counts[s]){const x=k.el('span','pc-key');x.append(k.el('i','k-'+s),k.el('span',null,l),raw(k.el('b',null,' '+c.counts[s])));legend.append(x);}
  body.append(legend);
  if(c.fieldChanges?.length){
   const t=k.el('table','pc-terms');const head=k.el('tr');for(const h of ['Условие','Было','Стало'])head.append(k.el('th',null,h));
   const thead=k.el('thead');thead.append(head);const tbody=k.el('tbody');
   for(const x of c.fieldChanges){const tr=k.el('tr');tr.dataset.kind=x.kind;tr.append(k.el('td','pc-term',x.label),raw(k.el('td','pc-was',x.old||'—')),raw(k.el('td','pc-now',x.new||'—')));tbody.append(tr);}
   t.append(thead,tbody);body.append(t);
  }
  const list=k.el('div','pc-diffs');
  for(const r of c.rows.filter(x=>x.status!=='same')){
   const item=k.el('div','pc-diff '+r.status);item.dataset.status=r.status;
   const head=k.el('div','pc-diff-head');
   const num=r.status==='moved'?r.old.num+' → '+r.new.num:(r.new||r.old).num;
   head.append(raw(k.el('b','pc-diff-num',num?(english()?'Cl. ':'п. ')+num:'')),k.chip({label:{changed:'изменён',added:'добавлен',removed:'удалён',moved:'перенумерован'}[r.status],tone:r.status==='added'?'done':r.status==='removed'?'alert':'progress'}));
   const sec=(r.new||r.old).title;if(sec)head.append(raw(k.el('span','pc-diff-sec',sec)));
   head.append(raw(k.el('span','pc-ref',(english()?'p. ':'стр. ')+(r.new||r.old).page)));
   item.append(head);
   const text=raw(k.el('div','pc-diff-text selectable'));
   if(r.ops){r.ops.forEach((o,i)=>{if(i)text.append(document.createTextNode(' '));text.append(o.t==='='?document.createTextNode(o.s):k.el(o.t==='-'?'del':'ins',null,o.s));});}
   else text.append(r.status==='removed'?k.el('del',null,r.old.text):r.status==='added'?k.el('ins',null,r.new.text):document.createTextNode(r.new.text));
   item.append(text);list.append(item);
  }
  if(c.counts.same)list.append(k.el('p','pc-note',(english()?'':'')+c.counts.same+' '+plural(c.counts.same,['пункт без изменений','пункта без изменений','пунктов без изменений'])));
  body.append(list);
  const unread=[...(c.unread?.old||[]),...(c.unread?.new||[])];
  if(unread.length)body.append(k.el('p','pc-note','В версиях есть нечитаемые сканы — пункты с них не сравнивались.'));
  const changed=c.counts.changed+c.counts.added+c.counts.removed;
  const card=k.card({app:'Договоры в PDF',initial:'Д',color:'#7a6a3c',key:c.old.name+' → '+c.new.name,status:{label:changed?changed+' '+plural(changed,['изменение','изменения','изменений']):'без изменений',tone:changed?'progress':'done'},
   subtitle:tt('старая → новая'),body,actions:[{label:'Поменять местами',run:async()=>{const next=await feature('swap',c.id);const holder=document.createElement('div');card.replaceWith(holder);renderCompare(holder.parentNode,next,holder);holder.remove();}}],className:'contract-card'});
  card.dataset.mode='compare';card.dataset.card=c.id;
  const key=card.querySelector('.kit-key');if(key)raw(key);
  card.append(k.el('p','pc-disclaimer','Это не юридическая консультация: Петя находит и цитирует условия, но не оценивает их.'));
  if(before)parent.insertBefore(card,before);else parent.append(card);
 }
 window.renderContractCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.id||parent.querySelector('.contract-card'))return;
  if(c.mode==='compare')renderCompare(parent,c);else renderAnalyze(parent,c);
 };
})();
