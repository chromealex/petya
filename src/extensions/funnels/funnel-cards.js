// «Воронки», renderer: step bars narrowing from the first step, the drop-off and the time between every two steps
// (the largest drop marked), the comparison by platform / country / version as a small-multiples table, «Сохранить
// воронку» and «Выгрузить в Google Таблицы». A funnel from a database first shows its SQL with the estimated cost and
// «Выполнить»; the main process runs the SQL stored on the card (ipc `run` by card id), never text from the page.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('funnel-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=(n,d=0)=>Number(n).toLocaleString(locale(),{maximumFractionDigits:d});
 const pct=v=>v===null||v===undefined?'—':fmt(v*100,v<0.1?1:v>=0.995?0:1)+'%';
 const english=()=>!!window.petyaLanguage&&window.petyaLanguage!=='ru';
 const plural=(n,[a,b,c])=>{if(english())return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const feature=(method,...args)=>window.petya.feature('funnels',method,...args);
 const u=(ru,en)=>english()?en:ru;
 function duration(sec){
  if(sec===null||sec===undefined||!Number.isFinite(sec))return '';
  const s=Math.round(sec);
  if(s<60)return s+' '+u('с','s');
  if(s<3600)return Math.floor(s/60)+' '+u('мин','min')+(s%60&&s<600?' '+s%60+' '+u('с','s'):'');
  if(s<86400)return Math.floor(s/3600)+' '+u('ч','h')+(Math.floor(s%3600/60)?' '+Math.floor(s%3600/60)+' '+u('мин','min'):'');
  return Math.floor(s/86400)+' '+u('д','d')+(Math.floor(s%86400/3600)?' '+Math.floor(s%86400/3600)+' '+u('ч','h'):'');
 }
 const range=r=>!r?'':r.hi===null?'> '+duration(r.lo):(r.lo?duration(r.lo):'0')+'–'+duration(r.hi);
 const PLATFORM={android:'Android',ios:'iOS'};
 const DIMS=[['platform','Платформа'],['country','Страна'],['version','Версия']];
 const region=code=>{try{return new Intl.DisplayNames([locale()],{type:'region'}).of(code)||code;}catch{return code;}};
 const segName=(dim,row)=>row.other?(row.value===''?'не указано / другие':'другие'):dim==='platform'?(PLATFORM[row.value]||row.value):dim==='country'&&/^[A-Z]{2}$/.test(row.value)?region(row.value):row.value;
 const periodLabel=p=>{const a=new Date(p.from+'T12:00:00Z'),b=new Date(p.to+'T12:00:00Z'),o={day:'numeric',month:'short'};return a.toLocaleDateString(locale(),o)+' – '+b.toLocaleDateString(locale(),o);};

 function bars(k,c){
  const r=c.result,first=Math.max(1,r.steps[0].users);
  const list=k.el('ol','funnel-steps');
  r.steps.forEach((s,i)=>{
   if(i){
    const t=r.times[i-1],gap=k.el('li','funnel-gap'+(i===r.worst?' worst':''));gap.dataset.step=String(i);
    const lost=raw(k.el('span','funnel-lost',s.fromPrev===null?'—':'−'+pct(1-s.fromPrev)));
    gap.append(k.el('span','funnel-arrow','↓'),lost,raw(k.el('span','funnel-lost-n',fmt(s.lost)+' '+plural(s.lost,['ушёл','ушли','ушли']))));
    const when=t?(t.median!==null&&t.median!==undefined?duration(t.median):range(t.range)):'';
    if(when){const time=k.el('span','funnel-time');time.append(k.el('span',null,t.exact?'медиана ':'медиана ≈ '),raw(k.el('b',null,when)));time.title=t.exact?(english()?'90% of players: up to ':'90% игроков — до ')+duration(t.p90):'Время из SQL по интервалам: '+when;gap.append(time);}
    if(i===r.worst)gap.append(k.el('span','funnel-worst','главный отвал'));
    list.append(gap);
   }
   const li=k.el('li','funnel-step');li.dataset.step=String(i);
   const head=k.el('div','funnel-step-head');
   head.append(k.el('span','funnel-n',String(i+1)),raw(k.el('span','funnel-label',s.label)));
   if(s.label!==s.event)head.lastChild.title=s.event;
   head.append(raw(k.el('span','funnel-users',fmt(s.users))),raw(k.el('span','funnel-share',pct(s.fromStart))));
   const track=k.el('div','funnel-track'),bar=k.el('div','funnel-bar');bar.style.width=Math.max(s.users?1.5:0,s.users/first*100).toFixed(2)+'%';
   track.append(bar);li.append(head,track);list.append(li);
  });
  return list;
 }

 function segments(k,c,state){
  const box=k.el('div','funnel-segments');
  const have=DIMS.filter(([d])=>c.result.segments?.[d]?.length);
  if(!have.length&&c.source?.kind!=='sql')return null;
  const head=k.el('div','funnel-seg-head');head.append(k.el('span','funnel-section','Сравнение'));
  const chips=k.el('div','funnel-seg-chips');chips.setAttribute('role','group');
  for(const [d,label] of DIMS){
   const local=!!c.result.segments?.[d]?.length;
   const sqlOk=c.source?.kind==='sql'&&c.table?.[d];
   if(!local&&!sqlOk)continue;
   const chip=k.chip({label,tone:state.dim===d?'accent':'',onClick:()=>{if(local){state.dim=d;state.redraw();}else k.ask(String(c.question||'воронка '+c.title.toLowerCase()).replace(/\s+по\s+(?:платформ|стран|верси)\p{L}*/iu,'')+' по '+{platform:'платформам',country:'странам',version:'версиям'}[d],{send:true});},title:local?'':'Новый запрос к базе'});
   chip.dataset.dim=d;chip.setAttribute('aria-pressed',String(state.dim===d));chips.append(chip);
  }
  head.append(chips);box.append(head);
  const rows=c.result.segments?.[state.dim]||[];
  if(!rows.length){box.append(k.el('p','funnel-note','Для этого разреза нужен новый запрос.'));return box;}
  const table=k.el('table','funnel-seg-table');
  const tr0=k.el('tr');tr0.append(k.el('th',null,''),k.el('th','num','Начали'));
  c.result.steps.slice(1).forEach((s,i)=>{const th=raw(k.el('th','step',String(i+2)));th.title=s.label;tr0.append(th);});
  tr0.append(k.el('th','num','Итог'));
  const thead=k.el('thead');thead.append(tr0);const tbody=k.el('tbody');
  const total=c.result.conversion;
  for(const row of rows){
   const tr=k.el('tr');tr.dataset.segment=row.value;
   tr.append(raw(k.el('td','name',segName(state.dim,row))),raw(k.el('td','num',fmt(row.users[0]))));
   row.fromStart.slice(1).forEach((v,i)=>{const td=k.el('td','cell');const b=k.el('span','funnel-mini');b.style.width=Math.round((v||0)*100)+'%';td.append(b);td.title=c.result.steps[i+1].label+': '+pct(v)+' ('+fmt(row.users[i+1])+')';tr.append(td);});
   const end=raw(k.el('td','num conv',pct(row.conversion)));
   if(row.conversion!==null&&total!==null&&row.users[0]>=30){const d=row.conversion-total;if(Math.abs(d)>=0.02)end.classList.add(d>0?'better':'worse');}
   tr.append(end);tbody.append(tr);
  }
  table.append(thead,tbody);box.append(table);
  return box;
 }

 function sqlBlock(k,c){
  const box=k.el('div','funnel-sql');
  const what=c.phase==='events'?'Шаг 1 из 2: события периода в таблице ':'Запрос воронки к таблице ';
  const p=k.el('p','funnel-what');p.append(k.el('span',null,what),raw(k.el('b',null,c.table?.table||'')));box.append(p);
  if(c.steps?.length){const chips=k.el('div','funnel-chips');c.steps.forEach((s,i)=>{if(i)chips.append(k.el('span','funnel-chev','→'));chips.append(raw(k.el('span','funnel-chip',s.label)));});box.append(chips);}
  const pre=raw(k.el('pre','funnel-code selectable',c.sql));box.append(pre);
  const e=c.estimate;
  const est=k.el('p','funnel-est');
  if(e?.kind==='bytes')est.append(k.el('span',null,'Прочитает ≈ '),raw(k.el('b',null,fmt(e.value/1024**3,2)+' '+u('ГБ','GB'))));
  else if(e?.kind==='rows')est.append(k.el('span',null,'Прочитает ≈ '),raw(k.el('b',null,fmt(e.value)+' '+plural(Math.round(e.value),['строку','строки','строк']))));
  else est.append(k.el('span',null,'Стоимость заранее не известна'));
  box.append(est);
  return box;
 }

 function render(parent,c,before){
  const k=window.resultKit;
  const state={dim:DIMS.map(([d])=>d).find(d=>d===c.segment&&c.result?.segments?.[d]?.length)||DIMS.map(([d])=>d).find(d=>c.result?.segments?.[d]?.length)||c.segment||'platform'};
  const body=k.el('div','funnel-body');
  let status,actions=[];
  if(c.state==='pending'){
   body.append(sqlBlock(k,c));
   status={label:'ждёт запуска',tone:'progress'};
   actions.push({label:'Выполнить',primary:true,run:async b=>{b.textContent='Выполняю…';const next=await feature('run',c.id);const holder=document.createElement('div');card.replaceWith(holder);render(holder.parentNode,next,holder);holder.remove();}});
  }else if(c.state==='error'){
   body.append(raw(k.el('p','funnel-error',c.error||'Ошибка')));
   if(c.sql)body.append(raw(k.el('pre','funnel-code selectable',c.sql)));
   status={label:'ошибка',tone:'alert'};
  }else{
   body.append(bars(k,c));
   const seg=k.el('div');body.append(seg);
   state.redraw=()=>{const next=segments(k,c,state);seg.replaceChildren(...(next?[next]:[]));};state.redraw();
   if(c.truncated)body.append(k.el('p','funnel-note','Данные обрезаны по объёму — числа неполные.'));
   if(c.sql){const d=k.el('details','funnel-sql-done');d.append(k.el('summary',null,'SQL'),raw(k.el('pre','funnel-code selectable',c.sql)));body.append(d);}
   const conv=c.result.conversion;
   status={label:pct(conv)+' '+u('до конца','to the end'),tone:conv===null?'progress':conv>=0.5?'done':conv>=0.2?'progress':'alert'};
   const save={label:c.saved?'Воронка сохранена':'Сохранить воронку',run:async b=>{if(c.saved)return;const r=await feature('save',c.id);c.saved=true;b.textContent=window.t?window.t('Воронка сохранена'):'Воронка сохранена';b.dataset.saved='true';k.toast((window.t?window.t('Сохранено в проекте'):'Сохранено в проекте')+' «'+r.project+'»');}};
   actions.push(save);
   actions.push(k.links('spreadsheet-export',()=>({title:'Воронка · '+c.title+' · '+c.period.from+' – '+c.period.to,sheet:'Воронка',app:'Воронки',
    header:['Шаг','Название','Событие','Игроков','% от начала','% от прошлого шага','Ушли','Медиана времени, с'],
    rows:c.result.steps.map((s,i)=>{const t=i?c.result.times[i-1]:null;return [i+1,s.label,s.event,s.users,s.fromStart===null?'':Math.round(s.fromStart*10000)/100,s.fromPrev===null?'':Math.round(s.fromPrev*10000)/100,s.lost,t?.median!=null?Math.round(t.median):t?.range?t.range.lo+'–'+(t.range.hi??'∞'):''];})}),{label:'Выгрузить в Google Таблицы'}));
  }
  const subtitle=[periodLabel(c.period),c.source?.name].filter(Boolean).join(' · ');
  const card=k.card({app:'Воронки',initial:'В',color:'#4f5d8a',key:c.title,status,subtitle,body,actions,className:'funnel-card'});
  card.dataset.state=c.state;card.dataset.card=c.id;
  const key=card.querySelector('.kit-key');if(key)raw(key);
  const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  const saveBtn=[...card.querySelectorAll('.kit-actions button')].find(b=>!b.closest('.kit-links')&&c.state==='done');
  if(saveBtn){saveBtn.dataset.action='save';if(c.saved)saveBtn.dataset.saved='true';}
  if(before)parent.insertBefore(card,before);else parent.append(card);
  return card;
 }
 window.renderFunnelCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.id||parent.querySelector('.funnel-card'))return;
  render(parent,c);
 };
})();
