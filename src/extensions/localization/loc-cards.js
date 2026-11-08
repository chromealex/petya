// «Локализация», renderer: per-language progress bars (translated / total) with problem counters, a problem table
// filtered by kind, translations waiting for review and «Сохранить переводы» (writes new files via the app's ipc).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('loc-cards.css',document.currentScript.src).href;document.head.append(style);
 const KINDS=[['missing','Нет перевода'],['empty','Пустая строка'],['placeholders','Плейсхолдеры'],['identical','Как в исходнике'],['long','Слишком длинная']];
 const kindName=k=>KINDS.find(x=>x[0]===k)?.[1]||k;
 const loc=()=>window.petyaLocale||'ru-RU';
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.setAttribute('data-no-i18n','');return n;};
 const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
 const shownKey=key=>String(key).replace('\u0004',' · ');

 function langRow(k,r,select){
  const row=k.el('div','loc-lang');
  const head=k.el('div','loc-lang-head');
  const name=k.el('span','loc-lang-name',cap(r.name));head.append(name,raw(k,'code','loc-code',r.lang));
  const pct=r.total?Math.round(100*r.translated/r.total):100;
  head.append(k.el('span','loc-count',r.translated.toLocaleString(loc())+' / '+r.total.toLocaleString(loc())+' · '+pct+'%'));
  const bar=k.el('div','loc-bar');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(r.total));bar.setAttribute('aria-valuenow',String(r.translated));
  const ok=k.el('span','loc-bar-ok');ok.style.width=(r.total?100*(r.translated-r.placeholders-r.identical)/r.total:0)+'%';
  const warn=k.el('span','loc-bar-warn');warn.style.width=(r.total?100*(r.placeholders+r.identical)/r.total:0)+'%';warn.title='Переведено, но с проблемами';
  bar.append(ok,warn);
  const counters=k.el('div','loc-counters');
  for(const [kind,label] of KINDS)if(r[kind]){const b=k.el('button','loc-counter kind-'+kind,label+': '+r[kind]);b.type='button';b.dataset.kind=kind;b.dataset.lang=r.lang;b.onclick=()=>select(kind,r.lang);counters.append(b);}
  if(!counters.children.length)counters.append(k.el('span','loc-clean','Без замечаний'));
  row.append(head,bar,counters);return row;
 }

 window.renderLocalization=(parent,c)=>{
  const k=window.resultKit;if(!k||!c?.langs||parent.querySelector('.loc-card'))return;
  const body=k.el('div','loc-body');
  const sets=k.el('p','loc-sets');
  c.sets.forEach((x,i)=>{if(i)sets.append(k.el('span','muted',' · '));sets.append(raw(k,'b',null,x.name),' ',raw(k,'span','muted',x.format),k.el('span','muted',' · Ключей: '+x.keys.toLocaleString(loc())));});
  body.append(sets);
  // Problems table with filters by kind (and by language from the counters).
  let filter=c.filter||'',lang='',limit=12;
  const table=k.el('div','loc-problems'),chips=k.el('div','loc-filters');chips.setAttribute('role','group');chips.setAttribute('aria-label','Фильтр проблем');
  const counts=Object.fromEntries(KINDS.map(([kind])=>[kind,c.problems.filter(p=>p.kind===kind).length]));
  const paint=()=>{
   for(const b of chips.children)b.setAttribute('aria-pressed',String(b.dataset.kind===filter));
   const rows=c.problems.filter(p=>(!filter||p.kind===filter)&&(!lang||p.lang===lang));
   const shown=rows.slice(0,limit);
   const nodes=[];
   if(lang){const reset=k.el('button','loc-reset','Все языки');reset.type='button';reset.onclick=()=>{lang='';paint();};const note=k.el('small','kit-meta');note.append(k.el('span',null,'Язык: '),raw(k,'code',null,lang),' ',reset);nodes.push(note);}
   if(!rows.length)nodes.push(k.el('p','loc-empty','Проблем этого вида нет.'));
   else nodes.push(k.table([
    {label:'Ключ',value:p=>{const n=raw(k,'span','loc-key',shownKey(p.key));n.title=p.set+' · '+shownKey(p.key);return n;}},
    {label:'Язык',value:p=>raw(k,'code','loc-code',p.lang)},
    {label:'Проблема',value:p=>{const n=k.el('span','loc-kind kind-'+p.kind,kindName(p.kind));if(p.detail){n.append(k.el('small',null,p.detail));}return n;}},
    {label:'Исходник',value:p=>raw(k,'span','loc-text',p.source)},
    {label:'Сейчас',value:p=>p.current?raw(k,'span','loc-text',p.current):k.el('span','loc-text muted','—')}],shown));
   if(rows.length>shown.length){const more=k.el('button','loc-more','Показать ещё: '+(rows.length-shown.length));more.type='button';more.onclick=()=>{limit+=40;paint();};nodes.push(more);}
   table.replaceChildren(...nodes);
  };
  const all=k.el('button','loc-filter','Все: '+c.problems.length);all.type='button';all.dataset.kind='';all.onclick=()=>{filter='';limit=12;paint();};chips.append(all);
  for(const [kind,label] of KINDS)if(counts[kind]){const b=k.el('button','loc-filter kind-'+kind,label+': '+counts[kind]);b.type='button';b.dataset.kind=kind;b.onclick=()=>{filter=kind;limit=12;paint();};chips.append(b);}
  const select=(kind,l)=>{filter=kind;lang=l;limit=12;paint();table.scrollIntoView?.({block:'nearest',behavior:'smooth'});};
  const langs=k.el('div','loc-langs');
  for(const r of c.langs)langs.append(langRow(k,r,select));
  if(!c.langs.length)langs.append(k.el('p','loc-empty','Есть только исходный язык — сравнивать не с чем.'));
  body.append(langs);
  if(c.problems.length){body.append(chips,table);paint();}
  if(c.problemCount>c.problems.length)body.append(k.el('small','kit-meta','Показано проблем: '+c.problems.length+' из '+c.problemCount));
  // Translations waiting for review.
  const t=c.translation;let saveBox=null;
  if(t){
   const box=k.el('div','loc-translation');saveBox=box;
   box.append(k.el('h5','loc-h',t.saved?'Переводы сохранены':'Переводы на проверку: '+t.count));
   if(t.items?.length){const list=t.items.map(x=>{const row=k.el('div','loc-tr');const key=raw(k,'span','loc-key',shownKey(x.key));key.title=x.set;row.append(key,raw(k,'code','loc-code',x.lang),raw(k,'span','loc-text muted',x.source),raw(k,'span','loc-text',x.text));return row;});box.append(k.collapse(list,6,'Показать остальные переводы'));}
   if(t.failed?.length){const ul=k.el('ul','loc-failed');for(const f of t.failed){const li=k.el('li');li.append(raw(k,'span','loc-key',shownKey(f.key)),raw(k,'code','loc-code',f.lang),k.el('span',null,f.reason));ul.append(li);}
    box.append(k.el('small','kit-meta','Не удалось перевести: '+t.failedCount),k.el('small','kit-meta','Эти строки не будут записаны.'),ul);}
   const files=k.el('ul','loc-files');for(const f of t.files||[]){const li=k.el('li');li.append(raw(k,'span',null,f.path));files.append(li);}
   box.append(k.el('small','kit-meta',t.saved?'Записаны новые файлы:':'Будут созданы новые файлы (исходники не меняются):'),files);
   if(t.capped)box.append(k.el('small','kit-meta','Переведена только часть строк — попросите ещё раз для остальных.'));
   body.append(box);
  }
  const untranslated=c.langs.reduce((n,r)=>n+r.missing+r.empty,0);
  const actions=[];
  if(t?.id&&!t.saved&&window.petya?.feature)actions.push({label:'Сохранить переводы',primary:true,title:'Записать переводы в новые файлы рядом с исходниками',run:async btn=>{
   const r=await window.petya.feature('localizationApp','save',t.id);
   t.saved=true;t.files=r.files.map(p=>({path:p}));btn.hidden=true;
   saveBox.querySelector('.loc-h').textContent='Переводы сохранены';
   const files=saveBox.querySelector('.loc-files');files.replaceChildren(...r.files.map(p=>{const li=k.el('li');li.append(raw(k,'span',null,p));return li;}));
   files.previousElementSibling.textContent='Записаны новые файлы:';
   k.toast('Сохранено файлов: '+r.files.length);}});
  if(untranslated&&!(t?.id&&!t.saved))actions.push({label:'Перевести недостающие',primary:!t,title:'Локальная модель переведёт пустые и недостающие строки; запись — только после «Сохранить переводы»',
   run:()=>k.ask(c.only?.length?'Переведи недостающие строки локализации на '+c.only.join(', '):'Переведи недостающие строки локализации',{send:true})});
  if(counts.placeholders)actions.push({label:'Показать проблемы с плейсхолдерами',run:()=>{filter='placeholders';lang='';limit=12;paint();table.scrollIntoView?.({block:'nearest',behavior:'smooth'});}});
  const status=c.problemCount?{label:'Проблем: '+c.problemCount.toLocaleString(loc()),tone:c.langs.some(r=>r.placeholders||r.missing)?'alert':'progress'}:{label:'Всё переведено',tone:'done'};
  const card=k.card({app:'Локализация',initial:'Aa',color:'#3f5f7a',key:c.sets.length>2?c.sets.slice(0,2).map(x=>x.name).join(', ')+' +'+(c.sets.length-2):c.sets.map(x=>x.name).join(', '),status,subtitle:'Исходный язык: '+c.source,body,actions,className:'loc-card'});
  card.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  parent.append(card);
 };
})();
