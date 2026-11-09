// «Вики из обсуждений», renderer: the page draft from a thread or a meeting — the discussion as a timeline of messages
// by author, the counts (outcomes, open questions, quotes) and the owner from «Команда», the diff against the existing
// page when it is an update, the editable Markdown, and where to publish. «Опубликовать» sends exactly the editor's text
// through the app's IPC (Confluence, Notion, or an update of a Google Doc); a new Google Doc goes through the
// `document-export` link («Google Диск» previews it first). Nothing is published before a press.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('wiki-cards.css',document.currentScript.src).href;document.head.append(style);
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const call=(method,...args)=>window.petya.feature('wikiAuthor',method,...args);
 const SERVICE={confluence:'Confluence',notion:'Notion',google:'Google Документы'};
 const COLORS=['#86c2ff','#c9ed9d','#e5ce8c','#f0b4a8','#c5b3f0','#9fe0d8','#f2a7d0','#d8d8a0'];
 const open=url=>{if(!url)return;if(window.openChatBrowser)window.openChatBrowser(url);else window.open(url,'_blank','noopener');};
 const initials=name=>String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();

 function timeline(k,c){
  const box=k.el('div','wiki-thread');
  const people=[...new Set(c.timeline.map(m=>m.author))];
  const color=name=>COLORS[people.indexOf(name)%COLORS.length];
  const times=c.timeline.map(m=>Date.parse(m.at)).filter(Number.isFinite);
  const a=Math.min(...times),b=Math.max(...times),span=Math.max(1,b-a);
  const track=k.el('div','wiki-track');
  // Positions by time, pushed apart so that close messages do not cover each other.
  const gap=Math.min(6,92/Math.max(1,c.timeline.length-1));
  const pos=c.timeline.map((m,i)=>c.timeline.length===1?50:4+92*(((Date.parse(m.at)-a)/span)||0));
  for(let i=1;i<pos.length;i++)pos[i]=Math.max(pos[i],pos[i-1]+gap);
  for(let i=pos.length-1;i>=0;i--)pos[i]=Math.min(pos[i],(i===pos.length-1?96:pos[i+1]-gap));
  c.timeline.forEach((m,i)=>{
   const dot=raw(k.el(m.url?'a':'span','wiki-dot',initials(m.author)));
   dot.style.left=pos[i]+'%';
   dot.style.background=color(m.author);dot.title=m.author+' · #'+(i+1);
   if(m.url){dot.href=m.url;dot.onclick=e=>{e.preventDefault();open(m.url);};}
   track.append(dot);
  });
  const legend=k.el('div','wiki-legend');
  legend.append(k.el('span',null,(c.meeting?'Пунктов сводки: ':'Сообщений: ')+c.timeline.length));
  const who=k.el('span','wiki-people');
  for(const p of (c.meeting?[]:people).slice(0,6)){const x=k.el('span','wiki-person');const i=k.el('i');i.style.background=color(p);x.append(i,raw(k.el('span',null,p)));who.append(x);}
  legend.append(who);
  box.append(track,legend);
  return box;
 }
 window.renderWikiCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.wiki-card'))return;
  const body=k.el('div','wiki-body');
  const mode=k.el('div','wiki-mode');
  if(c.page){mode.append(k.el('span','wiki-mode-label','Обновление страницы'),raw(k.el('b',null,'«'+c.page.title+'»')),k.chip({label:SERVICE[c.page.service]}));}
  else mode.append(k.el('span','wiki-mode-label','Новая страница'),k.el('span','wiki-muted',c.meeting?'по сводке встречи':'по треду'));
  body.append(mode);
  if(c.timeline?.length)body.append(timeline(k,c));
  const chips=k.el('div','wiki-chips');
  chips.append(k.chip({label:'итогов: '+c.decisions,tone:c.decisions?'done':'alert'}),k.chip({label:'открытых вопросов: '+c.open}),k.chip({label:'цитат: '+c.quotes.length}));
  const owner=c.owner?k.chip({label:'ответственный: '+c.owner.name,tone:'done',title:c.owner.why}):k.chip({label:'ответственный: уточнить',tone:'alert',title:'Никого из участников нет в «Команде»'});
  chips.append(owner);
  body.append(chips);
  if(c.page?.ops?.length){
   body.append(k.el('div','wiki-head','Что изменится на странице'));
   const d=raw(k.el('p','wiki-diff selectable'));
   for(const o of c.page.ops)d.append(o.op==='eq'?k.el('span','wiki-eq',o.text):k.el(o.op==='ins'?'ins':'del',null,o.text));
   body.append(d);
  }
  body.append(k.el('div','wiki-head','Текст страницы'));
  const area=document.createElement('textarea');area.className='wiki-text';area.value=c.text;area.spellcheck=false;area.rows=Math.min(14,Math.max(8,c.text.split('\n').length));area.setAttribute('aria-label','Текст страницы');
  body.append(area);
  // Where to publish.
  let dest=c.dest||'';
  const where=k.el('div','wiki-dest');
  const parentInput=document.createElement('input');parentInput.type='url';parentInput.className='wiki-parent';parentInput.placeholder='Ссылка на родительскую страницу Notion';
  const paint=()=>{for(const b of where.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.dest===dest));parentInput.hidden=!(dest==='notion'&&!c.page);publish.hidden=dest==='google'&&!c.page;};
  if(!c.page&&c.destinations.length){
   where.append(k.el('span','wiki-muted','Куда:'));
   for(const d of c.destinations){const b=k.el('button','wiki-dest-btn',SERVICE[d]);b.type='button';b.dataset.dest=d;b.onclick=e=>{e.stopPropagation();dest=d;paint();};where.append(b);}
   body.append(where,parentInput);
  }else if(!c.page){body.append(k.el('p','wiki-muted','Подключите Confluence или Notion в «Подключениях», чтобы опубликовать; в Google Документы — через «Google Диск».'));}
  const status=k.chip({label:'черновик',tone:'progress'});
  let done=false;
  const markDone=url=>{done=true;status.textContent=window.t?window.t('опубликовано'):'опубликовано';status.className='kit-chip tone-done';area.readOnly=true;publish.disabled=true;publish.textContent=window.t?window.t('Опубликовано'):'Опубликовано';if(url){openBtn.hidden=false;openBtn.onclick=e=>{e.stopPropagation();open(url);};}};
  const publish=k.el('button','primary',c.page?'Обновить страницу':'Опубликовать');publish.type='button';
  if(!c.page&&!c.destinations.some(d=>d!=='google'))publish.disabled=true;
  publish.onclick=async e=>{e.stopPropagation();if(done)return;publish.disabled=true;
   try{const r=await call('publish',c.draftId,dest,area.value,{parent:parentInput.value});markDone(r?.url||'');k.toast(r?.text||'Опубликовано');}
   catch(err){publish.disabled=false;k.toast(err.message,{error:true});}};
  const openBtn=k.el('button',null,'Открыть страницу');openBtn.type='button';openBtn.hidden=true;
  const actions=[publish,openBtn];
  if(!c.page)actions.push(k.links('document-export',()=>({title:(/^#\s+(.+)$/m.exec(area.value)?.[1]||c.title),text:area.value,app:'Вики из обсуждений'})));
  if(c.where.url)actions.push({label:c.meeting?'Открыть встречу':'Открыть тред',run:()=>open(c.where.url)});
  paint();
  const card=k.card({app:'Вики из обсуждений',initial:'В',color:'#4a6b8a',status,subtitle:c.where.label,title:c.title,body,className:'wiki-card',
   meta:[c.by==='model'?'текст — локальная модель; цитаты сверены дословно':'черновик по сообщениям; цитаты дословные'],actions});
  card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  card.querySelector('.kit-subtitle')?.setAttribute('data-no-i18n','');
  call('state',c.draftId).then(r=>{if(r?.state==='published')markDone(r.url);}).catch(()=>{});
  parent.append(card);
 };
})();
