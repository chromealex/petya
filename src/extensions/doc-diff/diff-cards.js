// «Что изменилось в документе», renderer: the document and the period, a timeline of its versions (who, when), the
// added / removed words, a short summary whose points link to the changed sections they rest on, and every changed
// section with its inline word diff (removed words struck out, added ones highlighted), who changed it and when.
// Read-only: the only actions open the document or ask for another period.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('diff-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const SOURCE={git:'репозиторий',confluence:'Confluence',google:'Google Документы'};
 const STATUS={added:['добавлен','done'],removed:['удалён','alert'],changed:['изменён','progress']};
 const when=iso=>{const d=new Date(iso);if(isNaN(d))return null;return window.timeElement?window.timeElement(d):Object.assign(document.createElement('time'),{textContent:d.toLocaleString(locale())});};
 const open=url=>{if(!url)return;if(window.openChatBrowser)window.openChatBrowser(url);else window.open(url,'_blank','noopener');};

 // Inline word diff: text nodes only.
 function ops(k,list){
  const p=raw(k.el('p','dd-ops selectable'));
  for(const o of list||[]){
   if(o.op==='eq'){p.append(k.el('span',o.cut?'dd-eq dd-cut':'dd-eq',o.text));continue;}
   p.append(k.el(o.op==='ins'?'ins':'del','dd-'+o.op,o.text));
  }
  return p;
 }
 function timeline(k,c){
  const box=k.el('div','dd-timeline');
  const list=c.versions||[];
  const times=list.map(v=>Date.parse(v.at)).filter(Number.isFinite);
  const start=Math.min(...times,Date.parse(c.range.since)||Infinity),end=Math.max(...times);
  const track=k.el('div','dd-track');
  const span=Math.max(1,end-start);
  for(const v of list){
   const dot=k.el('span','dd-dot'+(v.local?' local':''));
   const x=list.length===1?100:Math.round(4+92*(Date.parse(v.at)-start)/span);
   dot.style.left=x+'%';
   const d=new Date(v.at);dot.title=(v.author?v.author+' · ':'')+(isNaN(d)?'':d.toLocaleString(locale()))+(v.label?' · '+v.label:'');
   track.append(raw(dot));
  }
  box.append(track);
  const legend=k.el('div','dd-legend');
  const people=[...new Set(list.map(v=>v.author).filter(Boolean))];
  legend.append(k.el('span',null,'Правок: '+list.length));
  if(people.length)legend.append(raw(k.el('span','dd-people',people.slice(0,4).join(', ')+(people.length>4?' +'+(people.length-4):''))));
  box.append(legend);
  return box;
 }
 function stats(k,c){
  const box=k.el('div','dd-stats');
  const total=Math.max(1,c.totals.added+c.totals.removed);
  const bar=k.el('div','dd-bar');
  const a=k.el('span','dd-bar-ins');a.style.width=(100*c.totals.added/total)+'%';
  const r=k.el('span','dd-bar-del');r.style.width=(100*c.totals.removed/total)+'%';
  bar.append(a,r);
  const nums=k.el('div','dd-nums');
  nums.append(raw(k.el('b','dd-plus','+'+c.totals.added)),k.el('span',null,'слов добавлено'),raw(k.el('b','dd-minus','−'+c.totals.removed)),k.el('span',null,'слов удалено'));
  box.append(nums,bar);
  return box;
 }
 function hunk(k,h){
  const row=k.el('article','dd-hunk st-'+h.status);row.dataset.hunk=String(h.n);
  const head=k.el('div','dd-hunk-head');
  const [label,tone]=STATUS[h.status]||STATUS.changed;
  head.append(raw(k.el('span','dd-n',String(h.n))),raw(k.el('span','dd-title',h.path||h.title)),k.chip({label,tone}));
  const who=k.el('span','dd-who');
  if(h.by?.length)who.append(raw(k.el('span',null,h.by.join(', '))));
  const t=h.at?when(h.at):null;if(t){if(h.by?.length)who.append(document.createTextNode(' · '));who.append(t);}
  head.append(who);
  row.append(head,ops(k,h.ops));
  return row;
 }
 window.renderDocDiffCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.dd-card'))return;
  const body=k.el('div','dd-body');
  const top=k.el('div','dd-top');
  top.append(k.chip({label:SOURCE[c.doc.source]||c.doc.source}));
  if(c.doc.repo)top.append(raw(k.el('span','dd-muted',c.doc.repo)));
  body.append(top);
  if(c.versions.length)body.append(timeline(k,c));
  if(c.hunks.length)body.append(stats(k,c));
  if(c.summary?.items?.length){
   const box=k.el('div','dd-summary');box.append(k.el('div','dd-head','Коротко'));
   const list=k.el('ul');
   for(const i of c.summary.items){
    const li=k.el('li');li.append(raw(k.el('span',null,i.text)));
    for(const n of i.hunks){const b=raw(k.el('button','dd-ref',String(n)));b.type='button';b.title='К изменению '+n;
     b.onclick=e=>{e.stopPropagation();const el=b.closest('.dd-card')?.querySelector('[data-hunk="'+n+'"]');if(el){el.scrollIntoView({block:'nearest',behavior:'smooth'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1200);}};li.append(b);}
    list.append(li);
   }
   box.append(list);
   box.append(k.el('small','dd-muted',c.summary.by==='model'?'Пересказ модели: каждый пункт сверен с изменениями, на которые он ссылается'+(c.summary.dropped?' · отброшено пунктов без опоры: '+c.summary.dropped:''):'Сводка по изменённым разделам'));
   body.append(box);
  }
  if(c.hunks.length){
   const list=k.el('div','dd-hunks');
   list.append(k.collapse(c.hunks.map(h=>hunk(k,h)),6,'Ещё разделы'));
   body.append(list);
  }else body.append(k.el('p','dd-empty',c.versions.length?'Правки без изменений текста.':'За этот период документ не менялся.'));
  for(const n of c.notes||[])body.append(raw(k.el('small','dd-muted dd-note',n)));
  const period=c.range.mode==='period'?'за '+c.range.days+' дн.':'последняя правка';
  const actions=[];
  if(c.doc.url)actions.push({label:'Открыть документ',primary:true,run:()=>open(c.doc.url)});
  actions.push({label:'Сравнить за месяц',run:()=>k.ask('Что поменяли в «'+c.doc.title+'» за месяц',{send:true})});
  const card=k.card({app:'Что изменилось в документе',initial:'Д',color:'#5b6c8f',status:{label:c.hunks.length?'разделов: '+c.hunks.length:'без изменений',tone:c.hunks.length?'progress':'done'},
   subtitle:period,title:c.doc.title,body,className:'dd-card',actions});
  card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  parent.append(card);
 };
})();
