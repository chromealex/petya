// «Объясни график», renderer: the series as a line with the usual level (dashed), the day it moved and the onset
// marked, numbered markers on the date axis for every cited cause; the causes as a list — each with its date, kind and
// source (and link) — or «Нет явной причины» with what was checked; for a screenshot without a vision model, the
// download offer, then «Прочитать график».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('explain-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=(n,d=0)=>Number(n).toLocaleString(locale(),{maximumFractionDigits:d});
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const SVG='http://www.w3.org/2000/svg';
 const svg=(tag,attrs={})=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short',timeZone:'UTC'});
 const full=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 const value=(v,unit)=>{const cur=/^currency:([A-Z]{3})$/.exec(unit||'')?.[1];if(cur)try{return Number(v).toLocaleString(locale(),{style:'currency',currency:cur,notation:Math.abs(v)>=1e5?'compact':'standard',maximumFractionDigits:Math.abs(v)>=100?0:2});}catch{}return Math.abs(v)>=1e5?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(v):fmt(v,Math.abs(v)<100?2:0);};
 const pct=v=>(v>0?'+':'−')+fmt(Math.abs(v)*100,1)+'%';
 const KIND={release:'Релиз',incident:'Инцидент',crash:'Крэши',campaign:'Кампания',holiday:'Праздник'};
 const GB=b=>fmt(b/1024**3,1)+' '+(window.petyaLanguage&&window.petyaLanguage!=='ru'?'GB':'ГБ');

 function chart(k,c){
  const pts=c.series.points,e=c.event,n=pts.length;
  const W=592,H=170,L=46,R=10,T=12,B=34;
  const vals=pts.map(p=>p.value),top=Math.max(...vals,e.base||0,1e-9),min=Math.min(0,...vals);
  // A round top for the axis: 1, 2, 2.5 or 5 × 10ⁿ, at least 5% above the data.
  const unit=Math.pow(10,Math.floor(Math.log10(top))),max=[1,2,2.5,5,10].map(m=>m*unit).find(v=>v>=top*1.05)||top*1.1;
  const x=i=>L+(n>1?i*(W-L-R)/(n-1):0),y=v=>T+(H-T-B)*(1-(v-min)/(max-min||1));
  const s=svg('svg',{viewBox:'0 0 '+W+' '+H,class:'explain-svg',role:'img','aria-label':c.series.label});
  for(let g=0;g<=4;g++){const gy=T+(H-T-B)*g/4;s.append(svg('line',{x1:L,x2:W-R,y1:gy,y2:gy,class:'grid'}));const t=svg('text',{x:L-6,y:gy+3,class:'tick','text-anchor':'end'});t.textContent=value(max-(max-min)*g/4,c.series.unit);s.append(t);}
  const idx=d=>pts.findIndex(p=>p.date===d);
  if(e.notable){
   const a=idx(e.onset),b=idx(e.date);
   if(a>=0&&b>=0)s.append(svg('rect',{x:x(a)-4,y:T,width:Math.max(8,x(b)-x(a)+8),height:H-T-B,class:'window '+e.direction}));
   s.append(svg('line',{x1:L,x2:W-R,y1:y(e.base),y2:y(e.base),class:'base'}));
  }
  let d='';pts.forEach((p,i)=>{d+=(i?'L':'M')+x(i).toFixed(1)+' '+y(p.value).toFixed(1);});
  s.append(svg('path',{d,class:'line'}));
  if(e.notable){const b=idx(e.date);if(b>=0){const dot=svg('circle',{cx:x(b),cy:y(e.value),r:5,class:'event '+e.direction,'data-date':e.date});const t=svg('title');t.textContent=day(e.date)+': '+value(e.value,c.series.unit)+' ('+pct(e.dev)+')';dot.append(t);s.append(dot);}}
  // Cause markers on the date axis: one pill per day with the numbers of its causes («1, 4»).
  const byDay=new Map();
  c.causes.forEach((cause,i)=>{
   let j=idx(cause.date);
   if(j<0){if(cause.date<pts[0].date||cause.date>pts[n-1].date)return;j=pts.findIndex(p=>p.date>cause.date);}
   if(!byDay.has(j))byDay.set(j,[]);byDay.get(j).push({n:i+1,cause});
  });
  for(const [j,list] of byDay){
   const cx=x(j),cy=H-B+11,label=list.map(v=>v.n).join(', '),w=Math.max(14,8+label.length*6);
   const g=svg('g',{class:'cause-mark','data-n':label,'data-count':list.length});
   g.append(svg('line',{x1:cx,x2:cx,y1:T,y2:H-B,class:'cause-line'}),svg('rect',{x:cx-w/2,y:cy-7,width:w,height:14,rx:7}));
   const t=svg('text',{x:cx,y:cy+3.5,'text-anchor':'middle'});t.textContent=label;g.append(t);
   const tt=svg('title');tt.textContent=list.map(v=>v.n+'. '+day(v.cause.date)+' — '+v.cause.title).join('\n');g.append(tt);s.append(g);
  }
  const step=Math.max(1,Math.ceil(n/7));
  pts.forEach((p,i)=>{if(i!==n-1&&(i%step||n-1-i<step*0.75))return;const t=svg('text',{x:x(i),y:H-3,class:'tick','text-anchor':i===0?'start':i===n-1?'end':'middle'});t.textContent=day(p.date);s.append(t);});
  return s;
 }
 function causes(k,c){
  const ol=k.el('ol','explain-causes');
  c.causes.forEach((x,i)=>{
   const li=k.el('li','k-'+x.kind);li.dataset.kind=x.kind;
   const n=k.el('span','explain-n',String(i+1));
   const when=raw(k.el('time','explain-date',day(x.date)));when.setAttribute('datetime',x.date);when.setAttribute('data-absolute','');when.title=full(x.date);
   const head=k.el('div','explain-head');head.append(when,k.el('span','explain-kind',KIND[x.kind]||x.kind));
   const lag=x.lag===0?'в тот же день':x.lag>0?(x.lag===1?'за день до спада':'за '+x.lag+' дн. до спада'):'на следующий день';
   head.append(k.el('span','explain-lag',c.event.direction==='up'?lag.replace('спада','роста'):lag));
   const title=raw(k.el('div','explain-title',x.title));
   const meta=k.el('div','explain-meta');meta.append(raw(k.el('span',null,[x.detail,x.source].filter(Boolean).join(' · '))));
   if(x.url&&/^https:\/\//.test(x.url)){const a=k.el('a',null,'открыть');a.href=x.url;a.target='_blank';a.rel='noopener';meta.append(a);}
   const box=k.el('div','explain-text');box.append(head,title,meta);
   li.append(n,box);ol.append(li);
  });
  return ol;
 }
 function checked(k,c){
  const row=k.el('div','explain-checked');row.append(k.el('span',null,'Проверено:'));
  for(const x of c.checked||[]){const chip=k.el('span','explain-check '+x.state,x.label);chip.title=x.state==='none'?'Не подключено':x.state==='error'?x.errors.join('; '):'Прочитано';row.append(chip);}
  return row;
 }
 function render(parent,c,before){
  const k=window.resultKit;
  const body=k.el('div','explain-body');
  let status;const actions=[];
  if(c.state==='needs-model'){
   body.append(k.el('p','explain-note','Чтобы прочитать график со скриншота, нужна локальная модель для картинок. Скриншот остаётся на компьютере.'));
   const m=raw(k.el('p','explain-model',c.vision?.name||''));body.append(m);
   status={label:'нужна модель',tone:'progress'};
   actions.push({label:'Скачать модель · '+GB(c.vision?.size||3.3e9),primary:true,run:async b=>{await window.petya.feature('chartExplain','downloadModel');b.disabled=true;k.toast(window.t?window.t('Скачиваю модель — прогресс в уведомлениях. Потом нажмите «Прочитать график».'):'Скачиваю модель — прогресс в уведомлениях. Потом нажмите «Прочитать график».');}});
   actions.push({label:'Прочитать график',run:async()=>{const next=await window.petya.feature('chartExplain','read',c.id);const h=document.createElement('div');card.replaceWith(h);render(h.parentNode,next,h);h.remove();}});
  }else if(c.state==='unreadable'){
   body.append(k.el('p','explain-note',c.undated?'Модель не прочитала даты на оси X — без дат причины не сопоставить.':'Модель не смогла прочитать точки графика.'));
   status={label:'не прочитан',tone:'alert'};
  }else{
   const e=c.event;
   const head=k.el('div','explain-summary');
   const label=raw(k.el('b',null,c.series.label));
   if(e.notable){
    head.append(label,k.el('span',null,e.direction==='down'?' упал ':' вырос '),raw(k.el('b',null,day(e.date))),k.el('span',null,': '),raw(k.el('span','explain-dev '+e.direction,value(e.value,c.series.unit)+' · '+pct(e.dev))),k.el('span','explain-muted',' против обычных '),raw(k.el('span',null,'≈'+value(e.base,c.series.unit))));
   }else head.append(label,k.el('span',null,e.reason==='short'?' — слишком мало дней':e.direction==='up'?' — заметного роста нет':' — заметного падения нет'));
   body.append(head);
   if(c.series.points.length>=2)body.append(chart(k,c));
   if(e.notable&&c.causes.length){body.append(k.el('div','explain-section','Возможные причины'),causes(k,c));status={label:c.causes.length+' '+(c.causes.length===1?'причина':c.causes.length<5?'причины':'причин'),tone:'progress'};}
   else if(e.notable){const none=k.el('div','explain-none');none.append(k.el('b',null,'Нет явной причины'),k.el('span',null,'Рядом с этой датой в подключённых данных нет релизов, инцидентов, всплесков крэшей, изменений кампаний и праздников.'));body.append(none);status={label:'нет явной причины',tone:'done'};}
   else status={label:'без резких изменений',tone:'done'};
   if(e.notable)body.append(checked(k,c));
   if(c.source==='screenshot')body.append(k.el('p','explain-note','Значения прочитаны со скриншота локальной моделью — они приблизительные.'));
  }
  const card=k.card({app:'Объясни график',initial:'О',color:'#5d4a73',key:c.title||c.series?.label||'График',status,subtitle:c.source==='screenshot'?'скриншот':'по данным карточки',body,actions,className:'explain-card'});
  card.dataset.state=c.state;card.dataset.verdict=c.verdict||'';
  const key=card.querySelector('.kit-key');if(key)raw(key);
  if(before)parent.insertBefore(card,before);else parent.append(card);
  return card;
 }
 window.renderChartExplain=(parent,c)=>{const k=window.resultKit;if(!k||!c||!c.id||parent.querySelector('.explain-card'))return;render(parent,c);};
})();
