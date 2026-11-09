// «Перформанс-ревью», renderer: the period as monthly bars stacked by kind of fact, the draft in three sections where
// every point carries the numbers of its facts (pressing one shows the fact), what there is no data about, and the
// facts by kind with their sources. «Скопировать черновик» and «Сохранить в Google Docs» (document-export) take the
// Markdown with the facts and gaps. Facts, names and the draft are content: data-no-i18n.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('review-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const KINDS=[['task','Задачи'],['incident','Инциденты'],['pr','PR'],['review','Ревью'],['meeting','Встречи'],['followup','Договорённости 1:1'],['note','Итоги 1:1']];
 const LABEL=Object.fromEntries(KINDS);
 const day=d=>new Date(d+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short'});

 function chart(k,data){
  const box=k.el('div','pr-chart');box.setAttribute('role','img');box.setAttribute('aria-label','Факты по месяцам: '+data.facts.length);
  const max=Math.max(1,...data.months.map(m=>Object.values(m.counts).reduce((a,b)=>a+b,0)));
  for(const m of data.months){
   const total=Object.values(m.counts).reduce((a,b)=>a+b,0);
   const col=k.el('div','pr-col');col.title=new Date(m.month+'-15T12:00:00').toLocaleDateString(locale(),{month:'long',year:'numeric'})+' · '+total;
   const bar=k.el('div','pr-bar');bar.style.height=Math.round(total/max*100)+'%';
   for(const [kind] of KINDS){const n=m.counts[kind]||0;if(!n)continue;const seg=k.el('span','pr-seg kind-'+kind);seg.style.flexGrow=String(n);bar.append(seg);}
   col.append(raw(k,'span','pr-col-n',total?String(total):''),k.el('div','pr-bar-box'),k.el('span','pr-col-m',new Date(m.month+'-15T12:00:00').toLocaleDateString(locale(),{month:'short'})));
   col.querySelector('.pr-bar-box').append(bar);
   box.append(col);
  }
  return box;
 }
 function legend(k,data){
  const row=k.el('div','pr-legend');
  for(const [kind,label] of KINDS){const n=data.facts.filter(f=>f.kind===kind).length;if(!n)continue;const i=k.el('span','pr-legend-item');i.append(k.el('span','pr-dot kind-'+kind),k.el('span',null,label),raw(k,'b',null,String(n)));row.append(i);}
  return row;
 }
 function factRow(k,f){
  const li=k.el('li','pr-fact kind-'+f.kind);li.dataset.fact=f.id;
  li.append(raw(k,'span','pr-fact-id',f.id),raw(k,'span','pr-fact-date',day(f.date)));
  const main=k.el('div','pr-fact-main');main.append(raw(k,'span','pr-fact-text selectable',f.text));
  const url=k.safeUrl?.(f.source?.url)||'';
  const src=raw(k,url?'a':'span','pr-fact-src',f.source?.label||'');if(url){src.href=url;src.target='_blank';src.rel='noopener';}
  main.append(src);li.append(main);
  return li;
 }

 window.renderPerfReviewCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.pr-card'))return;
  const body=k.el('div','pr-body');
  body.append(chart(k,data),legend(k,data));
  // The facts list first in memory, so the draft's chips can open and point at them.
  const factsBox=k.el('div','pr-facts');factsBox.append(k.el('h5','pr-h','Факты'));
  const groups=new Map();
  for(const [kind,label] of KINDS){
   const list=data.facts.filter(f=>f.kind===kind);if(!list.length)continue;
   const det=k.el('details','pr-group');const sum=k.el('summary');sum.append(k.el('span',null,label),raw(k,'span','pr-group-n',String(list.length)));det.append(sum);
   const ul=k.el('ul','pr-fact-list');ul.append(...list.map(f=>factRow(k,f)));det.append(ul);factsBox.append(det);groups.set(kind,det);
  }
  const show=id=>{const f=data.facts.find(x=>x.id===id);const det=f&&groups.get(f.kind);if(!det)return;det.open=true;const row=det.querySelector('[data-fact="'+id+'"]');if(row){row.classList.remove('is-flash');void row.offsetWidth;row.classList.add('is-flash');row.scrollIntoView({block:'nearest',behavior:'smooth'});}};
  const draft=k.el('div','pr-draft');
  draft.append(k.el('h5','pr-h','Черновик'));
  for(const sec of data.draft.sections){
   const box=k.el('div','pr-section');box.append(k.el('h6','pr-section-title',sec.title));
   if(!sec.items.length){box.append(k.el('p','pr-empty','нет фактов за период'));draft.append(box);continue;}
   const ul=k.el('ul','pr-points');
   for(const item of sec.items){
    const li=k.el('li','pr-point');li.append(raw(k,'span','pr-point-text selectable',item.text));
    const refs=k.el('span','pr-refs');
    for(const id of item.facts.slice(0,8)){const b=raw(k,'button','pr-ref',id);b.type='button';b.title=data.facts.find(f=>f.id===id)?.text||'';b.onclick=()=>show(id);refs.append(b);}
    if(item.facts.length>8)refs.append(raw(k,'span','pr-ref-more','+'+(item.facts.length-8)));
    li.append(refs);ul.append(li);
   }
   box.append(ul);draft.append(box);
  }
  body.append(draft);
  if(data.gaps?.length){const gaps=k.el('div','pr-gaps');gaps.append(k.el('h5','pr-h','Нет данных'));const ul=k.el('ul');for(const g of data.gaps)ul.append(k.el('li',null,g));gaps.append(ul);body.append(gaps);}
  body.append(factsBox);
  body.append(k.el('p','pr-note',data.draft.by==='rules'?'Черновик посчитан по фактам без модели.':'Пункты сформулировала локальная модель; оставлены только те, что опираются на факты.'));
  const subtitle=day(data.from)+' – '+day(data.to);
  parent.append(k.card({app:'Перформанс-ревью',initial:'П',color:'#7b6a4f',status:{label:'фактов: '+data.facts.length,tone:data.facts.length?'progress':'alert'},title:'Ревью · '+data.person.name,subtitle,body,className:'pr-card',
   actions:[{label:'Скопировать черновик',run:async()=>{try{await navigator.clipboard.writeText(data.markdown);k.toast('Черновик скопирован');}catch{k.toast('Не удалось скопировать',{error:true});}}},
    k.links('document-export',{title:'Перформанс-ревью · '+data.person.name,text:data.markdown,app:'Перформанс-ревью'},{label:p=>p.label})]}));
 };
})();
