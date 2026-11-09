// «Поиск по всему», renderer: a bar of where the results came from, source tabs with counts (filters), the state of
// sources that are off, failed or timed out, and result rows (source icon, title as a link, who/where, relative time,
// snippet with the matched words highlighted). «Ответить по найденному» sends the follow-up to the chat — for the tab
// that is open. The answer card lists the cited items by number.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('search-cards.css',document.currentScript.src).href;document.head.append(style);
 const LABELS={slack:'Slack',confluence:'Confluence',notion:'Notion',jira:'Jira',mail:'Почта',telegram:'Telegram',meetings:'Встречи',files:'Файлы проекта',glossary:'Глоссарий',notes:'Материалы'};
 const IN={slack:'в Slack',confluence:'в Confluence',notion:'в Notion',jira:'в Jira',mail:'в почте',telegram:'в Telegram',meetings:'во встречах',files:'в файлах проекта',glossary:'в глоссарии',notes:'в материалах'};
 const COLORS={slack:'#c9a8f0',confluence:'#86c2ff',notion:'#d6d6d6',jira:'#7fa8ff',mail:'#f0b4a8',telegram:'#8fd3f0',meetings:'#9dd9c9',files:'#e5ce8c',glossary:'#c9ed9d',notes:'#b8b8b8'};
 // Generic stroke icons (no brand logos).
 const ICONS={chat:['M4 5h16v10H9l-5 4z'],doc:['M7 3h7l4 4v14H7z','M14 3v4h4','M9.5 12h6','M9.5 16h6'],task:['M5 5h14v14H5z','M8.5 12l2.5 2.5 4.5-5'],mail:['M3.5 6h17v12h-17z','M3.5 6l8.5 7 8.5-7'],
  meet:['M9 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3z','M4.5 11a4.5 4.5 0 0 0 9 0','M9 15.5V19'],file:['M7 3h7l4 4v14H7z','M14 3v4h4','M10 13l-2 2 2 2','M14 13l2 2-2 2'],book:['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z','M5 17a3 3 0 0 1 3-3h9'],note:['M5 4h14v16H5z','M8.5 9h7','M8.5 13h5'],
  drive:['M8.5 4h7l5.5 9.5-3.5 6h-11l-3.5-6z','M8.5 4l5.5 9.5h6.5','M15.5 4L10 13.5l-3.5 6']};
 const ICON_OF={slack:'chat',telegram:'chat',confluence:'doc',notion:'doc',jira:'task',mail:'mail',meetings:'meet',files:'file',glossary:'book',notes:'note'};
 // Sources the card does not know — other apps' search sources (Google Drive, …) and messengers from the
 // messenger-source registry (Mattermost, VK Teams, …) — carry their own label, icon, color and «в …»; a chat by default.
 let extra={};
 const learn=x=>{const id=x.id||x.source;if(id&&!LABELS[id]&&x.label)extra[id]={label:x.label,icon:ICONS[x.icon]?x.icon:'chat',color:/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#a9b8d6',in:typeof x.in==='string'?x.in:''};};
 const labelOf=id=>LABELS[id]||extra[id]?.label||id;
 const colorOf=id=>COLORS[id]||extra[id]?.color||'#a9b8d6';
 const inOf=id=>IN[id]||extra[id]?.in||'';
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const locale=()=>window.petyaLocale||'ru-RU';
 function icon(k,source){
  const box=k.el('span','sa-icon');box.style.color=COLORS[source]||extra[source]?.color||'var(--muted)';box.title=labelOf(source);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('aria-hidden','true');
  for(const d of ICONS[ICON_OF[source]||extra[source]?.icon||'note']){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);}
  box.append(svg);return box;
 }
 // Text with <mark> around [start, end] ranges; text nodes only.
 function marked(k,text,marks,cls){
  const node=raw(k.el('span',cls));let at=0;
  for(const [a,b] of [...(marks||[])].sort((x,y)=>x[0]-y[0])){if(a<at||b>text.length)continue;if(a>at)node.append(document.createTextNode(text.slice(at,a)));node.append(k.el('mark',null,text.slice(a,b)));at=b;}
  if(at<text.length)node.append(document.createTextNode(text.slice(at)));
  return node;
 }
 function when(at){
  if(!at)return null;const d=new Date(at);if(isNaN(d))return null;
  if(typeof window.timeElement==='function')return window.timeElement(d);
  const t=document.createElement('time');t.dateTime=d.toISOString();t.textContent=d.toLocaleDateString(locale(),{day:'numeric',month:'short'});return t;
 }
 function row(k,i){
  const li=k.el('div','sa-row');li.dataset.source=i.source;
  const head=k.el('div','sa-head');
  const safe=k.safeUrl(i.url||'');
  const title=safe?k.el('a','sa-title'):k.el('span','sa-title');
  if(safe){title.href=safe;title.target='_blank';title.rel='noopener';title.title=safe;}
  title.append(marked(k,i.title||'',i.titleMarks||[]));
  head.append(title);
  if(i.path){const b=k.el('button','sa-reveal','Показать в папке');b.type='button';b.onclick=async e=>{e.stopPropagation();try{await window.petya.feature('searchAll','reveal',i.path);}catch(err){k.toast(err.message,{error:true});}};head.append(b);}
  const meta=k.el('div','sa-meta');meta.append(k.el('span','sa-src',labelOf(i.source)));
  if(i.meta)meta.append(raw(k.el('span',null,i.meta)));
  const t=when(i.at);if(t){const w=k.el('span');w.append(t);meta.append(w);}
  const text=k.el('div','sa-text');text.append(icon(k,i.source));
  const body=k.el('div','sa-body');body.append(head,meta);
  if(i.snippet&&i.snippet!==i.title)body.append(marked(k,i.snippet,i.marks,'sa-snippet selectable'));
  text.append(body);li.append(text);
  return li;
 }
 function spread(k,c){
  const shown=c.sources.filter(x=>x.count>0),total=shown.reduce((n,x)=>n+x.count,0);
  if(!total)return null;
  const bar=k.el('div','sa-spread');bar.setAttribute('role','img');bar.setAttribute('aria-label','Где нашлось: '+shown.map(x=>labelOf(x.id)+' '+x.count).join(', '));
  for(const x of shown){const seg=k.el('span','sa-seg');seg.style.flexGrow=String(x.count);seg.style.background=colorOf(x.id);seg.title=labelOf(x.id)+': '+x.count;bar.append(seg);}
  return bar;
 }
 const STATE={off:'не подключено',error:'ошибка',timeout:'не ответил',limited:'частично',partial:'частично',empty:'ничего'};
 window.renderSearchAll=(parent,c)=>{
  for(const x of c?.sources||[])learn(x);
  const k=window.resultKit;if(!k||!c||parent.querySelector('.sa-card'))return;
  let current='all';
  const body=k.el('div','sa-bodywrap');
  const bar=spread(k,c);if(bar)body.append(bar);
  const tabs=k.el('div','sa-tabs');tabs.setAttribute('role','tablist');
  const list=k.el('div','sa-list');
  const counts=c.sources.filter(x=>x.count>0);
  const tab=(id,label,count)=>{const b=k.el('button','sa-tab');b.type='button';b.setAttribute('role','tab');b.dataset.source=id;
   if(id!=='all'){const dot=k.el('i');dot.style.background=colorOf(id);b.append(dot);}
   b.append(k.el('span',null,label),k.el('b',null,String(count)));b.onclick=()=>{current=id;paint();};return b;};
  tabs.append(tab('all','Все',c.items.length),...counts.map(x=>tab(x.id,labelOf(x.id),x.count)));
  const missing=c.sources.filter(x=>!(x.count>0)||['limited','partial'].includes(x.state));
  const status=k.el('div','sa-status');
  for(const x of missing){const chip=k.el('span','sa-state '+x.state);chip.append(k.el('span',null,labelOf(x.id)),k.el('em',null,x.state==='ok'?'':STATE[x.state]||x.state));chip.title=x.note||'';status.append(chip);}
  function paint(){
   for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.source===current));
   const rows=c.items.filter(i=>current==='all'||i.source===current).map(i=>row(k,i));
   list.replaceChildren(rows.length?k.collapse(rows,8,'Ещё результаты'):k.el('p','sa-empty','Ничего не нашлось. Попробуйте другие слова или проверьте подключения ниже.'));
   answer.title=current==='all'?'По всем найденным':'Только '+inOf(current);
  }
  if(c.items.length)body.append(tabs);
  body.append(list);
  if(missing.length)body.append(status);
  if(c.extra?.length||c.embed){const how=raw(k.el('small','sa-how',[c.extra?.length?'Искал ещё: '+c.extra.join(', '):'',c.embed?'порядок уточнён по смыслу ('+c.embed+')':''].filter(Boolean).join(' · ')));body.append(how);}
  const answer=k.el('button','primary','Ответить по найденному');answer.type='button';
  answer.onclick=e=>{e.stopPropagation();k.ask('Ответь по найденному'+(current==='all'?'':' '+inOf(current)),{send:true});};
  answer.hidden=!c.items.length;
  const actions=[answer,{label:'Искать другое',run:()=>k.ask('Найди везде про ')}];
  const status2=c.items.length?{label:c.items.length+' '+plural(c.items.length,['результат','результата','результатов']),tone:'done'}:{label:'ничего',tone:'alert'};
  const card=k.card({app:'Поиск по всему',initial:'П',color:'#5a6b4a',key:'«'+c.query+'»',status:status2,subtitle:counts.length+' '+plural(counts.length,['источник','источника','источников']),body,actions,className:'sa-card'});
  raw(card.querySelector('.kit-key'));
  paint();parent.append(card);
 };
 window.renderSearchAllAnswer=(parent,c)=>{
  for(const x of c?.citations||[])learn(x);
  const k=window.resultKit;if(!k||!c||parent.querySelector('.sa-answer')||!c.citations?.length)return;
  const list=k.el('ol','sa-cites');
  for(const x of c.citations){
   const li=k.el('li');li.value=x.n;li.append(icon(k,x.source));
   const safe=k.safeUrl(x.url||'');const t=raw(k.el(safe?'a':'span','sa-title',x.title));if(safe){t.href=safe;t.target='_blank';t.rel='noopener';}
   const meta=k.el('span','sa-meta');meta.append(k.el('span','sa-src',labelOf(x.source)));const w=when(x.at);if(w)meta.append(w);
   li.append(t,meta);list.append(li);
  }
  const card=k.card({app:'Поиск по всему',initial:'П',color:'#5a6b4a',key:'«'+c.query+'»',status:{label:'ответ по найденному',tone:'done'},subtitle:c.citations.length+' '+plural(c.citations.length,['ссылка','ссылки','ссылок']),body:list,className:'sa-card sa-answer'});
  raw(card.querySelector('.kit-key'));parent.append(card);
 };
})();
