// «Глоссарий», renderer: project terms and proposed candidates with search, definition, translation chips per
// language (a warning when the strings use several), synonyms, forbidden variants and a usage bar; for a check,
// variant bars per term and language and a table of the strings that differ. «Принять», «Изменить» and the red
// trash change the glossary only when pressed (delete has «Отменить»); «Экспорт» saves CSV or JSON.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('glossary-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=v=>Number(v||0).toLocaleString(locale());
 // Russian forms; another interface language takes the singular only for exactly one (the word is translated in the DOM).
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 // Terms, definitions, translations and strings are project data: never machine-translated.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const feature=(method,...args)=>window.petya.feature('glossary',method,...args);
 const lower=s=>String(s||'').toLocaleLowerCase().replace(/ё/g,'е');
 const MODES={term:'термин',candidates:'предложения',list:'глоссарий проекта',check:'проверка локализации'};

 function download({name,type,content}){
  const url=URL.createObjectURL(new Blob([content],{type:type+';charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const translationsText=t=>Object.entries(t||{}).map(([l,v])=>l+': '+v).join('; ');
 const translationsOf=text=>{const out={};for(const part of String(text||'').split(/[;\n]/)){const m=/^\s*([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,4})?)\s*[:=—-]\s*(.+?)\s*$/.exec(part);if(m)out[m[1]]=m[2];}return out;};

 function field(k,label,value,{area=false}={}){
  const box=k.el('label','gl-field');box.append(k.el('span',null,label));
  const input=k.el(area?'textarea':'input');input.value=value||'';if(area)input.rows=2;box.append(input);return {box,input};
 }

 function termRow(k,t,c,ctx){
  const row=k.el('article','gl-row'+(t.saved?'':' candidate')+(t.removed?' removed':''));
  row.dataset.state=t.removed?'removed':t.saved?'saved':'candidate';
  row.dataset.search=lower([t.term,t.definition,...(t.synonyms||[]),...Object.values(t.translations||{})].join(' '));
  const head=k.el('div','gl-head');
  head.append(raw(k.el('strong','gl-term',t.term)));
  const chip=k.chip(t.removed?{label:'удалён',tone:'alert'}:t.saved?{label:'в глоссарии',tone:'done'}:{label:'предложение',tone:'progress'});chip.classList.add('gl-state');head.append(chip);
  const u=t.usage||{},total=(u.strings||0)+(u.chat||0)+(u.docs||0);
  const usage=k.el('span','gl-usage');usage.title='Строк локализации: '+num(u.strings)+' · в переписке и на встречах: '+num(u.chat)+' · в документах: '+num(u.docs);
  const meter=k.el('span','gl-meter');const fill=k.el('i');fill.style.width=(ctx.maxUsage?Math.max(total?6:0,100*total/ctx.maxUsage):0)+'%';meter.append(fill);
  usage.append(meter,k.el('b',null,num(total)));head.append(usage);
  row.append(head);
  row.append(t.definition?raw(k.el('p','gl-def selectable',t.definition)):k.el('p','gl-def empty','Определения нет — добавьте в «Изменить».'));
  const chips=k.el('div','gl-chips');
  for(const [lang,text] of Object.entries(t.translations||{})){
   const node=k.el('span','gl-tr');node.append(raw(k.el('b',null,lang.toUpperCase())),raw(k.el('span',null,text)));
   const variants=(t.variants?.[lang]||[]).filter(v=>v.n);
   if(variants.length>1){node.classList.add('mixed');node.title='В строках: '+variants.map(v=>(v.text||'другое')+' — '+v.n).join(', ');}
   chips.append(node);
  }
  for(const s of t.synonyms||[]){const n=raw(k.el('span','gl-syn',s));n.title='Синоним';chips.append(n);}
  for(const f of t.forbidden||[]){const n=raw(k.el('span','gl-forbidden',f));n.title='Запрещённый вариант';chips.append(n);}
  if(chips.childNodes.length)row.append(chips);
  const ex=[...(t.examples||[]).map(e=>{const li=k.el('li');li.append(raw(k.el('code',null,e.key)),raw(k.el('span',null,e.text)));return li;}),
   ...(t.chat||[]).map(m=>{const li=k.el('li');const label=raw(k.el(m.url?'a':'b','gl-src',m.source+(m.title?' · '+m.title:'')));if(m.url&&k.safeUrl(m.url)){label.href=k.safeUrl(m.url);label.target='_blank';label.rel='noopener';}li.append(label,raw(k.el('q',null,m.text)));return li;})];
  const links=(t.sources||[]).map(s=>{const node=raw(k.el(s.url?'a':'span','gl-source',s.label));if(s.url&&k.safeUrl(s.url)){node.href=k.safeUrl(s.url);node.target='_blank';node.rel='noopener';}node.dataset.kind=s.kind||'';return node;});
  if(ex.length||links.length){
   const d=k.el('details','gl-more selectable');d.append(k.el('summary',null,'Где встречается'+(ex.length?' · '+ex.length:'')));
   if(ex.length){const ul=k.el('ul');ul.append(...ex);d.append(ul);}
   if(links.length){const p=k.el('p','gl-sources');p.append(k.el('span',null,'Источники: '),...links);d.append(p);}
   row.append(d);
  }
  const actions=k.el('div','gl-actions');
  const button=(label,run,cls='')=>{const b=k.el('button',cls,label);b.type='button';b.onclick=async e=>{e.stopPropagation();if(b.disabled)return;b.disabled=true;try{await run(b);}catch(err){k.toast(err.message,{error:true});}finally{b.disabled=false;}};return b;};
  const replace=next=>{const fresh=termRow(k,next,c,ctx);row.replaceWith(fresh);return fresh;};
  const edit=()=>{
   const form=k.el('form','gl-edit');
   const f={term:field(k,'Термин',t.term),definition:field(k,'Определение',t.definition,{area:true}),translations:field(k,'Переводы (en: chest; de: Truhe)',translationsText(t.translations)),synonyms:field(k,'Синонимы (через запятую)',(t.synonyms||[]).join(', ')),forbidden:field(k,'Запрещённые варианты (через запятую)',(t.forbidden||[]).join(', '))};
   for(const x of Object.values(f)){x.input.setAttribute('data-no-i18n','');form.append(x.box);}
   const save=k.el('button','primary',t.saved?'Сохранить':'Принять');save.type='submit';
   const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>{form.replaceWith(actions);};
   const bar=k.el('div','gl-actions');bar.append(save,cancel);form.append(bar);
   form.onsubmit=async e=>{e.preventDefault();save.disabled=true;
    const fields={term:f.term.input.value,definition:f.definition.input.value,translations:translationsOf(f.translations.input.value),synonyms:f.synonyms.input.value,forbidden:f.forbidden.input.value};
    try{const saved=t.saved?await feature('update',c.cardId,c.projectId,t.id,fields):await feature('accept',c.cardId,c.projectId,{...t,...fields});
     k.toast(t.saved?'Термин «'+saved.term+'» изменён':'«'+saved.term+'» — в глоссарии проекта');ctx.changed();replace({...t,...saved,saved:true,removed:false});}
    catch(err){k.toast(err.message,{error:true});save.disabled=false;}};
   actions.replaceWith(form);form.querySelector('textarea,input')?.focus();
  };
  if(!t.saved&&!t.removed){
   actions.append(button('Принять',async()=>{const saved=await feature('accept',c.cardId,c.projectId,t);k.toast('«'+saved.term+'» — в глоссарии проекта');ctx.changed();replace({...t,...saved,saved:true});},'primary accept'));
   actions.append(button('Изменить',edit));
  }else if(t.saved&&!t.removed){
   actions.append(button('Изменить',edit));
   const del=window.deleteButton('Удалить термин «'+t.term+'»',async e=>{e.stopPropagation();del.disabled=true;
    try{const removed=await feature('remove',c.cardId,c.projectId,t.id);ctx.changed();const gone=replace({...t,saved:false,removed:true});
     k.toast('«'+t.term+'» удалён из глоссария',{timeout:10000,undo:async()=>{await feature('restore',c.cardId,c.projectId,removed);ctx.changed();gone.replaceWith(termRow(k,{...t,saved:true,removed:false},c,ctx));}});}
    catch(err){k.toast(err.message,{error:true});del.disabled=false;}});
   del.classList.add('gl-delete');actions.append(del);
  }
  if(actions.childNodes.length)row.append(actions);
  return row;
 }

 const SEG={ok:'#c9ed9d',bad:'#f0b4a8',other:'#5d6863'};
 function variantBars(k,summary){
  const box=k.el('div','gl-bars');
  const rows=summary.filter(x=>x.variants.length>1||x.variants.some(v=>!v.ok)).concat(summary.filter(x=>!(x.variants.length>1||x.variants.some(v=>!v.ok)))).slice(0,10);
  for(const x of rows){
   const line=k.el('div','gl-bar-row');
   const label=k.el('span','gl-bar-label');label.append(raw(k.el('b',null,x.term)),' → ',raw(k.el('span',null,x.lang.toUpperCase())));
   const bar=k.el('div','gl-bar');bar.setAttribute('role','img');
   const legend=k.el('span','gl-bar-legend');
   const parts=[];
   for(const v of x.variants){const seg=k.el('span');seg.style.flexGrow=String(v.n);seg.style.background=v.ok?SEG.ok:v.text?SEG.bad:SEG.other;seg.dataset.ok=String(!!v.ok);bar.append(seg);parts.push((v.text||'другое')+' '+v.n);}
   bar.setAttribute('aria-label',x.term+' → '+x.lang+': '+parts.join(', '));bar.title=parts.join(' · ')+(x.expected?' · утверждено: '+x.expected:'');
   legend.append(raw(k.el('span',null,parts.join(' · '))));
   line.append(label,bar,legend);box.append(line);
  }
  return box;
 }
 function issueText(i){
  if(i.kind==='forbidden')return 'запрещено «'+i.found+'»'+(i.expected?' → «'+i.expected+'»':'');
  if(i.kind==='translation')return 'нет «'+i.expected+'»'+(i.found?', здесь «'+i.found+'»':'');
  return '«'+(i.found||'другое')+'» вместо «'+i.expected+'»';
 }
 function checkSection(k,check){
  const box=k.el('section','gl-check');
  if(check.summary?.length){box.append(k.el('h5',null,'Переводы терминов в строках'),variantBars(k,check.summary));}
  if(check.issues?.length){
   box.append(k.el('h5',null,'Расхождения · '+num(check.total)));
   const shown=check.issues.slice(0,40);
   const KIND={forbidden:'alert',translation:'alert',inconsistent:'progress'};
   const cell=(text,cls)=>raw(k.el('span',cls,text));
   const table=k.table([{label:'Термин',value:i=>cell(i.term,'gl-cell-term')},{label:'Язык',value:i=>cell(i.lang.toUpperCase())},{label:'Ключ',value:i=>{const c=cell(i.key,'gl-cell-key');c.title=i.set;return c;}},{label:'Строка',value:i=>cell(i.text,'gl-cell-text')},
    {label:'Проблема',value:i=>{const c=raw(k.el('span','gl-issue '+(KIND[i.kind]||''),issueText(i)));c.dataset.kind=i.kind;return c;}}],shown);
   table.classList.add('gl-table','selectable');box.append(table);
   if(check.total>shown.length)box.append(k.el('p','gl-note','Показаны первые '+shown.length+' из '+num(check.total)+'.'));
  }else box.append(k.el('p','gl-note ok','Строки согласованы с глоссарием.'));
  return box;
 }

 window.renderGlossary=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.gl-card'))return;
  const body=k.el('div','gl-body');
  const all=[...(c.candidates||[]),...(c.terms||[])];
  const ctx={maxUsage:Math.max(0,...all.map(t=>(t.usage?.strings||0)+(t.usage?.chat||0)+(t.usage?.docs||0))),changed(){exports.hidden=false;const left=body.querySelectorAll('.gl-row.candidate').length;if(c.mode==='candidates'||c.mode==='term'){chip.className='kit-chip tone-'+(left?'progress':'done');chip.textContent=left?left+' '+plural(left,['предложение','предложения','предложений']):'всё принято';}}};
  if(c.check)body.append(checkSection(k,c.check));
  const lists=k.el('div','gl-lists');
  const section=(title,items,cls)=>{if(!items.length)return;const box=k.el('section','gl-section '+cls);box.append(k.el('h5',null,title+' · '+items.length));box.append(k.collapse(items.map(t=>termRow(k,t,c,ctx)),c.check?3:6,'Ещё термины'));lists.append(box);};
  if(all.length>4){
   const search=k.el('input','gl-search');search.type='search';search.placeholder='Найти термин';search.setAttribute('aria-label','Найти термин');
   search.oninput=()=>{const q=lower(search.value.trim());for(const row of lists.querySelectorAll('.gl-row'))row.hidden=!!q&&!row.dataset.search.includes(q);for(const d of lists.querySelectorAll('.kit-more'))if(q)d.open=true;};
   body.append(search);
  }
  section('Предложения',c.candidates||[],'candidates');
  section(c.mode==='check'?'Термины глоссария':'В глоссарии',c.terms||[],'saved');
  if(lists.childNodes.length)body.append(lists);
  if(c.scanned){const n=k.el('p','gl-note');n.append('Просмотрено: '+num(c.scanned.strings)+' '+plural(c.scanned.strings||0,['строка','строки','строк'])+' локализации'+(c.scanned.docs?', '+num(c.scanned.docs)+' '+plural(c.scanned.docs,['страница','страницы','страниц'])+' документации':'')+(c.scanned.sets?.length?' · ':''),raw(k.el('span',null,(c.scanned.sets||[]).join(', '))));body.append(n);}
  const pending=(c.candidates||[]).length,savedCount=(c.terms||[]).filter(t=>t.saved).length;
  const status=c.mode==='check'?(c.check?.total?{label:num(c.check.total)+' '+plural(c.check.total,['расхождение','расхождения','расхождений']),tone:'alert'}:{label:'согласовано',tone:'done'})
   :pending?{label:pending+' '+plural(pending,['предложение','предложения','предложений']),tone:'progress'}:{label:num(savedCount)+' '+plural(savedCount,['термин','термина','терминов']),tone:'done'};
  const exports=k.el('span','gl-export');exports.hidden=!(c.terms||[]).some(t=>t.saved);
  for(const format of ['csv','json']){const b=k.el('button',null,'Экспорт '+format.toUpperCase());b.type='button';b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{download(await feature('export',c.projectId,format));}catch(err){k.toast(err.message,{error:true});}finally{b.disabled=false;}};exports.append(b);}
  const actions=[exports];
  if(pending>=2)actions.push({label:'Принять все',run:async()=>{let n=0;for(const row of [...body.querySelectorAll('.gl-row.candidate .accept')]){row.click();n++;await new Promise(r=>setTimeout(r,30));}if(!n)k.toast('Принимать нечего');}});
  if(c.mode!=='check')actions.push({label:'Проверить локализацию',run:()=>k.ask('Проверь термины в локализации',{send:true})});
  if(c.mode!=='candidates')actions.push({label:'Собрать глоссарий',run:()=>k.ask('Собери глоссарий проекта',{send:true})});
  const chip=k.chip(status);
  const card=k.card({app:'Глоссарий',initial:'Г',color:'#566b4c',key:c.project||'',status:chip,subtitle:MODES[c.mode]||'',body,actions,className:'gl-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
