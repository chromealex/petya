// «Pull requests», renderer: a list of PRs (author, +/− bar, checks, review state, age) and one PR with
// summary bullets, checks and a files-changed bar chart. «Оставить комментарий…» opens a text box; the comment
// is sent only after «Отправить» in a confirmation row.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('pr-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=n=>Number(n||0).toLocaleString(locale());
 const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);if(!Number.isFinite(m))return '';if(m<60)return Math.max(1,m)+' мин назад';const h=Math.round(m/60);if(h<24)return h+' ч назад';const d=Math.round(h/24);if(d<45)return d+' дн назад';return new Date(iso).toLocaleDateString(locale(),{day:'numeric',month:'short'});};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const CHECKS={success:['проверки прошли','done'],failure:['проверки упали','alert'],pending:['проверки идут','progress'],none:['без проверок','']};
 const REVIEW={approved:['одобрен','done'],changes:['нужны правки','alert'],pending:['ждёт ревью','progress'],commented:['есть комментарии',''],none:['без ревью','']};
 const chip=(k,map,state,title)=>k.chip({label:(map[state]||map.none)[0],tone:(map[state]||map.none)[1],title});
 const open=(k,url)=>{const safe=k.safeUrl(url||'');if(safe)window.open(safe,'_blank','noopener');};
 // Green/red bar of added and removed lines; `scale` is the largest change in the card.
 function diffBar(k,add,del,scale){
  const box=k.el('div','pr-diff');box.setAttribute('aria-label','+'+num(add)+' −'+num(del)+' строк');
  const bar=k.el('div','pr-diff-bar'),total=Math.max(1,(add||0)+(del||0)),width=Math.max(6,Math.round(100*Math.sqrt(total)/Math.sqrt(Math.max(scale,1))));
  bar.style.width=width+'%';const a=k.el('span','pr-add');a.style.flexGrow=String(add||0);const d=k.el('span','pr-del');d.style.flexGrow=String(del||0);if(!add&&!del)bar.classList.add('empty');bar.append(a,d);
  const nums=k.el('span','pr-diff-nums');nums.append(k.el('span','pr-plus','+'+num(add)),k.el('span','pr-minus','−'+num(del)));
  box.append(bar,nums);return box;
 }
 function checksTitle(c){return c?['прошло: '+c.passed,'упало: '+c.failed,'идёт: '+c.pending].join(', '):'Нет данных о проверках';}

 function listRow(k,i,scale){
  const li=k.el('li','pr-row');
  const who=k.avatar(i.author,{size:26});who.classList.add('pr-avatar');who.title=i.author;
  const main=k.el('div','pr-main');
  const title=raw(k.el(k.safeUrl(i.url)?'a':'span','pr-title',i.title));if(title.tagName==='A'){title.href=k.safeUrl(i.url);title.target='_blank';title.rel='noopener';}
  const meta=k.el('div','pr-meta');meta.append(raw(k.el('span','pr-ref',i.repo+'#'+i.number)),raw(k.el('span',null,i.author)),k.el('span',null,ago(i.updatedAt||i.createdAt)));
  if(i.draft)meta.append(k.el('span','pr-draft','черновик'));
  main.append(title,meta);
  const side=k.el('div','pr-side');
  if(i.additions!==null&&i.additions!==undefined)side.append(diffBar(k,i.additions,i.deletions,scale));
  const chips=k.el('div','pr-chips');chips.append(chip(k,CHECKS,i.checks?.state||'none',checksTitle(i.checks)),chip(k,REVIEW,i.review||'none'));side.append(chips);
  const actions=k.el('div','pr-row-actions');
  const b1=k.el('button',null,'Открыть');b1.type='button';b1.onclick=()=>open(k,i.url);
  const b2=k.el('button',null,'Резюме');b2.type='button';b2.title='Петя перескажет PR по диффу';b2.onclick=()=>k.ask('Резюме пулл-реквеста '+i.repo+'#'+i.number,{send:true});
  actions.append(b1,b2);
  li.append(who,main,side,actions);
  return li;
 }
 function list(k,c){
  const body=k.el('div','pr-body');
  if(!c.items?.length){body.append(k.el('p','pr-muted','Нет открытых PR.'));return body;}
  const scale=Math.max(...c.items.map(i=>(i.additions||0)+(i.deletions||0)),1);
  const ul=k.el('ul','pr-list');for(const i of c.items)ul.append(listRow(k,i,scale));body.append(ul);
  if(c.total>c.items.length)body.append(k.el('p','pr-muted','Показаны '+c.items.length+' из '+c.total+'.'));
  return body;
 }
 function files(k,list){
  const scale=Math.max(...list.map(f=>f.additions+f.deletions),1);
  const rows=list.map(f=>{const row=k.el('div','pr-file');const name=raw(k.el('span','pr-file-name',f.name.length>52?'…'+f.name.slice(-51):f.name));name.title=f.name;row.append(name,diffBar(k,f.additions,f.deletions,scale));if(f.status==='added'||f.status==='removed'||f.status==='renamed')row.classList.add(f.status);return row;});
  return k.collapse(rows,8,'Ещё файлы');
 }
 // Comment box → confirmation → send through the app (main process), which posts as the token's owner.
 function composer(k,card,pr){
  if(card.querySelector('.pr-compose'))return card.querySelector('.pr-compose textarea').focus();
  const box=k.el('div','kit-draft pr-compose');box.append(k.el('span','kit-draft-label','Комментарий в '+pr.repo+'#'+pr.number));
  const area=k.el('textarea');area.maxLength=5000;area.setAttribute('aria-label','Текст комментария');area.placeholder='Текст комментария (Markdown)';
  const row=k.el('div','kit-actions');const send=k.el('button','primary','Отправить…');send.type='button';const cancel=k.el('button',null,'Отмена');cancel.type='button';
  cancel.onclick=()=>box.remove();
  send.onclick=()=>{
   const text=area.value.trim();if(!text){k.toast('Напишите текст комментария',{error:true});area.focus();return;}
   if(box.querySelector('.pr-confirm'))return;
   const confirm=k.el('div','pr-confirm');confirm.setAttribute('role','group');confirm.append(k.el('span',null,'Отправить комментарий в '+pr.repo+'#'+pr.number+' от вашего имени?'));
   const yes=k.el('button','primary','Отправить');yes.type='button';const no=k.el('button',null,'Не отправлять');no.type='button';
   no.onclick=()=>{confirm.remove();area.disabled=false;};
   yes.onclick=async()=>{yes.disabled=no.disabled=true;yes.setAttribute('aria-busy','true');
    try{const r=await window.petya.feature('pullRequests','comment',pr.key,text);box.replaceChildren(k.el('span','kit-draft-label',r.text));if(k.safeUrl(r.url||'')){const a=k.el('a','pr-link','Открыть комментарий');a.href=k.safeUrl(r.url);a.target='_blank';a.rel='noopener';box.append(a);}}
    catch(e){k.toast(e.message,{error:true});yes.disabled=no.disabled=false;}finally{yes.removeAttribute('aria-busy');}};
   confirm.append(yes,no);area.disabled=true;box.append(confirm);
  };
  row.append(send,cancel);box.append(area,row);card.querySelector('.kit-actions').before(box);area.focus();
 }
 function single(k,p){
  const body=k.el('div','pr-body');
  const meta=k.el('div','pr-meta');meta.append(raw(k.el('span',null,p.author)));if(p.base||p.head)meta.append(raw(k.el('code','pr-branch',p.base+' ← '+p.head)));meta.append(k.el('span',null,ago(p.updatedAt||p.createdAt)));if(p.draft)meta.append(k.el('span','pr-draft','черновик'));
  body.append(meta);
  const totals=k.el('div','pr-totals');totals.append(diffBar(k,p.additions,p.deletions,(p.additions||0)+(p.deletions||0)),k.el('span','pr-muted','Файлов: '+num(p.files??(p.fileList||[]).length)));body.append(totals);
  if(p.summary?.bullets?.length){
   const sum=raw(k.el('div','pr-summary'));const ul=k.el('ul');for(const b of p.summary.bullets)ul.append(k.el('li',null,b));sum.append(ul);
   if(p.summary.risk)sum.append(k.el('p','pr-risk',p.summary.risk));body.append(sum);
  }else if(p.description)body.append(raw(k.el('p','pr-description',p.description)));
  if(p.checks?.list?.length){
   const head=k.el('div','pr-section-row');head.append(k.el('span','pr-section','Проверки'),chip(k,CHECKS,p.checks.state,checksTitle(p.checks)));body.append(head);
   const ul=k.el('ul','pr-checks');for(const c of p.checks.list){const li=k.el('li','pr-check '+c.status);li.append(k.el('span','pr-dot '+c.status));const n=raw(k.el(k.safeUrl(c.url)?'a':'span',null,c.name));if(n.tagName==='A'){n.href=k.safeUrl(c.url);n.target='_blank';n.rel='noopener';}li.append(n);ul.append(li);}
   body.append(ul);
  }
  if(p.fileList?.length){body.append(k.el('div','pr-section','Изменённые файлы'));body.append(files(k,p.fileList));}
  return body;
 }

 window.renderPrCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.pr-card'))return;
  let card;
  if(c.mode==='pr'){
   const actions=[{label:'Открыть',run:()=>open(k,c.url)}];
   if(!c.summarized)actions.push({label:'Резюме',primary:true,run:()=>k.ask('Резюме пулл-реквеста '+c.repo+'#'+c.number,{send:true})});
   actions.push({label:'Оставить комментарий…',run:()=>composer(k,card,c)});
   // Cross-app links: failing checks go to the Programmer or the tracker; a PR waiting for review to the team.
   const ref=c.repo+'#'+c.number,failed=(c.checks?.list||[]).filter(x=>x.status==='failure').map(x=>x.name);
   if(c.checks?.state==='failure'){
    actions.push(k.links('code-fix',{text:'Исправь код проекта, чтобы прошли проверки пулл-реквеста '+ref+(c.head?' (ветка '+c.head+')':'')+(failed.length?'. Упали: '+failed.slice(0,6).join(', '):'')+'. '+(c.url||'')}),
     k.links('task-tracker',{title:'Упали проверки в '+ref+': '+c.title,description:failed.length?'Упали: '+failed.slice(0,6).join(', '):'',link:c.url||'',type:'bug'}));
   }
   if(c.review==='pending'&&!c.draft)actions.push(k.links('share-message',{text:'посмотреть пулл-реквест '+ref+' «'+c.title+'»'+(c.author?' от '+c.author:'')+': '+(c.url||'')}));
   card=k.card({app:'Pull requests',initial:'⇄',color:'#5b4f8f',key:c.repo+'#'+c.number,href:c.url,status:{label:REVIEW[c.review]?.[0]||REVIEW.none[0],tone:REVIEW[c.review]?.[1]||''},
    chips:c.checks?.list?.length?[]:[chip(k,CHECKS,c.checks?.state||'none',checksTitle(c.checks))],title:c.title,body:single(k,c),actions,className:'pr-card'});
   card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
   card.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  }else{
   const failing=(c.items||[]).filter(i=>i.checks?.state==='failure').length;
   card=k.card({app:'Pull requests',initial:'⇄',color:'#5b4f8f',key:c.title,status:failing?{label:'упавшие проверки: '+failing,tone:'alert'}:null,subtitle:(c.repos||[]).join(', '),body:list(k,c),className:'pr-card pr-list-card'});
   card.querySelector('.kit-subtitle')?.setAttribute('data-no-i18n','');
  }
  parent.append(card);
 };
})();
