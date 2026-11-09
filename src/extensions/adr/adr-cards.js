// «Архитектурные решения», renderer. Three cards:
// - draft: the exact file (folder, path, full Markdown in an editor), a strip of the four sections that fills as they
//   get content, the sources and similar decisions; «Сохранить в проект» writes exactly the editor's text to that path
//   through the app's IPC; Google Docs through the `document-export` link; Confluence only when connected.
// - search / list: all decisions of docs/adr as a strip by number (found ones lit, colour by status) and the found
//   ones with the sentence that matched.
// - check: the statement, the verdict and each related decision with its quote — marked when it is verbatim.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('adr-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const pad=n=>String(n).padStart(4,'0');
 const day=ymd=>{const d=new Date(String(ymd)+'T12:00:00');return isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'});};
 const call=(method,...args)=>window.petya.feature('adr',method,...args);
 const STATUS={accepted:['принято','done'],proposed:['предложено','progress'],superseded:['заменено','alert'],rejected:['отклонено','alert'],other:['другой статус',''],'':['без статуса','']};
 const statusChip=(k,st)=>{const [label,tone]=STATUS[st]||STATUS.other;return k.chip({label,tone});};
 const SECTIONS=[['context','Контекст',/^##\s+(?:Контекст|Context)/im],['decision','Решение',/^##\s+(?:Решение|Decision)/im],['alternatives','Альтернативы',/^##\s+(?:Альтернативы|Considered Options|Alternatives)/im],['consequences','Последствия',/^##\s+(?:Последствия|Consequences)/im]];
 // Whether a section of the Markdown has content (not empty, not a lone dash).
 function filled(text,re){
  const m=re.exec(text);if(!m)return false;
  const rest=text.slice(m.index+m[0].length);const next=rest.search(/^##\s/m);
  const body=(next<0?rest:rest.slice(0,next)).replace(/^[\s\-–—*]+$/gm,'').trim();
  return body.length>0;
 }

 function draftCard(k,c){
  const body=k.el('div','adr-body');
  const file=k.el('div','adr-file');
  file.append(k.el('span','adr-file-label','Новый файл'),raw(k.el('span','adr-folder',c.folder.name+'/')),raw(k.el('code','adr-path selectable',c.path)));
  file.title=c.folder.path+'/'+c.path;
  body.append(file);
  const strip=k.el('div','adr-strip');const cells={};
  for(const [id,label] of SECTIONS){const cell=k.el('span','adr-cell');cell.append(k.el('i'),k.el('span',null,label));cells[id]=cell;strip.append(cell);}
  body.append(strip);
  const area=document.createElement('textarea');area.className='adr-text';area.value=c.text;area.rows=Math.min(24,Math.max(12,c.text.split('\n').length+1));area.spellcheck=false;area.setAttribute('aria-label','Текст файла '+c.path);
  const paint=()=>{for(const [id,,re] of SECTIONS)cells[id].classList.toggle('on',filled(area.value,re));};
  area.addEventListener('input',paint);paint();
  body.append(area);
  if(c.sources?.length){
   const box=k.el('div','adr-sources');box.append(k.el('div','adr-head','Откуда взят контекст'));
   for(const x of c.sources){const row=k.el('div','adr-source');row.append(k.chip({label:x.kind==='chat'?'чат':x.kind==='meeting'?'встреча':'поиск по смыслу'}),raw(k.el('span','adr-source-label',x.label)),raw(k.el('span','adr-source-text',x.text)));box.append(row);}
   body.append(box);
  }
  if(c.related?.length){
   const box=k.el('div','adr-related');box.append(k.el('div','adr-head','Похожие решения'));
   for(const r of c.related){const row=k.el('div','adr-rel');row.append(raw(k.el('span','adr-num',pad(r.number))),raw(k.el('span','adr-rel-title',r.title)),statusChip(k,r.status));box.append(row);}
   body.append(box);
  }
  const status=k.chip({label:'черновик',tone:'progress'});
  let saved=false;
  const markSaved=()=>{saved=true;status.textContent=window.t?window.t('сохранено'):'сохранено';status.className='kit-chip tone-done';area.readOnly=true;save.disabled=true;save.textContent=window.t?window.t('Сохранено в проект'):'Сохранено в проект';};
  const save=k.el('button','primary','Сохранить в проект');save.type='button';save.title='Запишет ровно этот текст в '+c.path;
  save.onclick=async e=>{e.stopPropagation();if(saved)return;save.disabled=true;
   try{const r=await call('save',c.draftId,area.value);markSaved();k.toast(r?.text||'Сохранено');}
   catch(err){save.disabled=false;k.toast(err.message,{error:true});}};
  const actions=[save,k.links('document-export',()=>({title:pad(c.number)+'. '+c.title,text:area.value,app:'Архитектурные решения'}))];
  if(c.confluence){
   const conf=k.el('button',null,'Создать страницу в Confluence');conf.type='button';conf.title='Пространство '+c.confluence+': страница с этим текстом';
   conf.onclick=async e=>{e.stopPropagation();conf.disabled=true;
    try{const r=await call('confluence',c.draftId,area.value);k.toast(r?.text||'Страница создана',r?.url?{action:{label:'Открыть',run:()=>window.openChatBrowser?window.openChatBrowser(r.url):window.open(r.url,'_blank')}}:{});conf.textContent=window.t?window.t('Страница в Confluence создана'):'Страница в Confluence создана';}
    catch(err){conf.disabled=false;k.toast(err.message,{error:true});}};
   actions.push(conf);
  }
  const card=k.card({app:'Архитектурные решения',initial:'А',color:'#3f6b6a',status,subtitle:day(c.date),title:pad(c.number)+'. '+c.title,body,className:'adr-card adr-draft',
   meta:[c.by==='model'?'черновик — локальная модель, по источникам':'черновик по вашим словам и источникам',c.existing?'решений в проекте: '+c.existing:'первое решение проекта'],actions});
  card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  call('state',c.draftId).then(r=>{if(r?.state==='saved')markSaved();}).catch(()=>{});
  return card;
 }

 function strip(k,c){
  const box=k.el('div','adr-line');
  const found=new Set(c.found.map(r=>r.number));
  const all=c.all||[];
  for(const r of all){
   const tick=k.el('span','adr-tick st-'+(r.status||'none')+(found.has(r.number)?' found':''));
   tick.title=pad(r.number)+' · '+r.title+(r.date?' · '+day(r.date):'');
   if(found.has(r.number)&&all.length<=24)tick.textContent=String(r.number);
   box.append(tick);
  }
  const legend=k.el('div','adr-legend');
  legend.append(k.el('span',null,'Все решения по номерам: '+all.length),k.el('span','adr-legend-found','найдены: '+c.found.length));
  const wrap=k.el('div','adr-timeline');wrap.append(box,legend);
  return wrap;
 }
 function searchCard(k,c){
  const body=k.el('div','adr-body');
  body.append(strip(k,c));
  const list=k.el('div','adr-list');
  if(!c.found.length)list.append(k.el('p','adr-empty','Ничего не нашлось.'));
  for(const r of c.found){
   const row=k.el('article','adr-item');
   const head=k.el('div','adr-item-head');
   head.append(raw(k.el('span','adr-num',pad(r.number))),raw(k.el('span','adr-item-title',r.title)),statusChip(k,r.status));
   if(r.byMeaning)head.append(k.chip({label:'по смыслу'}));
   row.append(head);
   if(r.excerpt)row.append(raw(k.el('p','adr-excerpt selectable',r.excerpt)));
   const meta=k.el('div','adr-item-meta');meta.append(raw(k.el('code','adr-path selectable',r.path)));if(r.date)meta.append(k.el('span',null,day(r.date)));
   row.append(meta);list.append(row);
  }
  body.append(list);
  const card=k.card({app:'Архитектурные решения',initial:'А',color:'#3f6b6a',status:{label:c.mode==='list'?'список':'поиск',tone:''},subtitle:c.folder.name+'/docs/adr',
   title:c.mode==='list'?'Решения проекта':'«'+c.query+'»',body,className:'adr-card adr-search',
   actions:[{label:'Записать новое решение',run:()=>k.ask('Запиши решение: ')}]});
  if(c.mode!=='list')card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  return card;
 }

 const VERDICT={contradicts:['противоречит','alert','Похоже, противоречит принятому решению'],consistent:['согласуется','done','Не противоречит принятым решениям'],unrelated:['не связано','','Найденные решения — о другом'],unclear:['сравните сами','progress','Нет дословного основания для вывода — сравните сами'],none:['нет решений','','Связанных решений нет']};
 function checkCard(k,c){
  const body=k.el('div','adr-body');
  const subject=k.el('blockquote','adr-subject selectable');subject.append(raw(k.el('span',null,c.subject)));body.append(subject);
  const [label,tone,text]=VERDICT[c.verdict]||VERDICT.unclear;
  const banner=k.el('div','adr-verdict tone-'+(tone||'none'));banner.append(k.el('b',null,text));body.append(banner);
  for(const i of c.items){
   const row=k.el('article','adr-item');
   const head=k.el('div','adr-item-head');
   head.append(raw(k.el('span','adr-num',pad(i.number))),raw(k.el('span','adr-item-title',i.title)),statusChip(k,i.status));
   const [vl,vt]=VERDICT[i.verdict]||VERDICT.unclear;head.append(k.chip({label:vl,tone:vt}));
   row.append(head);
   const quote=k.el('blockquote','selectable adr-quote'+(i.verified?' verified':''));quote.append(raw(k.el('span',null,i.quote)));row.append(quote);
   row.append(k.el('small','adr-quote-note',i.verified?'дословно из решения':'текст решения — сравните сами'));
   if(i.explanation)row.append(raw(k.el('p','adr-excerpt selectable',i.explanation)));
   row.append(raw(k.el('code','adr-path selectable',i.path)));
   body.append(row);
  }
  return k.card({app:'Архитектурные решения',initial:'А',color:'#3f6b6a',status:{label,tone},subtitle:c.folder?.name?c.folder.name+'/docs/adr':'',title:'Проверка на противоречия',body,className:'adr-card adr-check',
   meta:[c.by==='model'?'вывод модели засчитан только с дословной цитатой':'без вывода модели'],
   actions:c.subject?[{label:'Записать как новое решение',run:()=>k.ask('Запиши решение: '+c.subject)}]:[]});
 }

 window.renderAdrCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.adr-card'))return;
  parent.append(c.mode==='draft'?draftCard(k,c):c.mode==='check'?checkCard(k,c):searchCard(k,c));
 };
})();
