// «Google Таблицы», renderer. Modes: `sheet` — tab chips, a filter, the table with a sticky header row and first
// column, numbers right-aligned with in-cell bars; `find` — matches by tab with their row; `append` — the last rows
// and the new one, «Добавить строку»; `export` — a preview of another card's table, the destination (new spreadsheet,
// new tab, existing tab with the exact cell diff) and «Выгрузить». Writes go through the app's ipc on a button press.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('sheets-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('googleSheets',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const letters=n=>{let s='';n=Math.floor(n);do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;};
 const open=url=>{if(typeof window.openChatBrowser==='function')window.openChatBrowser(url);else window.open(url,'_blank','noopener');};
 const shown=v=>typeof v==='number'?v.toLocaleString(locale(),{maximumFractionDigits:6}):v===true?'TRUE':v===false?'FALSE':String(v??'');
 const badge={app:'Google Таблицы',initial:'▦',color:'#2e7d57'};

 // --- The table: header row, sticky first column, numbers right-aligned with a bar of |value| / column max ---------
 function grid(k,d,filter){
  const wrap=k.el('div','gs-grid');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица');
  const t=k.el('table','gs-table');raw(t);
  const width=d.text[0]?.length||0,head=d.header;
  const thead=k.el('thead'),hr=k.el('tr');
  for(let c=0;c<width;c++){const th=k.el('th',d.numeric[c]?'num':'',head>=0?(d.text[head][c]||letters(c)):letters(c));th.title=letters(c);if(c===0)th.classList.add('gs-first');hr.append(th);}
  thead.append(hr);
  const max=[];for(let c=0;c<width;c++){let m=0;for(let r=head+1;r<d.text.length;r++){const n=d.numbers[r]?.[c];if(typeof n==='number')m=Math.max(m,Math.abs(n));}max.push(m);}
  const tbody=k.el('tbody');let count=0;
  const q=String(filter||'').trim().toLocaleLowerCase();
  for(let r=head+1;r<d.text.length;r++){
   if(q&&!d.text[r].some(v=>String(v).toLocaleLowerCase().includes(q)))continue;
   count++;
   const tr=k.el('tr');tr.title='Строка '+(r+1);
   for(let c=0;c<width;c++){
    const v=d.text[r][c]||'',n=d.numbers[r]?.[c];
    const td=k.el('td',(typeof n==='number'&&d.numeric[c]?'num':'')+(c===0?' gs-first':''));
    if(typeof n==='number'&&d.numeric[c]&&max[c]>0){const bar=k.el('span','gs-bar'+(n<0?' neg':''));bar.style.width='calc((100% - 20px) * '+Math.max(0.03,Math.abs(n)/max[c]).toFixed(3)+')';td.append(bar);}
    td.append(k.el('span','gs-v',v));td.title=letters(c)+(r+1)+(v?': '+v:'');tr.append(td);
   }
   tbody.append(tr);
  }
  t.append(thead,tbody);wrap.append(t);
  if(!count)wrap.append(k.el('p','gs-empty',q?'Ничего не найдено.':'На листе нет данных.'));
  return {node:wrap,count,total:Math.max(0,d.text.length-head-1)};
 }

 function sheetBody(k,c){
  const body=k.el('div','gs-body');
  let data=c,filter='';
  const tabs=k.el('div','gs-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Листы');
  const bar=k.el('div','gs-tools');
  const input=k.el('input','gs-filter');input.type='search';input.placeholder='Фильтр по строкам';input.setAttribute('aria-label','Фильтр по строкам');
  const count=k.el('small','gs-count');bar.append(input,count);
  const holder=k.el('div','gs-holder');
  const note=k.el('small','kit-meta');
  const paint=()=>{const g=grid(k,data,filter);holder.replaceChildren(g.node);count.textContent=(filter?g.count+' из '+g.total:g.total)+' '+plural(g.total,['строка','строки','строк']);
   note.textContent=data.truncated?'Показаны первые 200 строк и 30 столбцов — остальное в Google Таблицах.':'';note.hidden=!data.truncated;
   for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.title===data.sheet.title));};
  for(const t of c.tabs||[]){
   const b=k.chip({label:t.title,onClick:async()=>{
    if(t.title===data.sheet.title)return;
    b.setAttribute('aria-busy','true');
    try{data={...data,...await call('sheet',c.spreadsheetId,t.title)};filter='';input.value='';paint();body.dispatchEvent(new CustomEvent('gs-sheet',{detail:data}));}
    catch(e){k.toast(e.message,{error:true});}finally{b.removeAttribute('aria-busy');}
   }});
   b.dataset.title=t.title;b.setAttribute('role','tab');raw(b);tabs.append(b);
  }
  input.oninput=()=>{filter=input.value;paint();};
  if((c.tabs||[]).length>1)body.append(tabs);
  body.append(bar,holder,note);paint();
  return {body,current:()=>data};
 }

 function findBody(k,c){
  const body=k.el('div','gs-body');
  if(!c.matches?.length){body.append(k.el('p','gs-empty','Совпадений нет.'));return body;}
  const by=new Map();for(const m of c.matches){if(!by.has(m.sheet))by.set(m.sheet,[]);by.get(m.sheet).push(m);}
  const max=Math.max(...[...by.values()].map(x=>x.length));
  const summary=k.el('div','gs-find-sum');
  for(const [sheet,list] of by){const row=k.el('div','gs-find-tab');const name=raw(k.el('span',null,sheet));const track=k.el('span','gs-find-track');const fill=k.el('span');fill.style.width=Math.max(4,list.length/max*100)+'%';track.append(fill);row.append(name,track,k.el('strong',null,String(list.length)));summary.append(row);}
  body.append(summary);
  const items=c.matches.map(m=>{
   const li=k.el('div','gs-match');
   const where=k.el('button','gs-cell',m.sheet+' · '+m.cell);where.type='button';raw(where);where.title='Открыть лист';where.onclick=()=>open(c.url+'#gid='+m.gid+'&range='+m.cell);
   const value=raw(k.el('strong','gs-match-value',m.value));
   const fields=raw(k.el('small','gs-match-row',m.fields.filter(f=>f.value!==m.value).map(f=>(f.label?f.label+': ':'')+f.value).join(' · ')));
   li.append(where,value,fields);return li;
  });
  body.append(k.collapse(items,8));
  return body;
 }

 function appendBody(k,c){
  const body=k.el('div','gs-body');
  const t=k.el('table','gs-table gs-append');raw(t);
  const width=Math.max(c.labels.length,c.row.length);
  const hr=k.el('tr');for(let i=0;i<width;i++)hr.append(k.el('th',c.numeric?.[i]?'num':'',c.labels[i]||letters(i)));
  const thead=k.el('thead');thead.append(hr);const tbody=k.el('tbody');
  for(const r of c.last||[]){const tr=k.el('tr','gs-old');for(let i=0;i<width;i++)tr.append(k.el('td',c.numeric?.[i]?'num':'',r[i]||''));tbody.append(tr);}
  const tr=k.el('tr','gs-new');for(let i=0;i<width;i++)tr.append(k.el('td',typeof c.row[i]==='number'?'num':'',shown(c.row[i])||'—'));tbody.append(tr);
  t.append(thead,tbody);const wrap=k.el('div','gs-grid short');wrap.append(t);body.append(wrap);
  body.append(k.el('small','kit-meta','Новая строка добавится после последней заполненной, остальные ячейки не меняются.'));
  return body;
 }

 // Destination of an export: a new spreadsheet, a new tab or an existing tab of a known (or pasted) spreadsheet.
 function exportBody(k,c,state){
  const body=k.el('div','gs-body');
  const rows=[...(c.header?.some(Boolean)?[c.header]:[]),...c.rows];
  const data={text:rows.map(r=>r.map(shown)),numbers:rows.map(r=>r.map(v=>typeof v==='number'?v:null)),header:c.header?.some(Boolean)?0:-1};
  data.numeric=(rows[0]||[]).map((_,i)=>rows.slice(data.header+1).filter(r=>r[i]!==''&&r[i]!==null).every(r=>typeof r[i]==='number'));
  const preview={...data,text:data.text.slice(0,data.header+6),numbers:data.numbers.slice(0,data.header+6)};
  body.append(grid(k,preview,'').node);
  if(c.rows.length>5)body.append(k.el('small','kit-meta','И ещё '+(c.rows.length-5)+' '+plural(c.rows.length-5,['строка','строки','строк'])+(c.truncated?' (выгружу первые '+c.rows.length+' из '+c.total+')':'')+'.'));
  if(c.done){const p=k.el('p','gs-done');p.append(k.el('span',null,'Выгружено: '),raw(k.el('strong',null,c.done.sheet||'')));body.append(p);return body;}
  const form=k.el('fieldset','gs-dest');form.append(k.el('legend',null,'Куда выгрузить'));
  const kinds=[...c.canCreate?[['new','Новая таблица']]:[],['tab','Новый лист в таблице'],['existing','Существующий лист']];
  const radios=k.el('div','gs-kinds');
  for(const [value,label] of kinds){const l=k.el('label','gs-kind');const r=k.el('input');r.type='radio';r.name='gs-kind-'+c.draftId;r.value=value;r.checked=state.kind===value;r.onchange=()=>{state.kind=value;state.preview=null;sync();};l.append(r,k.el('span',null,label));radios.append(l);}
  const book=k.el('select','gs-book');book.setAttribute('aria-label','Таблица');
  for(const x of c.known||[]){const o=k.el('option',null,x.title);o.value=x.id;raw(o);book.append(o);}
  const other=k.el('option',null,'Другая — по ссылке…');other.value='';book.append(other);
  const link=k.el('input','gs-link');link.type='url';link.placeholder='https://docs.google.com/spreadsheets/d/…';link.setAttribute('aria-label','Ссылка на таблицу');
  const tabName=k.el('input','gs-tabname');tabName.type='text';tabName.value=c.sheetName||c.title;tabName.maxLength=100;tabName.setAttribute('aria-label','Название нового листа');
  const tabPick=k.el('select','gs-tabpick');tabPick.setAttribute('aria-label','Лист');
  const diff=k.el('div','gs-diff');
  const where=k.el('div','gs-where');where.append(book,link,tabName,tabPick);
  form.append(radios,where,diff);body.append(form);
  const fillTabs=()=>{tabPick.replaceChildren();const x=(c.known||[]).find(i=>i.id===book.value);for(const t of x?.sheets||[]){const o=k.el('option',null,t);o.value=t;raw(o);tabPick.append(o);}};
  function sync(){
   const fromLink=book.value==='';
   book.hidden=state.kind==='new';link.hidden=state.kind==='new'||!fromLink;
   tabName.hidden=state.kind!=='tab';tabPick.hidden=state.kind!=='existing'||fromLink;
   if(state.kind==='existing'&&fromLink){tabName.hidden=false;tabName.placeholder='Название листа';}
   diff.replaceChildren();
   if(state.preview){
    const p=state.preview;
    if(!p.changed)diff.append(k.el('p','gs-diff-note','Ячейки листа уже такие же — менять нечего.'));
    else{diff.append(k.el('p','gs-diff-note','Изменится '+p.changed+' '+plural(p.changed,['ячейка','ячейки','ячеек'])+' (остальные ячейки листа не трогаю):'));
     const ul=k.el('ul','gs-diff-list');for(const ch of p.changes){const li=k.el('li');li.append(raw(k.el('code',null,ch.cell)),raw(k.el('del',null,shown(ch.old)||'пусто')),k.el('span','gs-arrow','→'),raw(k.el('ins',null,shown(ch.new)||'пусто')));ul.append(li);}
     if(p.changed>p.changes.length)ul.append(k.el('li','kit-meta','и ещё '+(p.changed-p.changes.length)));diff.append(ul);}
   }
   state.sync?.();
  }
  book.onchange=()=>{fillTabs();state.preview=null;sync();};tabPick.onchange=()=>{state.preview=null;sync();};link.oninput=()=>{state.preview=null;sync();};tabName.oninput=()=>{state.preview=null;sync();};
  state.target=()=>state.kind==='new'?{kind:'new'}:{kind:state.kind,...book.value?{spreadsheetId:book.value}:{link:link.value.trim()},sheet:state.kind==='existing'&&book.value?tabPick.value:tabName.value.trim()};
  fillTabs();sync();state.repaint=sync;
  return body;
 }

 window.renderSheetsCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.sheets-card'))return;
  let card;
  if(c.mode==='sheet'){
   const view=sheetBody(k,c);
   const actions=[{label:'Открыть в Google Таблицах',run:()=>open(view.current().url||c.url)},{label:'Найти…',run:()=>k.ask('Найди в таблице «'+c.title+'» ')}];
   if(c.writable)actions.push({label:'Добавить строку…',run:()=>k.ask('Добавь строку в таблицу «'+c.title+'», лист «'+view.current().sheet.title+'»: ')});
   card=k.card({...badge,key:c.title,href:c.url,subtitle:c.sheet.title,status:{label:Math.max(0,c.text.length-c.header-1)+' '+plural(Math.max(0,c.text.length-c.header-1),['строка','строки','строк'])},body:view.body,actions,className:'sheets-card'});
   const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
   view.body.addEventListener('gs-sheet',e=>{if(sub)sub.textContent=e.detail.sheet.title;const chip=card.querySelector('.kit-card-head .kit-chip');const n=Math.max(0,e.detail.text.length-e.detail.header-1);if(chip)chip.textContent=n+' '+plural(n,['строка','строки','строк']);});
  }else if(c.mode==='find'){
   const n=c.matches?.length||0;
   card=k.card({...badge,key:c.title,href:c.url,subtitle:'«'+c.query+'»',status:{label:n?n+' '+plural(n,['совпадение','совпадения','совпадений']):'нет совпадений',tone:n?'accent':''},body:findBody(k,c),
    actions:[{label:'Открыть в Google Таблицах',run:()=>open(c.url)}],className:'sheets-card'});
   const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  }else if(c.mode==='append'){
   const status=k.chip(c.done?{label:'добавлено',tone:'done'}:{label:'ждёт подтверждения',tone:'progress'});
   const actions=[];
   const confirm={label:'Добавить строку',primary:true,title:'Петя добавит эту строку в конец листа',run:async b=>{
    const r=await call('append',c.draftId);c.done=r.done;status.replaceWith(k.chip({label:'добавлено',tone:'done'}));b.remove();k.toast(r.already?'Строка уже добавлена.':'Строка добавлена в «'+c.title+'».');}};
   if(!c.done)actions.push(confirm);
   actions.push({label:'Открыть в Google Таблицах',run:()=>open(c.url)});
   card=k.card({...badge,key:c.title,href:c.url,subtitle:c.sheet.title,status,body:appendBody(k,c),actions,className:'sheets-card'});
   const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  }else if(c.mode==='export'){
   const state={kind:c.canCreate?'new':(c.known?.length?'tab':'tab'),preview:null};
   const status=k.chip(c.done?{label:'выгружено',tone:'done'}:{label:'ждёт подтверждения',tone:'progress'});
   const body=exportBody(k,c,state);
   const actions=[];
   if(c.done)actions.push({label:'Открыть в Google Таблицах',primary:true,run:()=>open(c.done.url)});
   else{
    const check={label:'Показать изменения',run:async()=>{state.preview=await call('exportPreview',c.draftId,state.target());state.repaint();}};
    const go={label:'Выгрузить',primary:true,title:'Петя запишет таблицу туда, куда вы выбрали',run:async b=>{
     if(state.kind==='existing'&&!state.preview){state.preview=await call('exportPreview',c.draftId,state.target());state.repaint();k.toast('Проверьте изменения и нажмите «Выгрузить» ещё раз.');return;}
     const r=await call('exportRun',c.draftId,state.target());c.done=r.done;
     status.replaceWith(k.chip({label:'выгружено',tone:'done'}));
     const row=b.closest('.kit-actions');row.replaceChildren();const o=k.el('button','primary','Открыть в Google Таблицах');o.type='button';o.onclick=()=>open(r.done.url);row.append(o);
     body.querySelector('.gs-dest')?.remove();k.toast(r.already?'Уже выгружено.':'Выгружено в Google Таблицы.');}};
    actions.push(go,check);
    state.sync=()=>{const b=[...(card?.querySelectorAll('.kit-actions button')||[])].find(x=>x.dataset.action==='check');if(b)b.hidden=state.kind!=='existing';};
   }
   card=k.card({...badge,key:c.title,status,subtitle:c.app?'из «'+c.app+'»':'',body,actions,className:'sheets-card'});
   const key=card.querySelector('.kit-key');if(key)raw(key);
   const buttons=card.querySelectorAll('.kit-actions button');if(buttons[1]){buttons[1].dataset.action='check';buttons[1].hidden=state.kind!=='existing';}
   if(buttons[0]&&!c.done)buttons[0].dataset.action='export';
  }
  if(!card)return;
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
