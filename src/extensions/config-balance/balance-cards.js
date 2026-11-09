// «Конфиги и баланс», renderer. Compare: a stacked bar of matching / differing / missing values, the mapping with a
// field choice per column and «Подтвердить сопоставление», the differences table (object, field, sheet, config, delta
// with a bar, status chip, file:line), schema issues by severity with editable rules, and actions: «Применить в
// конфиги» (code-fix → Programmer), «Записать в таблицу…» (cell preview, then write), «Выгрузить отчёт»
// (spreadsheet-export). Validate: issues per config set. History: versions from git with field changes.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('balance-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('configBalance',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const val=v=>v===null||v===undefined||v===''?'—':typeof v==='number'?v.toLocaleString(locale(),{maximumFractionDigits:6}):Array.isArray(v)?v.join(', '):String(v);
 const short=f=>String(f||'').split('/').pop();
 const STATUS={same:{label:'совпадает',tone:'done'},diff:{label:'расходится',tone:'alert'},'no-object':{label:'нет в конфигах',tone:'progress'},'no-row':{label:'нет в таблице',tone:''},'no-field':{label:'нет поля',tone:'progress'}};
 const HOW={name:'по названию',values:'по значениям',model:'модель',user:'вы'};
 const badge={app:'Конфиги и баланс',initial:'⚖',color:'#6b5a2e'};
 const open=url=>{if(typeof window.openChatBrowser==='function')window.openChatBrowser(url);else window.open(url,'_blank','noopener');};

 function stack(k,counts){
  const box=k.el('div','cb-stack');const bar=k.el('div','cb-stack-bar');bar.setAttribute('role','img');
  const parts=[['same','совпадает',counts.same],['diff','расходится',counts.diff],['no-object','нет в конфигах',counts.noObject],['no-row','нет в таблице',counts.noRow],['no-field','нет поля',counts.noField]].filter(p=>p[2]);
  const total=parts.reduce((n,p)=>n+p[2],0)||1;
  bar.setAttribute('aria-label',parts.map(p=>p[1]+': '+p[2]).join(', '));
  for(const [kind,,n] of parts){const s=k.el('span','cb-seg '+kind);s.style.flexGrow=String(n);s.style.flexBasis=Math.max(3,n/total*100)+'%';bar.append(s);}
  const legend=k.el('div','cb-legend');for(const [kind,label,n] of parts){const l=k.el('span');l.append(k.el('i','cb-dot '+kind),k.el('span',null,label+' '),k.el('strong',null,String(n)));legend.append(l);}
  box.append(bar,legend);return box;
 }
 function mappingBox(k,c,repaint){
  const box=k.el('div','cb-section cb-mapping');
  const head=k.el('div','cb-head');head.append(k.el('span',null,'Сопоставление'),k.chip(c.mapping.confirmed?{label:'подтверждено',tone:'done'}:{label:'предложено — проверьте',tone:'progress'}));
  const keyLine=k.el('p','cb-key');keyLine.append(k.el('span',null,'Ключ: '),raw(k.el('code',null,c.mapping.key.column)),k.el('span','cb-arrow','↔'),raw(k.el('code',null,c.mapping.key.field==='id'?'id':c.mapping.key.field==='name'?'имя объекта':c.mapping.key.field==='file'?'имя файла':c.mapping.key.field)));
  const list=k.el('div','cb-pairs');
  const select=(column,current)=>{
   const s=k.el('select','cb-field');s.setAttribute('aria-label','Поле конфига для «'+column+'»');raw(s);
   const none=k.el('option',null,'не сопоставлять');none.value='';s.append(none);
   for(const f of c.mapping.fields){const o=k.el('option',null,f);o.value=f;if(f===current)o.selected=true;s.append(o);}
   s.onchange=async()=>{s.disabled=true;try{repaint(await call('remap',c.reportId,column,s.value));}catch(e){k.toast(e.message,{error:true});s.disabled=false;}};
   return s;
  };
  for(const p of c.mapping.columns){const row=k.el('div','cb-pair');row.append(raw(k.el('span','cb-col',p.column)),k.el('span','cb-arrow','→'),select(p.column,p.field),k.el('small','cb-how',HOW[p.how]||''));list.append(row);}
  for(const u of c.mapping.unmatched||[]){const row=k.el('div','cb-pair muted');row.append(raw(k.el('span','cb-col',u)),k.el('span','cb-arrow','→'),select(u,''));list.append(row);}
  box.append(head,keyLine,list);
  if(!c.mapping.confirmed){const b=k.el('button','primary','Подтвердить сопоставление');b.type='button';b.title='Петя запомнит его для этого проекта';
   b.onclick=async()=>{b.disabled=true;try{repaint(await call('confirm',c.reportId));k.toast('Сопоставление сохранено для проекта.');}catch(e){k.toast(e.message,{error:true});b.disabled=false;}};box.append(b);}
  return box;
 }
 function diffTable(k,c){
  const box=k.el('div','cb-section');
  let all=false;
  const head=k.el('div','cb-head');const toggle=k.el('button','cb-toggle');toggle.type='button';
  const holder=k.el('div','cb-table-wrap');
  const focus=new Set(c.focus||[]);
  const maxRel=Math.max(0.0001,...c.rows.filter(r=>r.delta!==null&&r.delta!==undefined&&typeof r.config==='number').map(r=>Math.abs(r.delta)/Math.max(1,Math.abs(r.config))));
  const paint=()=>{
   const rows=c.rows.map((r,i)=>({...r,i})).filter(r=>all||r.status!=='same'||focus.has(r.i));
   toggle.textContent=all?'Только расхождения':'Показать все значения';
   const t=k.el('table','cb-table');const tr=k.el('tr');for(const h of ['Объект','Поле','Таблица','Конфиг','Разница','Статус'])tr.append(k.el('th',null,h));const thead=k.el('thead');thead.append(tr);
   const tbody=k.el('tbody');
   for(const r of rows.slice(0,200)){
    const row=k.el('tr','cb-row '+r.status+(focus.has(r.i)?' focus':''));
    const obj=k.el('td','cb-obj');obj.append(raw(k.el('strong',null,r.label||r.object||r.key)));if(r.file)obj.append(raw(k.el('small',null,short(r.file)+(r.line?':'+r.line:''))));if(r.file)obj.title=r.file+(r.line?', строка '+r.line:'');
    const field=k.el('td','cb-fieldcell');if(r.column){field.append(raw(k.el('span',null,r.column)));if(r.field)field.append(raw(k.el('small',null,r.field)));}
    const delta=k.el('td','cb-delta num');
    if(r.delta!==null&&r.delta!==undefined){const rel=Math.abs(r.delta)/Math.max(1,Math.abs(Number(r.config)||0));const b=k.el('span','cb-dbar '+(r.delta>0?'up':'down'));b.style.width=Math.max(6,rel/maxRel*48)+'px';const inner=k.el('span','cb-dval');inner.append(k.el('span',null,(r.delta>0?'+':'−')+val(Math.abs(r.delta))),b);delta.append(inner);}
    row.append(obj,field,raw(k.el('td','num'+(r.status==='diff'?' sheet':''),r.status==='no-row'?'—':val(r.sheet))),raw(k.el('td','num',r.status==='no-object'?'—':val(r.config))),delta);
    const st=k.el('td');st.append(k.chip(STATUS[r.status]||{label:r.status}));row.append(st);tbody.append(row);
   }
   t.append(thead,tbody);holder.replaceChildren(t);
   if(!rows.length)holder.append(k.el('p','cb-empty','Расхождений нет — таблица и конфиги совпадают.'));
   if(rows.length>200)holder.append(k.el('small','kit-meta','Показаны первые 200 строк.'));
  };
  toggle.onclick=()=>{all=!all;paint();};
  head.append(k.el('span',null,'Значения'),toggle);box.append(head,holder);paint();
  return box;
 }
 function issuesBox(k,issues,rules,{reportId,repaint,title='Проверка конфигов'}={}){
  const box=k.el('div','cb-section');
  const errors=issues.filter(i=>i.severity==='error').length,warnings=issues.length-errors;
  const head=k.el('div','cb-head');head.append(k.el('span',null,title));
  if(errors)head.append(k.chip({label:errors+' '+plural(errors,['ошибка','ошибки','ошибок']),tone:'alert'}));
  if(warnings)head.append(k.chip({label:warnings+' '+plural(warnings,['предупреждение','предупреждения','предупреждений']),tone:'progress'}));
  if(!issues.length)head.append(k.chip({label:'без ошибок',tone:'done'}));
  box.append(head);
  const items=issues.map(i=>{const li=k.el('div','cb-issue '+i.severity);li.append(k.el('span','cb-sev',i.severity==='error'?'●':'▲'));const text=k.el('div');text.append(raw(k.el('span',null,i.message)));
   if(i.file||i.object)text.append(raw(k.el('small',null,[i.object,i.file?short(i.file)+(i.line?':'+i.line:''):''].filter(Boolean).join(' · '))));li.append(text);if(i.file)li.title=i.file+(i.line?', строка '+i.line:'');return li;});
  if(items.length)box.append(k.collapse(items,6));
  if(rules?.length){
   const d=k.el('details','cb-rules');d.append(k.el('summary',null,'Правила проверки'));
   const t=k.el('table','cb-table');const tr=k.el('tr');for(const h of ['Поле','Тип','Обязательное','Мин.','Макс.','Значения',''])tr.append(k.el('th',null,h));const thead=k.el('thead');thead.append(tr);const tbody=k.el('tbody');
   for(const r of rules){
    const row=k.el('tr'+'');row.append(raw(k.el('td',null,r.field)),k.el('td',null,{number:'число',string:'текст',bool:'да/нет',list:'список',ref:'ссылка',empty:'—'}[r.type]||r.type),k.el('td',null,r.required?'да':'нет'),raw(k.el('td','num',r.min??'')),raw(k.el('td','num',r.max??'')),raw(k.el('td',null,(r.enum||[]).join(', '))));
    const cell=k.el('td');
    if(reportId){const b=k.el('button','cb-edit',r.user?'Изменить':'Задать');b.type='button';b.onclick=()=>edit(row,r);cell.append(b);}
    if(r.user)row.classList.add('user');row.append(cell);tbody.append(row);
   }
   t.append(thead,tbody);d.append(t);box.append(d);
   function edit(row,r){
    const form=k.el('div','cb-rule-form');
    const req=k.el('input');req.type='checkbox';req.checked=!!r.required;const reqL=k.el('label');reqL.append(req,k.el('span',null,'обязательное'));
    const min=k.el('input');min.type='number';min.value=r.min??'';min.placeholder='мин.';min.setAttribute('aria-label','Минимум');
    const max=k.el('input');max.type='number';max.value=r.max??'';max.placeholder='макс.';max.setAttribute('aria-label','Максимум');
    const save=k.el('button','primary','Сохранить');save.type='button';const reset=k.el('button',null,'Как по данным');reset.type='button';
    const send=async rule=>{try{repaint(await call('setRule',reportId,r.field,rule));}catch(e){k.toast(e.message,{error:true});}};
    save.onclick=()=>send({required:req.checked,min:min.value,max:max.value,...r.enum?.length?{enum:r.enum}:{}});reset.onclick=()=>send(null);
    form.append(reqL,min,max,save,reset);const tr=k.el('tr','cb-rule-edit');const td=k.el('td');td.colSpan=7;td.append(form);tr.append(td);row.after(tr);min.focus();
   }
  }
  return box;
 }
 // Configs → sheet: the cells to change, then «Записать».
 function sheetWrite(k,c,box,status){
  return async()=>{
   const plan=await call('prepareSheetWrite',c.reportId);
   box.replaceChildren();box.hidden=false;
   box.append(k.el('p','cb-write-title','Запишу в таблицу значения из конфигов — '+plan.changes.length+' '+plural(plan.changes.length,['ячейку','ячейки','ячеек'])+':'));
   const ul=k.el('ul','cb-write-list');for(const ch of plan.changes.slice(0,40)){const li=k.el('li');li.append(raw(k.el('code',null,ch.cell)),raw(k.el('span','cb-wlabel',ch.label+' · '+ch.field)),raw(k.el('del',null,val(ch.old))),k.el('span','cb-arrow','→'),raw(k.el('ins',null,val(ch.new))));ul.append(li);}
   if(plan.changes.length>40)ul.append(k.el('li','kit-meta','и ещё '+(plan.changes.length-40)));
   const go=k.el('button','primary','Записать '+plan.changes.length+' '+plural(plan.changes.length,['ячейку','ячейки','ячеек']));go.type='button';
   const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>{box.hidden=true;box.replaceChildren();};
   go.onclick=async()=>{go.disabled=true;try{const r=await call('writeSheet',c.reportId);box.replaceChildren(k.el('p','cb-done','Записано в таблицу: '+r.done.cells+' '+plural(r.done.cells,['ячейка','ячейки','ячеек'])+'.'));status.replaceWith(k.chip({label:'таблица обновлена',tone:'done'}));}catch(e){k.toast(e.message,{error:true});go.disabled=false;}};
   const row=k.el('div','cb-write-actions');row.append(go,cancel);box.append(ul,row);
  };
 }
 const exportRows=c=>c.rows.filter(r=>r.status!=='same').map(r=>[r.label||r.object||r.key,r.column||'',r.field||'',typeof r.sheet==='number'||typeof r.sheet==='string'?r.sheet:'',typeof r.config==='number'||typeof r.config==='string'?r.config:'',r.delta??'',(STATUS[r.status]||{label:r.status}).label,r.file||'',r.line||'']);

 function compareCard(k,c){
  const body=k.el('div','cb-body');
  const node={card:null};
  const repaint=next=>{const fresh=compareCard(k,{...c,...next});node.card.replaceWith(fresh);};
  body.append(stack(k,c.counts),mappingBox(k,c,repaint),diffTable(k,c),issuesBox(k,c.issues,c.rules,{reportId:c.reportId,repaint}));
  const writeBox=k.el('div','cb-write');writeBox.hidden=true;body.append(writeBox);
  const status=k.chip(c.counts.diff?{label:'расходится '+c.counts.diff,tone:'alert'}:{label:'совпадает',tone:'done'});
  const actions=[];
  if(c.codeFix)actions.push(k.links('code-fix',{text:c.codeFix},{label:'Применить в конфиги (Программист)',primary:true,title:'Программист внесёт эти значения в отдельной ветке и покажет дифф'}));
  if(c.canWriteSheet)actions.push({label:'Записать в таблицу…',title:'Значения из конфигов в Google Таблицу — после просмотра ячеек',run:sheetWrite(k,c,writeBox,status)});
  actions.push(k.links('spreadsheet-export',()=>({title:'Сверка баланса · '+c.source.label,sheet:'Сверка',app:'Конфиги и баланс',header:['Объект','Столбец','Поле','Таблица','Конфиг','Разница','Статус','Файл','Строка'],rows:exportRows(c)}),{label:'Выгрузить отчёт'}));
  if(c.source.url)actions.push({label:'Открыть таблицу',run:()=>open(c.source.url)});
  node.card=k.card({...badge,key:c.source.label,href:c.source.url||'',status,subtitle:'↔ '+c.set.label,body,actions,className:'balance-card'});
  for(const n of node.card.querySelectorAll('.kit-key,.kit-subtitle'))raw(n);
  return node.card;
 }
 function validateCard(k,c){
  const body=k.el('div','cb-body');
  for(const set of c.sets)body.append(issuesBox(k,set.issues,set.rules,{title:set.label+' · '+set.objects+' '+plural(set.objects,['объект','объекта','объектов'])}));
  for(const n of body.querySelectorAll('.cb-head > span:first-child'))raw(n);
  const errors=c.sets.reduce((n,x)=>n+x.issues.filter(i=>i.severity==='error').length,0);
  const card=k.card({...badge,key:c.project,status:errors?{label:errors+' '+plural(errors,['ошибка','ошибки','ошибок']),tone:'alert'}:{label:'без ошибок',tone:'done'},subtitle:'проверка конфигов',body,
   actions:[{label:'Сверить с таблицей',run:()=>k.ask('Сверь баланс с конфигами',{send:true})}],className:'balance-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  return card;
 }
 function historyCard(k,c){
  const body=k.el('div','cb-body');
  const max=Math.max(1,...c.versions.map(v=>v.changes.length));
  const line=k.el('div','cb-timeline');
  for(const v of c.versions){
   const item=k.el('div','cb-version'+(v.working?' working':''));
   const head=k.el('div','cb-vhead');
   head.append(k.el('span','cb-vdot'));
   const title=k.el('div','cb-vtitle');title.append(raw(k.el('strong',null,v.working?'Не закоммичено':v.subject)));
   const meta=k.el('small');if(!v.working){meta.append(raw(k.el('code',null,v.short)),document.createTextNode(' · '),raw(k.el('span',null,v.author)),document.createTextNode(' · '));if(window.timeElement)meta.append(window.timeElement(v.date));else meta.append(k.el('span',null,new Date(v.date).toLocaleString(locale())));}
   else meta.append(k.el('span',null,'рабочая копия'));
   title.append(meta);
   const bar=k.el('span','cb-vbar');const fill=k.el('span');fill.style.width=Math.max(4,v.changes.length/max*100)+'%';bar.append(fill);
   head.append(title,bar,k.el('span','cb-vcount',v.changes.length+' '+plural(v.changes.length,['правка','правки','правок'])));
   item.append(head);
   if(v.changes.length){
    const t=k.el('table','cb-table');const tr=k.el('tr');for(const h of ['Объект','Поле','Было','Стало','Файл'])tr.append(k.el('th',null,h));const thead=k.el('thead');thead.append(tr);const tbody=k.el('tbody');
    for(const ch of v.changes.slice(0,30)){const row=k.el('tr');row.append(raw(k.el('td',null,ch.object||'—')),raw(k.el('td',null,ch.field||'—')),raw(k.el('td','num old',val(ch.old))),raw(k.el('td','num new',val(ch.new))),raw(k.el('td','cb-file',short(ch.file)+(ch.line?':'+ch.line:''))));row.title=ch.file;tbody.append(row);}
    t.append(thead,tbody);const wrap=k.el('div','cb-table-wrap');wrap.append(t);item.append(wrap);
    if(v.changes.length>30)item.append(k.el('small','kit-meta','и ещё '+(v.changes.length-30)));
   }
   line.append(item);
  }
  if(!c.versions.length)body.append(k.el('p','cb-empty','Изменений конфигов в истории git нет.'));
  body.append(line);
  const rows=c.versions.flatMap(v=>v.changes.map(ch=>[v.working?'не закоммичено':v.short,v.working?'':v.subject,v.author||'',v.date||'',ch.object||'',ch.field||'',ch.old??'',ch.new??'',ch.file||'',ch.line||'']));
  const card=k.card({...badge,key:c.project,status:{label:c.total+' '+plural(c.total,['правка','правки','правок']),tone:c.total?'accent':''},subtitle:'версии конфигов в git',body,
   actions:[{label:'Сверить с таблицей',run:()=>k.ask('Сверь баланс с конфигами',{send:true})},k.links('spreadsheet-export',()=>({title:'Изменения баланса · '+c.project,sheet:'Версии',app:'Конфиги и баланс',header:['Коммит','Описание','Автор','Дата','Объект','Поле','Было','Стало','Файл','Строка'],rows}),{label:'Выгрузить отчёт'})],className:'balance-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  return card;
 }
 window.renderBalanceCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.balance-card'))return;
  const card=c.mode==='compare'?compareCard(k,c):c.mode==='validate'?validateCard(k,c):c.mode==='history'?historyCard(k,c):null;
  if(card)parent.append(card);
 };
})();
