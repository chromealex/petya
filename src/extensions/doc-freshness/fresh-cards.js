// «Свежесть документации», renderer: a bar of the findings by kind, then documents ordered by staleness — each with a
// staleness meter, when it was edited and how far the code moved on since, and its findings: the document's line
// (the reference highlighted) next to the git change (commit, date, author, what changed). «Создать задачу» goes
// through the `task-tracker` link; «Предложить правку» shows the exact line change of a project document and writes
// it only on «Применить правку» (with «Отменить»), or hands the fix to the Programmer (`code-fix`); for Confluence and
// Google Docs it only shows the corrected line to copy.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('fresh-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const date=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'});};
 const call=(method,...args)=>window.petya.feature('docFreshness',method,...args);
 const PROBLEM={missing:['файл удалён','alert'],renamed:['переименовано','alert'],removed:['удалено из кода','alert'],value:['значение изменилось','progress'],version:['версия изменилась','progress'],changed:['код изменился после правки','']};
 const ORDER=['missing','renamed','removed','value','version','changed'];
 const SOURCE={project:'репозиторий',confluence:'Confluence',google:'Google Документы'};
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};

 function overview(k,c){
  const box=k.el('div','fresh-overview');
  const counts=ORDER.map(p=>[p,c.totals.byProblem[p]||0]).filter(([,n])=>n);
  const total=counts.reduce((n,[,x])=>n+x,0)||1;
  const bar=k.el('div','fresh-bar');
  for(const [p,n] of counts){const seg=k.el('span','seg p-'+p);seg.style.width=(100*n/total)+'%';seg.title=(window.t?window.t(PROBLEM[p][0]):PROBLEM[p][0])+': '+n;bar.append(seg);}
  const legend=k.el('div','fresh-legend');
  for(const [p,n] of counts){const s=k.el('span');s.append(k.el('i','p-'+p),k.el('span',null,PROBLEM[p][0]),raw(k.el('b',null,String(n))));legend.append(s);}
  const head=k.el('div','fresh-head');
  head.append(raw(k.el('b',null,String(c.totals.docs))),k.el('span',null,'устаревших из'),raw(k.el('b',null,String(c.totals.scanned))),k.el('span',null,'проверенных документов'));
  box.append(head);if(counts.length)box.append(bar,legend);
  return box;
 }

 // The line with the reference highlighted (text nodes only).
 function line(k,text,value){
  const p=raw(k.el('code','fresh-line selectable'));
  const at=value?String(text).indexOf(value):-1;
  if(at<0){p.textContent=text;return p;}
  p.append(document.createTextNode(text.slice(0,at)),raw(k.el('mark',null,value)),document.createTextNode(text.slice(at+value.length)));
  return p;
 }

 function finding(k,c,doc,f){
  const row=k.el('article','fresh-finding sev-'+f.severity);row.dataset.finding=f.id;
  const [label,tone]=PROBLEM[f.problem]||[f.problem,''];
  const top=k.el('div','fresh-finding-head');top.append(k.chip({label,tone}),raw(k.el('span','fresh-ref',f.ref.value)));
  row.append(top);
  const grid=k.el('div','fresh-pair');
  const left=k.el('div','fresh-side');left.append(k.el('div','fresh-side-head','В документе · строка '+f.line.n),line(k,f.line.text,f.ref.value));
  const right=k.el('div','fresh-side git');
  const head=k.el('div','fresh-side-head');head.append(k.el('span',null,'В git · '));
  const sha=raw(k.el(f.change.url?'a':'span','fresh-sha',f.change.short));if(f.change.url){sha.href=f.change.url;sha.target='_blank';sha.rel='noopener';}
  head.append(sha,k.el('span','fresh-muted',' '+date(f.change.date)));
  right.append(head,raw(k.el('div','fresh-subject selectable',f.change.subject)),raw(k.el('div','fresh-muted',f.change.author)));
  if(f.detail)right.append(raw(k.el('div','fresh-detail selectable',f.detail)));
  grid.append(left,right);row.append(grid);
  // Proposed edit: the exact line change, applied only by a press.
  const diff=k.el('div','fresh-diff');diff.hidden=true;
  if(f.suggestion?.line){
   diff.append(raw(k.el('div','fresh-old selectable','− '+f.line.text)),raw(k.el('div','fresh-new selectable','+ '+f.suggestion.line)));
   const bar=k.el('div','fresh-diff-actions');
   if(doc.source==='project'){
    const apply=k.el('button','primary','Применить правку');apply.type='button';apply.title='Заменит строку '+f.line.n+' в '+doc.path;
    apply.onclick=async e=>{e.stopPropagation();apply.disabled=true;
     try{const r=await call('applyEdit',c.checkId,f.id);apply.textContent=window.t?window.t('Правка применена'):'Правка применена';row.classList.add('fixed');
      k.toast(r?.text||'Исправлено',{undo:async()=>{const u=await call('applyEdit',c.checkId,f.id,true);apply.disabled=false;apply.textContent=window.t?window.t('Применить правку'):'Применить правку';row.classList.remove('fixed');return u;}});}
     catch(err){apply.disabled=false;k.toast(err.message,{error:true});}};
    bar.append(apply);
   }else{
    const copy=k.el('button',null,'Скопировать строку');copy.type='button';
    copy.onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(f.suggestion.line);k.toast('Строка скопирована — вставьте её в документ');}catch(err){k.toast(err.message,{error:true});}};
    bar.append(copy);
   }
   diff.append(bar);
  }
  row.append(diff);
  const actions=k.el('div','fresh-actions');
  const where=doc.source==='project'?doc.path+':'+f.line.n:doc.title;
  const description='Строка '+f.line.n+': «'+f.line.text.trim().slice(0,300)+'». '+label+': '+(f.detail||'')+' (коммит '+f.change.short+' от '+date(f.change.date)+', '+f.change.author+': '+f.change.subject+').';
  actions.append(k.links('task-tracker',()=>({title:'Обновить документацию: '+where,description,link:doc.url||f.change.url||''}),{label:'Создать задачу'}));
  if(f.suggestion?.line){
   const show=k.el('button',null,'Предложить правку');show.type='button';
   show.onclick=e=>{e.stopPropagation();diff.hidden=!diff.hidden;show.setAttribute('aria-expanded',String(!diff.hidden));};
   actions.append(show);
  }else if(doc.source==='project'){
   actions.append(k.links('code-fix',()=>({text:'Обнови документацию '+doc.path+' (только документ, код не меняй): строка '+f.line.n+' «'+f.line.text.trim().slice(0,300)+'» — '+label+'. '+(f.detail||'')+'. Коммит '+f.change.short+': '+f.change.subject+'.'}),{label:'Предложить правку',title:'«Программист» подготовит правку документа в своей ветке — вы увидите diff до того, как он попадёт в проект'}));
  }
  row.append(actions);
  return row;
 }

 function documentRow(k,c,doc,i){
  const box=document.createElement('details');box.className='fresh-doc';if(i<2)box.open=true;
  const sum=document.createElement('summary');
  const meter=k.el('span','fresh-meter');const level=Math.min(5,Math.ceil(doc.score/2));
  for(let n=1;n<=5;n++)meter.append(k.el('i',n<=level?'on l'+level:''));
  meter.title=(window.t?window.t('Устарелость'):'Устарелость')+': '+doc.score;
  const title=raw(k.el('span','fresh-title',doc.title));
  sum.append(meter,k.chip({label:SOURCE[doc.source]||doc.source}),title);
  const meta=k.el('span','fresh-meta');
  if(doc.edited){meta.append(k.el('span',null,'правка '),window.timeElement?window.timeElement(doc.edited):k.el('span',null,date(doc.edited)));}
  if(doc.lag>0)meta.append(k.el('span','fresh-lag',' · код ушёл вперёд на '+doc.lag+' '+plural(doc.lag,['день','дня','дней'])));
  meta.append(k.el('span',null,' · '+doc.findings.length+' '+plural(doc.findings.length,['место','места','мест'])));
  sum.append(meta);
  box.append(sum);
  if(doc.url){const a=k.el('a','fresh-open','Открыть документ');a.href=doc.url;a.target='_blank';a.rel='noopener';box.append(a);}
  for(const f of doc.findings)box.append(finding(k,c,doc,f));
  return box;
 }

 window.renderFreshnessCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.totals||parent.querySelector('.fresh-card'))return;
  const body=k.el('div','fresh-body');
  body.append(overview(k,c));
  if(!c.docs.length)body.append(k.el('p','fresh-empty',c.totals.scanned?'Расхождений с кодом не нашёл.':'Документов для проверки нет.'));
  const list=k.el('div','fresh-docs');c.docs.forEach((d,i)=>list.append(documentRow(k,c,d,i)));body.append(list);
  if(c.notes?.length){const notes=k.el('ul','fresh-notes');for(const n of c.notes)notes.append(raw(k.el('li',null,n)));body.append(notes);}
  const used=[c.used.project?'репозиторий: '+c.used.project:'',c.used.confluence!=null?'Confluence: '+c.used.confluence:'',c.used.google!=null?'Google Документы: '+c.used.google:''].filter(Boolean);
  const card=k.card({app:'Свежесть документации',initial:'С',color:'#6b6a3a',status:c.docs.length?{label:'есть устаревшее',tone:'alert'}:{label:'всё свежо',tone:'done'},subtitle:c.repo.name,body,className:'fresh-card',
   meta:[...used,c.weekly?'еженедельная проверка включена':'проверка по запросу'],
   actions:[{label:'Проверить снова',run:()=>k.ask('Проверь свежесть документации',{send:true})}]});
  parent.append(card);
 };
})();
