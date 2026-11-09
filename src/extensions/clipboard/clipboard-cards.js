// «История буфера», renderer: a week of copies as bars (text and pictures), the numbered copies (#1 is the newest)
// with the searched words marked, a preview of pictures, «В буфер» per row; for «ссылку … в задачу BW-12» a
// confirmation with the exact link and issue, sent only by the tracker's button (k.links('task-tracker')).
// Pause / resume and «Стереть всё» (asks first) in the actions.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('clipboard-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('clipboard',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const norm=v=>String(v||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
 const termsOf=q=>[...new Set(norm(q).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=2).map(w=>w.length>5?w.slice(0,w.length-2):w))];
 const SAFE_IMG=/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/;

 // Text with the query's words in <mark>, built from text nodes only.
 function marked(k,text,terms){
  const box=k.el('div','clip-text');box.dataset.noI18n='';
  if(!terms.length){box.textContent=text;return box;}
  const low=norm(text);let at=0;
  while(at<text.length){
   let best=-1,len=0;for(const t of terms){const i=low.indexOf(t,at);if(i>=0&&(best<0||i<best)){best=i;len=t.length;}}
   if(best<0){box.append(text.slice(at));break;}
   box.append(text.slice(at,best));box.append(k.el('mark',null,text.slice(best,best+len)));at=best+len;
  }
  return box;
 }
 function week(k,days){
  const box=k.el('div','clip-week');box.setAttribute('role','img');
  const total=days.reduce((a,d)=>a+d.texts+d.images,0),max=Math.max(1,...days.map(d=>d.texts+d.images));
  box.setAttribute('aria-label','Копий за 7 дней: '+total);
  for(const d of days){
   const col=k.el('div','clip-day');const bar=k.el('div','clip-day-bar');
   const t=k.el('span','clip-day-text'),i=k.el('span','clip-day-image');
   t.style.height=(100*d.texts/max).toFixed(1)+'%';i.style.height=(100*d.images/max).toFixed(1)+'%';
   bar.append(i,t);bar.title='текст: '+d.texts+' · картинки: '+d.images;
   const n=k.el('span','clip-day-n',String(d.texts+d.images||''));
   col.append(n,bar,k.el('span','clip-day-label',new Date(d.day).toLocaleDateString(locale(),{weekday:'short'})));box.append(col);
  }
  const legend=k.el('div','clip-legend');
  const a=k.el('span','clip-legend-item');a.append(k.el('span','clip-swatch text'),'текст');
  const b=k.el('span','clip-legend-item');b.append(k.el('span','clip-swatch image'),'картинки');
  legend.append(a,b,k.el('span','clip-muted','за 7 дней: '+total));
  const wrap=k.el('div','clip-week-wrap');wrap.append(box,legend);return wrap;
 }
 function row(k,item,terms){
  const li=k.el('div','clip-item'+(item.kind==='image'?' image':''));li.dataset.id=item.id;
  li.append(k.el('span','clip-n','#'+item.n));
  const main=k.el('div','clip-main');
  if(item.kind==='image'){
   const pic=k.el('div','clip-pic');const img=k.el('img');img.alt='';if(SAFE_IMG.test(item.thumb||''))img.src=item.thumb;pic.append(img);
   main.append(pic,k.el('span','clip-dim',item.width+'×'+item.height));
  }else main.append(marked(k,item.text+(item.long?'…':''),terms));
  const meta=k.el('div','clip-meta');
  const when=window.timeElement?window.timeElement(new Date(item.at)):k.el('span',null,new Date(item.at).toLocaleString(locale()));
  meta.append(when);
  if(item.app){const app=k.el('span','clip-app',item.app);app.dataset.noI18n='';meta.append(' · ',app);}
  main.append(meta);
  const copy=k.el('button','clip-copy','В буфер');copy.type='button';
  copy.onclick=async()=>{copy.disabled=true;try{const r=await call('copy',item.id);k.toast(r.text);}catch(e){k.toast(e.message,{error:true});}finally{copy.disabled=false;}};
  li.append(main,copy);return li;
 }
 function linkConfirm(k,d,setStatus){
  const box=k.el('div','clip-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение');
  const head=k.el('p','clip-confirm-title');head.append('Добавить в ');const key=k.el('strong',null,d.link.issue);key.dataset.noI18n='';head.append(key,' комментарий со ссылкой:');
  const url=k.el('code','clip-url',d.link.url);url.dataset.noI18n='';
  const hint=k.el('small','clip-muted','Петя добавит комментарий только по вашему нажатию.');
  const none=k.el('small','clip-muted','Чтобы добавить ссылку в задачу, подключите Jira в настройках. Пока ссылку можно скопировать.');none.hidden=true;
  const actions=k.el('div','clip-confirm-actions');
  const tracker=k.links('task-tracker',{issue:d.link.issue,comment:d.link.url,title:'Ссылка из буфера'},{context:{comment:true},primary:true,label:p=>'Добавить в '+d.link.issue+' · '+p.name,
   onDone:result=>{if(!result?.done)return;setStatus({label:'добавлено',tone:'done'});hint.hidden=false;hint.textContent='Готово: комментарий в '+d.link.issue+'.';
    // Written once: the button goes away so a second press cannot add the same comment again.
    tracker.hidden=true;if(result.url&&k.safeUrl(result.url)){const a=k.el('a',null,'Открыть '+d.link.issue);a.href=result.url;a.target='_blank';a.rel='noopener';actions.prepend(a);}}});
  const copy=k.el('button',null,'Скопировать ссылку');copy.type='button';copy.onclick=async()=>{try{await call('copyLink',d.link.id,d.link.url);k.toast('Ссылка в буфере');}catch(e){k.toast(e.message,{error:true});}};
  actions.append(tracker,copy);
  (k.availableLinks?.('task-tracker',{comment:true})||Promise.resolve([])).then(list=>{none.hidden=!!list?.length;hint.hidden=!list?.length;}).catch(()=>{none.hidden=false;});
  box.append(head,url,actions,hint,none);return box;
 }

 window.renderClipboardHistory=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.clip-card'))return;
  const terms=d.mode==='search'?termsOf(d.query):[];
  const body=k.el('div','clip-body');
  let node=null;
  const setStatus=st=>{node?.querySelector('.kit-card-head .kit-chip')?.replaceWith(k.chip(st));};
  if(d.mode==='link'&&d.link)body.append(linkConfirm(k,d,setStatus));
  if(d.mode!=='link')body.append(week(k,d.days||[]));
  if(d.mode==='paste'&&d.pasted){const p=k.el('div','clip-pasted','Сейчас в буфере — #'+d.pasted.n+'. Вставляйте как обычно.');body.append(p);}
  const list=(d.items||[]).map(i=>row(k,i,terms));
  if(list.length){
   const stack=k.collapse(list,d.mode==='paste'?3:8,'Ещё');stack.classList.add('clip-list');
   if(d.mode==='paste')list[0].classList.add('current');
   body.append(stack);
  }else body.append(k.el('p','clip-muted',d.mode==='search'?'Ничего не нашлось. Пароли и токены в историю не попадают.':d.status?.enabled?'История пуста — скопируйте что-нибудь.':'История выключена.'));
  const st=d.status||{};
  const status=d.mode==='link'?{label:'ждёт подтверждения',tone:'progress'}:!st.enabled?{label:'выключено',tone:'alert'}:st.paused?{label:'пауза',tone:'progress'}:{label:'запоминает',tone:'done'};
  const meta=['записей: '+(st.count||0)+' из '+(st.limit||200),'не старше '+(st.days||7)+' дней',st.encrypted?'зашифровано':'без шифрования системы'];
  if(st.skipped&&st.skipped.secret+st.skipped.manager)meta.push('пропущено секретов: '+(st.skipped.secret+st.skipped.manager));
  const key=d.mode==='search'?'«'+d.query+'»':d.mode==='link'?d.link?.issue:d.mode==='paste'?'Вернул в буфер':'Буфер обмена';
  const actions=[];
  if(d.mode==='paste'&&d.pasted?.previous)actions.push({label:'Вернуть прежнее',run:async()=>{const r=await call('copy',d.pasted.previous);k.toast(r.text);}});
  if(st.enabled)actions.push(st.paused?{label:'Продолжить',run:async()=>{await call('resume');setStatus({label:'запоминает',tone:'done'});k.toast('История буфера снова запоминает копии');}}:{label:'Пауза на час',run:async()=>{await call('pause',60);setStatus({label:'пауза',tone:'progress'});k.toast('История буфера на паузе на час');}});
  else actions.push({label:'Включить историю',run:async()=>{await call('enable',true);setStatus({label:'запоминает',tone:'done'});k.toast('История буфера включена');}});
  const wipe=(window.deleteButton||((label,fn)=>{const b=k.el('button',null,label);b.onclick=fn;return b;}))('Стереть всю историю буфера',()=>{
   if(body.querySelector('.clip-wipe'))return;
   const box=k.el('div','clip-confirm clip-wipe');box.append(k.el('p',null,'Стереть всю историю буфера ('+(st.count||0)+' записей)? Это нельзя отменить.'));
   const go=k.el('button','primary','Стереть всё');go.type='button';const no=k.el('button',null,'Отмена');no.type='button';no.onclick=()=>box.remove();
   go.onclick=async()=>{go.disabled=true;try{const r=await call('wipe');k.toast('История буфера стёрта: '+r.removed);box.remove();body.querySelector('.clip-list')?.replaceWith(k.el('p','clip-muted','История пуста.'));}catch(e){k.toast(e.message,{error:true});go.disabled=false;}};
   const row=k.el('div','clip-confirm-actions');row.append(go,no);box.append(row);body.append(box);go.focus();
  });
  wipe.classList.add('clip-wipe-button');actions.push(wipe);
  node=k.card({app:'История буфера',initial:'⎘',color:'#5a5f8a',key,status,body,meta,className:'clip-card',actions});
  if(d.mode==='search'||d.mode==='link')node.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  parent.append(node);
 };
})();
