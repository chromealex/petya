// «Геймдизайн-документ», renderer. Two cards:
// - draft: where the section goes (file, Confluence page or Google Doc), how many numbers are cited and how many are
//   «уточнить», the section's word diff against the GDD, the editable text (each edit re-checks the diff and the
//   numbers through the app's IPC), the config values with file:line and the sources. «Записать в GDD» writes exactly
//   the editor's text through the IPC `apply`; nothing is written before that press.
// - gaps: systems found in configs and code against the GDD's sections (a coverage bar and the list), «Описать в GDD».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('gdd-cards.css',document.currentScript.src).href;document.head.append(style);
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const call=(method,...args)=>window.petya.feature('gdd',method,...args);
 const KIND={file:'Markdown в проекте',confluence:'Confluence',google:'Google Документы'};
 const SOURCE={chat:'чат',meeting:'встреча',jira:'Jira'};
 const open=url=>{if(!url)return;if(window.openChatBrowser)window.openChatBrowser(url);else window.open(url,'_blank','noopener');};

 function paintOps(k,box,ops){
  box.replaceChildren();
  if(!ops?.some(o=>o.op!=='eq')){box.append(k.el('span','gdd-same','Без изменений'));return;}
  for(const o of ops)box.append(o.op==='eq'?k.el('span','gdd-eq',o.text):k.el(o.op==='ins'?'ins':'del',null,o.text));
 }
 function draftCard(k,c){
  const body=k.el('div','gdd-body');
  const dest=k.el('div','gdd-dest');
  dest.append(k.el('span','gdd-dest-label',c.section.exists?'Обновление раздела':'Новый раздел'),raw(k.el('b','gdd-dest-title','«'+c.section.title+'»')),k.el('span','gdd-muted','в'),raw(k.el('span','gdd-where',c.target.where)),k.chip({label:KIND[c.target.kind]||c.target.kind}));
  body.append(dest);
  const checks=k.el('div','gdd-checks');
  const cited=k.chip({label:'со ссылкой: '+c.cited,tone:'done',title:'Числа с источником: файл и строка конфига или строка чата, встречи, Jira'});
  const unclear=k.chip({label:'уточнить: '+c.unclear.length,tone:c.unclear.length?'alert':'done',title:'Числа без источника'});
  checks.append(cited,unclear);
  body.append(checks);
  body.append(k.el('div','gdd-head','Что изменится в GDD'));
  const diff=raw(k.el('p','gdd-diff selectable'));paintOps(k,diff,c.ops);body.append(diff);
  body.append(k.el('div','gdd-head','Текст раздела'));
  const area=document.createElement('textarea');area.className='gdd-text';area.value=c.text;area.spellcheck=false;area.rows=Math.min(10,Math.max(6,c.text.split('\n').length+1));area.setAttribute('aria-label','Текст раздела «'+c.section.title+'»');
  let timer=null;
  area.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(async()=>{try{const r=await call('preview',c.draftId,area.value);paintOps(k,diff,r.ops);unclear.textContent=(window.t?window.t('уточнить: '):'уточнить: ')+r.unclear.length;unclear.className='kit-chip tone-'+(r.unclear.length?'alert':'done');}catch{/* the editor keeps working */}},350);});
  body.append(area);
  if(c.facts?.length){
   const box=k.el('details','gdd-facts');box.append(k.el('summary',null,'Числа из конфигов · '+c.facts.length));
   const cell=v=>raw(k.el('span',null,v));
   const fmt=v=>typeof v==='number'?v.toLocaleString(window.petyaLocale||'ru-RU'):String(v);
   box.append(k.table([{label:'Объект',value:f=>cell(f.object)},{label:'Параметр',value:f=>cell(f.field)},{label:'Значение',value:f=>cell(fmt(f.value))},{label:'Файл и строка',value:f=>cell(f.cite)}],c.facts));
   if(c.configs?.length)box.append(raw(k.el('small','gdd-muted',c.configs.map(x=>x.label).join(' · '))));
   body.append(box);
  }
  if(c.sources?.length){
   const box=k.el('div','gdd-sources');box.append(k.el('div','gdd-head','Источники'));
   for(const x of c.sources){const row=k.el('div','gdd-source');row.append(k.chip({label:SOURCE[x.kind]||x.kind}));
    const label=raw(k.el(x.url?'a':'span','gdd-source-label',x.label));if(x.url){label.href=x.url;label.onclick=e=>{e.preventDefault();open(x.url);};}
    row.append(label,raw(k.el('span','gdd-source-text',x.text)));box.append(row);}
   body.append(box);
  }
  const status=k.chip({label:'черновик',tone:'progress'});
  let saved=false;
  const markSaved=()=>{saved=true;status.textContent=window.t?window.t('записано'):'записано';status.className='kit-chip tone-done';area.readOnly=true;save.disabled=true;save.textContent=window.t?window.t('Записано в GDD'):'Записано в GDD';};
  const save=k.el('button','primary','Записать в GDD');save.type='button';save.title='Запишет ровно этот текст в раздел «'+c.section.title+'»';
  const actions=[save];
  const grant=k.el('button',null,'Разрешить правку Google Документов');grant.type='button';grant.hidden=true;
  grant.onclick=async e=>{e.stopPropagation();grant.disabled=true;try{await call('grant');k.toast('Подтвердите доступ в браузере, затем нажмите «Записать в GDD» ещё раз.');}catch(err){k.toast(err.message,{error:true});}finally{grant.disabled=false;}};
  save.onclick=async e=>{e.stopPropagation();if(saved)return;save.disabled=true;
   try{const r=await call('apply',c.draftId,area.value);markSaved();k.toast(r?.text||'Записано');}
   catch(err){save.disabled=false;if(c.target.kind==='google'&&/разрешени/i.test(err.message))grant.hidden=false;k.toast(err.message,{error:true});}};
  if(c.target.kind==='google')actions.push(grant);
  if(c.target.url)actions.push({label:'Открыть GDD',run:()=>open(c.target.url)});
  const card=k.card({app:'Геймдизайн-документ',initial:'Г',color:'#7a5c3e',status,subtitle:c.target.title,title:c.section.title,body,className:'gdd-card gdd-draft',
   meta:[c.by==='model'?'текст — локальная модель; числа проверены кодом':'черновик по источникам; числа проверены кодом'],actions});
  card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  call('state',c.draftId).then(r=>{if(r?.state==='saved')markSaved();}).catch(()=>{});
  return card;
 }

 const STATUS={missing:['нет раздела','alert'],mentioned:['только упоминается','progress'],covered:['есть раздел','done']};
 function gapsCard(k,c){
  const body=k.el('div','gdd-body');
  const n=st=>c.rows.filter(r=>r.status===st).length;
  const total=Math.max(1,c.rows.length);
  const bar=k.el('div','gdd-cover');
  for(const st of ['covered','mentioned','missing']){const seg=k.el('span','seg st-'+st);seg.style.width=(100*n(st)/total)+'%';seg.title=(window.t?window.t(STATUS[st][0]):STATUS[st][0])+': '+n(st);bar.append(seg);}
  const legend=k.el('div','gdd-legend');
  for(const st of ['missing','mentioned','covered']){const x=k.el('span');x.append(k.el('i','st-'+st),k.el('span',null,STATUS[st][0]),raw(k.el('b',null,String(n(st)))));legend.append(x);}
  body.append(bar,legend);
  const list=k.el('div','gdd-systems');
  for(const r of c.rows){
   const row=k.el('div','gdd-system st-'+r.status);
   const name=raw(k.el('b','gdd-system-name',r.name));
   const [label,tone]=STATUS[r.status];
   const meta=k.el('div','gdd-system-meta');
   meta.append(k.chip({label:r.kind==='code'?'код':'конфиг'}),raw(k.el('code','gdd-file',r.files[0]||'')));
   if(r.section)meta.append(raw(k.el('span','gdd-muted','«'+r.section+'»')));
   const left=k.el('div','gdd-system-main');left.append(name,meta);
   row.append(left,k.chip({label,tone}));
   if(r.status!=='covered'){const b=k.el('button','gdd-describe','Описать в GDD');b.type='button';b.onclick=e=>{e.stopPropagation();k.ask('Опиши '+r.name+' в GDD',{send:true});};row.append(b);}
   list.append(row);
  }
  body.append(list);
  const card=k.card({app:'Геймдизайн-документ',initial:'Г',color:'#7a5c3e',status:{label:n('missing')?'без раздела: '+n('missing'):'всё описано',tone:n('missing')?'alert':'done'},subtitle:c.target.where,
   title:'Чего не хватает в GDD',body,className:'gdd-card gdd-gaps',meta:['систем найдено: '+c.rows.length+' · разделов в GDD: '+c.sections],
   actions:c.target.url?[{label:'Открыть GDD',run:()=>open(c.target.url)}]:[]});
  return card;
 }
 window.renderGddCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.gdd-card'))return;
  parent.append(c.mode==='gaps'?gapsCard(k,c):draftCard(k,c));
 };
})();
