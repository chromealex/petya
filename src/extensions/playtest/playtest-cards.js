// «Разбор плейтеста», renderer: while the analysis runs — the stage, progress and «Отменить»; then a session timeline
// with markers by type (and a strip of screen kinds when frames were labelled), the top issues, and the moments with
// a local thumbnail, time, evidence (frame description, the player's words verbatim, the logged event), «Открыть на
// этом месте» and a task in the connected tracker (k.links task-tracker).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('playtest-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('playtestApp',method,...args);
 const TYPES={death:['Смерть','#f0b4a8'],retry:['Повторы','#e8a07a'],idle:['Простой','#e5ce8c'],speech:['Негатив в речи','#c9a0dc'],ui:['Интерфейс','#7fb0e0']};
 const SEV={high:['серьёзно','alert'],medium:['заметно','progress'],low:['слабо','']};
 const SCREEN={fail:'#f0b4a8',win:'#c9ed9d',menu:'#8a94a6',loading:'#55606e',dialog:'#7fb0e0',gameplay:'#3d4a44',other:'#3a3f46'};
 const clock=t=>{t=Math.max(0,Math.round(t));const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0');};
 const data=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const image=src=>/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(src||''))?src:'';
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};

 function evidence(k,e){
  const li=k.el('li','pt-ev pt-ev-'+e.kind);
  li.append(k.el('span','pt-ev-kind',e.kind==='frame'?'Кадр '+clock(e.t):e.kind==='speech'?(e.approx?'Речь ≈'+clock(e.t):'Речь '+clock(e.t)):'Событие '+clock(e.t)));
  if(e.kind==='speech'&&(e.swearing||!e.text))li.append(k.el('span','pt-ev-text muted','нецензурная речь — без цитаты'));
  else if(e.kind==='speech')li.append(data(k,'q','pt-ev-text',e.text));
  else li.append(data(k,'span','pt-ev-text',e.text));
  return li;
 }
 function task(c,m){
  const lines=m.evidence.map(e=>(e.kind==='frame'?'кадр':e.kind==='speech'?'речь':'событие')+' '+clock(e.t)+': '+(e.kind==='speech'&&(e.swearing||!e.text)?'нецензурная речь':e.text));
  return {title:'Плейтест: '+m.title+' на '+clock(m.t),description:'Запись «'+c.video.name+'», '+clock(m.t)+(m.end?'–'+clock(m.end):'')+'. '+lines.join('; ')+'.',type:'bug'};
 }
 function moment(k,c,m){
  const li=k.el('li','pt-moment sev-'+m.severity);li.id='pt-'+c.id+'-'+m.id;li.dataset.type=m.type;
  const thumb=k.el('div','pt-thumb');const src=image(m.thumb);
  if(src){const img=k.el('img');img.src=src;img.alt='Кадр '+clock(m.frameAt??m.t);thumb.append(img);}else thumb.append(k.el('span',null,clock(m.t)));
  thumb.style.borderColor=TYPES[m.type]?.[1]||'var(--line)';
  const main=k.el('div','pt-main'),head=k.el('div','pt-head');
  const time=k.el('span','pt-time',clock(m.t)+(m.end&&m.end-m.t>=1?'–'+clock(m.end):''));
  const type=k.chip({label:TYPES[m.type]?.[0]||m.type});type.classList.add('pt-type');type.style.setProperty('--pt-color',TYPES[m.type]?.[1]||'#888');
  head.append(time,type,k.chip({label:SEV[m.severity][0],tone:SEV[m.severity][1]}));
  main.append(head,data(k,'div','pt-title',m.title));
  const ul=k.el('ul','pt-evidence');for(const e of m.evidence)ul.append(evidence(k,e));main.append(ul);
  if(m.near?.length)main.append(k.el('small','kit-meta','Рядом: '+m.near.map(t=>TYPES[t]?.[0]||t).join(', ').toLowerCase()));
  const acts=k.el('div','pt-actions');
  if(c.video.path||c.status==='running'){const b=k.el('button',null,'Открыть на этом месте');b.type='button';b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{const r=await call('open',c.id,m.t);if(r?.opened==='system')k.toast('Открыл в системном плеере — перейдите к '+clock(m.t)+'.');}catch(err){k.toast(err.message,{error:true});}finally{b.disabled=false;}};acts.append(b);}
  acts.append(k.links('task-tracker',()=>task(c,m),{label:p=>'Создать задачу: '+p.name,title:'Петя покажет задачу перед созданием'}));
  main.append(acts);
  li.append(thumb,main);
  return li;
 }
 function timeline(k,c,list){
  const box=k.el('div','pt-timeline');
  const d=Math.max(c.duration||0,1);
  const track=k.el('div','pt-track');track.setAttribute('role','group');track.setAttribute('aria-label','Шкала сессии '+clock(d));
  if(c.timeline?.some(f=>f.screen)){
   const strip=k.el('div','pt-screens');const step=(c.interval||d/c.timeline.length);
   for(const f of c.timeline){const seg=k.el('i');seg.style.left=(f.at/d*100)+'%';seg.style.width=(step/d*100)+'%';seg.style.background=SCREEN[f.screen]||SCREEN.other;if(f.screen)seg.title=clock(f.at)+' · '+f.screen;strip.append(seg);}
   track.append(strip);
  }
  for(const m of c.moments){
   const b=k.el('button','pt-mark sev-'+m.severity);b.type='button';b.style.left=(Math.min(m.t,d)/d*100)+'%';b.style.setProperty('--pt-color',TYPES[m.type]?.[1]||'#888');
   const end=Math.min(m.end||0,d);if(end>m.t){const line=k.el('i','pt-span');line.style.left=(m.t/d*100)+'%';line.style.width=((end-m.t)/d*100)+'%';line.style.background=TYPES[m.type]?.[1]||'#888';track.append(line);}
   b.title=clock(m.t)+' · '+(TYPES[m.type]?.[0]||m.type)+': '+m.title;b.setAttribute('aria-label',b.title);
   b.onclick=e=>{e.stopPropagation();const node=document.getElementById('pt-'+c.id+'-'+m.id);if(node){node.closest('details')?.setAttribute('open','');node.scrollIntoView({block:'nearest',behavior:'smooth'});node.classList.add('flash');setTimeout(()=>node.classList.remove('flash'),1200);}};
   track.append(b);
  }
  const axis=k.el('div','pt-axis');for(const f of [0,0.25,0.5,0.75,1])axis.append(k.el('span',null,clock(d*f)));
  const legend=k.el('div','pt-legend');
  for(const [type,[label,color]] of Object.entries(TYPES)){const n=c.counts?.[type]||0;if(!n)continue;const s=k.el('span');const dot=k.el('i');dot.style.background=color;s.append(dot,k.el('span',null,label+' · '+n));legend.append(s);}
  box.append(track,axis,legend);
  return box;
 }
 function paint(k,slot,c){
  const body=k.el('div','pt-body');
  let status=null;const actions=[];
  if(c.status==='running'){
   status={label:Number.isFinite(c.percent)?'идёт · '+c.percent+'%':'идёт',tone:'progress'};
   body.append(data(k,'p','pt-stage',c.stage||'Готовлю'));
   const bar=k.el('div','pt-progress'+(Number.isFinite(c.percent)?'':' indeterminate'));const fill=k.el('i');fill.style.width=(Number.isFinite(c.percent)?c.percent:30)+'%';bar.append(fill);bar.setAttribute('role','progressbar');if(Number.isFinite(c.percent))bar.setAttribute('aria-valuenow',String(c.percent));body.append(bar);
   if(c.log)body.append(data(k,'small','kit-meta','Журнал: '+c.log.name+' · событий: '+c.log.events));
   actions.push({label:'Отменить',run:async()=>{await call('cancel',c.id);}});
  }else if(c.status==='error'||c.status==='cancelled'||c.status==='lost'){
   status=c.status==='error'?{label:'ошибка',tone:'alert'}:{label:c.status==='lost'?'прервано':'отменено'};
   body.append(k.el('p','pt-stage',c.status==='error'?c.error:c.status==='lost'?'Разбор прервался (Петя перезапускался). Попросите разобрать плейтест ещё раз.':'Разбор отменён.'));
  }else{
   const n=c.moments.length,high=c.moments.filter(m=>m.severity==='high').length;
   status=n?{label:n+' '+plural(n,['момент','момента','моментов'])+(high?' · серьёзных '+high:''),tone:high?'alert':'progress'}:{label:'без моментов',tone:'done'};
   const facts=[clock(c.duration),c.frames+' '+plural(c.frames,['кадр','кадра','кадров'])+(c.interval?' (каждые ~'+Math.round(c.interval)+' с)':''),c.model?'кадры описала '+c.model:'без модели для кадров',c.speech?.lines?'речь: '+c.speech.lines+' '+plural(c.speech.lines,['фрагмент','фрагмента','фрагментов']):'речи нет',c.log?'событий в журнале: '+c.log.events:''].filter(Boolean);
   body.append(k.el('p','pt-facts',facts.join(' · ')));
   if(n)body.append(timeline(k,c,c.moments));
   if(c.summary?.length){const box=k.el('div','pt-summary');box.append(k.el('h5',null,'Главное'));const ul=k.el('ul');for(const x of c.summary){const li=k.el('li','sev-'+x.severity);li.append(k.el('i'),data(k,'span',null,x.text));ul.append(li);}box.append(ul);body.append(box);}
   if(n){const list=k.el('ol','pt-moments');const nodes=c.moments.map(m=>moment(k,c,m));list.append(k.collapse(nodes,6,'Ещё моменты'));body.append(list);}
   else body.append(k.el('p','pt-stage','Моментов с доказательствами не нашлось: смертей и повторов нет, кадр меняется, негатива в речи не слышно.'));
   if(!c.model){const b={label:'Скачать модель для кадров',title:'gemma3:4b, около 3,3 ГБ — прогресс в уведомлениях',run:async()=>{await call('downloadModel');k.toast('Скачиваю модель — прогресс в уведомлениях. Потом попросите разобрать плейтест ещё раз.');}};actions.push(b);}
  }
  for(const note of c.notes||[])body.append(k.el('p','pt-note',note));
  const node=k.card({app:'Разбор плейтеста',initial:'▶',color:'#6b5b8c',key:c.video.name,status,body,actions,className:'pt-card'});
  node.dataset.status=c.status;node.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  slot.replaceChildren(node);
 }
 window.renderPlaytest=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.pt-card'))return;
  const slot=k.el('div','pt-slot');parent.append(slot);
  let card=c;paint(k,slot,card);
  if(card.status!=='running')return;
  let last='';
  const poll=async()=>{
   if(!slot.isConnected)return;
   let next=null;try{next=await call('status',card.id);}catch{next=null;}
   if(!next){paint(k,slot,{...card,status:'lost'});return;}
   const key=JSON.stringify([next.status,next.stage,next.percent]);
   if(key!==last){last=key;card=next;paint(k,slot,card);}
   if(card.status==='running')setTimeout(poll,700);
  };
  setTimeout(poll,500);
 };
})();
