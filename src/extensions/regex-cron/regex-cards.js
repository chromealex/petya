// «Регулярки и cron», renderer: the pattern with its parts, every sample line with highlighted matches
// (✓/✗ against what was expected for drafted patterns), and for cron the five fields and the next runs.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('regex-cards.css',document.currentScript.src).href;document.head.append(style);
 const copy=async(k,text)=>{try{await navigator.clipboard.writeText(text);k.toast('Скопировано');}catch{k.toast('Не удалось скопировать',{error:true});}};
 function highlighted(k,line,matches){
  const box=k.el('span','line');let at=0;
  for(const m of [...matches].sort((a,b)=>a.index-b.index)){if(m.index<at)continue;box.append(line.slice(at,m.index));const mark=k.el('mark',null,m.text||'∅');if(m.groups?.some(g=>g!==null))mark.title='Группы: '+m.groups.map((g,i)=>'$'+(i+1)+'='+(g??'—')).join(', ');box.append(mark);at=m.index+m.text.length;}
  box.append(line.slice(at));return box;
 }
 window.renderRegexCard=(parent,r)=>{
  const k=window.resultKit;if(!k||!r||parent.querySelector('.regex-card'))return;
  const literal='/'+r.pattern+'/'+(r.flags||'');
  const body=k.el('div','regex-body');
  if(r.error)body.append(k.el('p','regex-warn',r.error));
  if(r.summary)body.append(k.el('p','regex-summary',r.summary));
  if(r.parts?.length){const ul=k.el('ul','regex-parts');for(const p of r.parts){const li=k.el('li');li.append(k.el('code',null,p.part),k.el('span',null,p.meaning));ul.append(li);}body.append(ul);}
  if(r.rows?.length){
   const ul=k.el('ul','regex-lines');
   for(const row of r.rows){
    const checked=row.expect!==undefined,good=checked?row.ok:row.matches.length>0;
    const li=k.el('li',checked?(row.ok?'ok':'bad'):(good?'ok':''));
    li.append(k.el('span','mark',checked?(row.ok?'✓':'✗'):(good?'●':'○')),highlighted(k,row.line,row.matches));
    if(checked)li.append(k.el('span','expect',row.expect==='match'?'должна совпасть':'не должна'));
    li.setAttribute('aria-label',row.line+(checked?(row.ok?' — верно':' — ошибка'):(good?' — совпадает':' — не совпадает')));
    ul.append(li);
   }
   body.append(ul);
  }
  if(r.risky)body.append(k.el('p','regex-warn','Вложенные квантификаторы: на длинных строках выражение может работать очень долго.'));
  const status=r.mode==='error'?{label:'ошибка',tone:'alert'}:r.mode==='draft'?{label:r.verified?'проверено на примерах':'есть ошибки',tone:r.verified?'done':'alert'}:r.rows?.length?{label:r.rows.filter(x=>x.matches.length).length+' из '+r.rows.length+' совпало',tone:'accent'}:null;
  const actions=[{label:'Скопировать',run:()=>copy(k,literal)}];
  if(r.mode!=='error')actions.push({label:'Проверить на строках…',run:()=>k.ask('Проверь регулярку '+literal+' на строках:\n')});
  if(!r.parts?.length&&r.mode!=='error')actions.push({label:'Объясни по частям',run:()=>k.ask('Объясни регулярку '+literal,{send:true})});
  parent.append(k.card({app:'Регулярки',initial:'.*',color:'#4a5f8a',key:literal,status,body,actions,className:'regex-card'}));
 };
 const NAMES=['минуты','часы','день месяца','месяц','день недели'];
 window.renderCronCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.regex-card'))return;
  const body=k.el('div','regex-body');
  if(c.error)body.append(k.el('p','regex-warn',c.error));
  else{
   body.append(k.el('p','regex-summary',c.description[0].toUpperCase()+c.description.slice(1)+'.'));
   const fields=k.el('div','cron-fields');c.fields.forEach((f,i)=>{const box=k.el('div','cron-field');box.append(k.el('code',null,f),k.el('small',null,NAMES[i]));fields.append(box);});body.append(fields);
   if(c.runs?.length){
    body.append(k.el('small','kit-meta','Ближайшие запуски (время этого компьютера)'));
    const ul=k.el('ul','cron-runs');
    for(const iso of c.runs){const d=new Date(iso),li=k.el('li');li.append(k.el('span',null,d.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'})),k.el('span',null,d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})));ul.append(li);}
    body.append(ul);
   }
  }
  const actions=c.error?[]:[{label:'Скопировать',run:()=>copy(k,c.expression)},{label:'Изменить словами…',run:()=>k.ask('Составь cron: ')}];
  parent.append(k.card({app:'Cron',initial:'⏱',color:'#4a5f8a',key:c.expression,status:c.error?{label:'ошибка',tone:'alert'}:c.drafted?{label:'составлено',tone:'accent'}:null,body,actions,className:'regex-card'}));
 };
})();
