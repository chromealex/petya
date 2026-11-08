// «Патчноуты», renderer: the release's changes with include/exclude switches (internal and unfinished ones off, with
// the reason), tabs per language and per destination (App Store, Google Play, Discord/Telegram post, the team's
// changelog), a character counter against the store's limit, and the text whose every line names its sources on
// hover. Switches recount the texts without the model; «Перегенерировать в другом тоне» asks the model again.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('notes-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('patchNotes',method,...args);
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const DEST=[['appstore','App Store'],['play','Google Play'],['post','Discord / Telegram'],['internal','Для команды']];
 const GROUP={feature:'Новое',improvement:'Улучшения',fix:'Исправления'};
 const SOURCE={jira:'Jira',commit:'коммит',pr:'PR'};
 const TONES=['дружелюбный','весёлый','официальный','краткий','эпичный'];
 const num=n=>Number(n).toLocaleString(window.petyaLocale||'ru-RU');
 const copy=async(k,text)=>{try{await navigator.clipboard.writeText(text);k.toast('Скопировано');}catch{k.toast('Не удалось скопировать',{error:true});}};

 function sourceList(k,c,onToggle){
  const chosen=new Set(c.chosen);
  const box=k.el('section','pn-section');
  const head=k.el('h5','pn-head');head.append(k.el('span',null,'Изменения'),k.el('small','pn-picked',chosen.size+' из '+c.items.length+' в тексте'));box.append(head);
  const rows=[];
  for(const g of ['feature','improvement','fix']){
   const part=c.items.filter(i=>i.group===g);if(!part.length)continue;
   rows.push(k.el('div','pn-group',GROUP[g]+' · '+part.length));
   for(const i of part){
    const row=k.el('label','pn-item'+(chosen.has(i.id)?'':' off'));row.dataset.id=i.id;
    const box=k.el('input','kit-check');box.type='checkbox';box.checked=chosen.has(i.id);box.setAttribute('aria-label','Включить в патчноут: '+i.title);
    box.onchange=()=>{row.classList.toggle('off',!box.checked);onToggle(i.id,box.checked);};
    const ref=k.el(i.url?'a':'span','pn-ref '+i.source,i.ref);raw(ref);if(i.url){ref.href=k.safeUrl(i.url);ref.target='_blank';ref.rel='noopener';ref.onclick=e=>e.stopPropagation();}
    ref.title=SOURCE[i.source]+(i.also.length?' · также '+i.also.map(a=>a.ref).join(', '):'');
    const text=raw(k.el('span','pn-title',i.title));
    row.append(box,ref,text);
    if(i.internal)row.append(k.el('span','pn-why alert','внутреннее: '+i.internal));
    else if(!i.done)row.append(k.el('span','pn-why','не готово'));
    rows.push(row);
   }
  }
  // Long lists fold after whole groups, never between a group's title and its changes.
  let cut=rows.length;if(rows.length>18){cut=0;for(let i=0;i<rows.length;i++){if(rows[i].classList.contains('pn-group')&&i>=12)break;cut=i+1;}}
  box.append(k.collapse(rows,cut,'Показать все изменения'));
  return box;
 }
 function tabs(k,list,current,onPick,label,own=false){
  const bar=k.el('div','pn-tabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label',label);
  for(const [id,name] of list){const b=k.el('button','pn-tab',name);b.type='button';b.setAttribute('role','tab');b.dataset.tab=id;b.setAttribute('aria-selected',String(id===current));b.onclick=()=>onPick(id);if(own)raw(b);bar.append(b);}
  return bar;
 }
 function preview(k,c,view){
  const box=k.el('div','pn-preview');
  const byId=new Map(c.items.map(i=>[i.id,i]));
  for(const r of view.rows){
   const line=k.el('div','pn-row '+r.kind);raw(line);line.textContent=r.text;
   if(r.sources?.length){line.title=r.sources.map(id=>{const i=byId.get(id);return i?SOURCE[i.source]+' '+i.ref+' — '+i.title+(i.also.length?' ('+i.also.map(a=>a.ref).join(', ')+')':''):id;}).join('\n');line.tabIndex=0;line.dataset.sources=r.sources.join(' ');}
   box.append(line);
  }
  if(!view.rows.length)box.append(k.el('div','pn-row empty','Текста нет — включите изменения выше.'));
  return box;
 }
 function counter(k,view){
  const box=k.el('div','pn-counter');
  if(!view.limit){box.append(k.el('span','pn-count',num(view.count)+' символов'));return box;}
  const share=view.count/view.limit,tone=share>1?'over':share>=0.9?'near':'ok';
  const bar=k.el('span','pn-bar');const fill=k.el('span','pn-fill '+tone);fill.style.width=Math.min(100,share*100)+'%';bar.append(fill);
  bar.setAttribute('role','meter');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(view.limit));bar.setAttribute('aria-valuenow',String(view.count));bar.setAttribute('aria-label','Символов');
  box.append(bar,k.el('span','pn-count '+tone,num(view.count)+' / '+num(view.limit)));
  if(view.dropped)box.append(k.el('span','pn-dropped','не влезло строк: '+view.dropped));
  return box;
 }

 window.renderPatchNotes=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.pn-card'))return;
  // The text answer is the short summary; the card holds the texts.
  for(const node of [...parent.querySelectorAll(':scope>p,:scope>ul,:scope>ol')].slice(1))node.remove();
  const state={lang:c.languages[0]||'',dest:c.dest||'appstore'};
  if(!state.lang&&state.dest!=='internal')state.dest='internal';
  const body=k.el('div','pn-body');
  const area=k.el('div','pn-area');
  const hint=k.el('p','pn-hint');hint.hidden=true;
  const current=()=>state.dest==='internal'?c.internal:c.texts?.[state.lang]?.[state.dest];
  function paint(){
   area.replaceChildren();
   if(c.languages.length>1)area.append(tabs(k,c.languages.map(l=>[l,l.toUpperCase()]),state.lang,id=>{state.lang=id;paint();},'Язык',true));
   area.append(tabs(k,DEST.filter(([id])=>id==='internal'||c.languages.length),state.dest,id=>{state.dest=id;paint();},'Куда'));
   const view=current();if(!view)return;
   area.append(counter(k,view),preview(k,c,view));
  }
  let timer=null;
  const toggle=(id,on)=>{
   const set=new Set(c.chosen);on?set.add(id):set.delete(id);c.chosen=[...set];
   body.querySelector('.pn-picked').textContent=c.chosen.length+' из '+c.items.length+' в тексте';
   // A change switched on that no line describes yet needs the model.
   const cited=new Set(Object.values(c.notes||{}).flatMap(n=>n.lines.flatMap(l=>l.sources)));
   hint.hidden=!c.chosen.some(x=>!cited.has(x));hint.textContent='Новые включённые изменения появятся в тексте после «Перегенерировать».';
   clearTimeout(timer);timer=setTimeout(async()=>{try{const r=await call('compose',{id:c.id,chosen:c.chosen});c.texts=r.texts;c.internal=r.internal;paint();}catch(e){k.toast(e.message,{error:true});}},150);
  };
  body.append(sourceList(k,c,toggle),hint,area);
  for(const w of c.warnings||[])body.append(raw(k.el('p','pn-warn',w)));
  paint();
  const textNow=()=>current()?.text||'';
  const regenerate=async button=>{
   await k.menu(button,async()=>TONES.map(t=>({label:t,id:t,current:t===c.tone})),async option=>{
    button.disabled=true;button.setAttribute('aria-busy','true');
    try{const next=await call('regenerate',{id:c.id,tone:option.id,chosen:c.chosen});const host=card.parentNode;card.remove();window.renderPatchNotes(host,next);k.toast('Переписал: '+option.label);}
    catch(e){k.toast(e.message,{error:true});}finally{button.disabled=false;button.removeAttribute('aria-busy');}
   });
  };
  const actions=[{label:'Скопировать',primary:true,run:()=>copy(k,textNow())},
   k.links('share-message',()=>({text:'опубликовать '+(state.dest==='internal'?'чейнджлог':'анонс обновления')+' «'+c.title+'»: '+textNow()})),
   {label:'Перегенерировать в другом тоне',title:'Сейчас: '+c.tone,run:b=>regenerate(b)}];
  const used=c.chosen.length;
  const card=k.card({app:'Патчноуты',initial:'✎',color:'#7a5c9a',key:c.title,status:{label:'в тексте: '+used,tone:'accent'},
   subtitle:(c.sources||[]).join(' · '),body,actions,className:'pn-card'});
  raw(card.querySelector('.kit-subtitle')||k.el('span'));
  parent.append(card);
 };
})();
