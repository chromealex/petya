// «SQL по словам», renderer: the query card (the question, what the query counts, assumptions, the SQL with light
// highlighting, the estimated cost as a gauge against the limit, «Выполнить»), and after the run the result as a chart
// fitted to its shape (lines over time, bars by category, a big number) above the table. The schema card lists tables
// with their size, or one table's columns with types and comments.
// The SQL is run by the main process from the stored message (ipc `run` by card id), never from text in the page.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('sql-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=(v,d=1)=>Number(v).toLocaleString(locale(),{maximumFractionDigits:d});
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const feature=(method,...args)=>window.petya.feature('sqlWords',method,...args);
 const GB=1024**3;
 const COLORS=['#86c2ff','#c9ed9d','#e5ce8c','#f0b4a8','#c9a8f0'];
 const KINDS={clickhouse:'ClickHouse',postgres:'PostgreSQL',bigquery:'BigQuery',mysql:'MySQL'};
 function bytes(n){if(n>=GB)return fmt(n/GB,n<10*GB?2:1)+' ГБ';if(n>=1024**2)return fmt(n/1024**2)+' МБ';if(n>=1024)return fmt(n/1024)+' КБ';return fmt(n,0)+' Б';}
 function count(n){if(n>=1e9)return fmt(n/1e9)+' млрд';if(n>=1e6)return fmt(n/1e6)+' млн';if(n>=1e4)return fmt(n/1e3,0)+' тыс.';return fmt(n,0);}
 const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};

 // SQL with keywords, strings, numbers and comments marked (spans with text only).
 const KEYWORDS=new Set('select from where group by order limit with as and or not in is null join left right inner outer full cross on using having union all distinct case when then else end desc asc between like ilike over partition interval cast count sum avg min max date timestamp true false exists any array struct unnest qualify prewhere final sample fetch first rows only offset'.split(' '));
 function code(k,sql){
  const pre=raw(k.el('pre','sql-code selectable'));
  const re=/(--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*")|(`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let m,plain='';
  const flush=()=>{if(plain){pre.append(document.createTextNode(plain));plain='';}};
  while((m=re.exec(sql))){
   const [all,comment,string,quoted,number,word]=m;
   const cls=comment?'c':string?'s':number?'n':word&&KEYWORDS.has(word.toLowerCase())?'k':quoted?'q':'';
   if(!cls){plain+=all;continue;}
   flush();const span=k.el('span','sql-'+cls,all);pre.append(span);
  }
  flush();return pre;
 }

 function gauge(k,c){
  const e=c.estimate;if(!e)return null;
  const box=k.el('div','sql-cost');
  const label=k.el('div','sql-cost-label');
  let share=null,tone='done';
  if(e.kind==='bytes'){
   label.append(k.el('span',null,'Прочитает ≈ '),raw(k.el('b',null,bytes(e.value))));
   if(e.limit){label.append(k.el('span','sql-cost-limit','лимит '+bytes(e.limit)));share=e.value/e.limit;}
  }else if(e.kind==='rows'){
   label.append(k.el('span',null,c.connection.dialect==='postgres'?'Оценка планировщика ≈ ':'Прочитает ≈ '),raw(k.el('b',null,count(e.value)+' '+plural(Math.round(e.value),['строка','строки','строк']))));
   // ClickHouse: the share of the tables' rows it reads; the planner's PostgreSQL estimate has no such reference.
   if(e.of){label.append(k.el('span','sql-cost-limit','из ≈ '+count(e.of)+' в '+plural(e.tables||1,['таблице','таблицах','таблицах'])));share=Math.min(1,e.value/e.of);}
   else if(e.tables)label.append(k.el('span','sql-cost-limit',e.tables+' '+plural(e.tables,['таблица','таблицы','таблиц'])));
  }else{
   label.append(k.el('span','sql-cost-unknown','Стоимость заранее не известна'));
   if(e.note)label.title=e.note;
  }
  box.append(label);
  if(share!==null){
   tone=share>1?'alert':share>0.5?'progress':'done';
   const bar=k.el('div','sql-gauge');bar.setAttribute('role','img');bar.setAttribute('aria-label',label.textContent);
   const fill=k.el('div','sql-gauge-fill tone-'+tone);fill.style.width=Math.max(2,Math.min(100,share*100))+'%';bar.append(fill);box.append(bar);
  }
  return box;
 }

 // --- Charts ------------------------------------------------------------------------------------------------------
 function lineChart(k,ch,columns){
  const W=572,H=190,L=46,R=12,T=12,B=28;
  const box=k.el('div','sql-chart');
  const all=ch.series.flatMap(s=>s.points.map(p=>p.y)).filter(Number.isFinite);
  if(!all.length)return null;
  let lo=Math.min(0,...all),hi=Math.max(...all);if(hi===lo)hi=lo+1;
  const xs=ch.x,ix=new Map(xs.map((x,i)=>[x,i]));
  const X=i=>L+(xs.length<2?(W-L-R)/2:i*(W-L-R)/(xs.length-1)),Y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const g=svg('svg',{viewBox:'0 0 '+W+' '+H,width:'100%',role:'img','aria-label':'График по времени'});
  for(let i=0;i<=3;i++){const v=lo+(hi-lo)*i/3,y=Y(v);g.append(svg('line',{x1:L,x2:W-R,y1:y,y2:y,class:'sql-grid'}));const t=svg('text',{x:L-6,y:y+3,'text-anchor':'end',class:'sql-axis'});t.textContent=fmt(v,Math.abs(hi-lo)<10?1:0);g.append(t);}
  const ticks=[...new Set([0,Math.floor((xs.length-1)/2),xs.length-1])];
  for(const i of ticks){const t=svg('text',{x:X(i),y:H-8,'text-anchor':i===0?'start':i===xs.length-1?'end':'middle',class:'sql-axis'});t.textContent=shortDate(xs[i]);g.append(t);}
  ch.series.forEach((s,n)=>{
   const pts=s.points.filter(p=>Number.isFinite(p.y)&&ix.has(p.x)).map(p=>[X(ix.get(p.x)),Y(p.y),p]);
   g.append(svg('polyline',{points:pts.map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' '),fill:'none',stroke:COLORS[n%COLORS.length],'stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'}));
   if(pts.length<=40)for(const [x,y,p] of pts){const dot=svg('circle',{cx:x,cy:y,r:2.6,fill:COLORS[n%COLORS.length]});const title=svg('title');title.textContent=shortDate(p.x)+': '+fmt(p.y,2);dot.append(title);g.append(dot);}
  });
  box.append(g);
  const names=ch.series.map((s,n)=>({name:s.name??columns[s.column]?.name??'',color:COLORS[n%COLORS.length]}));
  if(names.length>1||names[0]?.name){const legend=k.el('div','sql-legend');for(const x of names){const item=raw(k.el('span',null));const dot=k.el('i');dot.style.background=x.color;item.append(dot,document.createTextNode(x.name));legend.append(item);}box.append(legend);}
  return box;
 }
 function shortDate(v){
  const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+'T00:00:00':v);if(isNaN(d))return String(v).slice(0,16);
  const time=/[T ]\d{2}:\d{2}/.test(v)&&!/[T ]00:00(?::00)?/.test(v);
  return d.toLocaleDateString(locale(),{day:'numeric',month:'short'})+(time?' '+d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}):'');
 }
 function barChart(k,ch,columns){
  const box=k.el('div','sql-bars');box.setAttribute('role','img');box.setAttribute('aria-label','Столбцы: '+(columns[ch.column]?.name||''));
  const max=Math.max(...ch.bars.map(b=>b.value).filter(Number.isFinite),0)||1;
  for(const b of ch.bars){
   const row=k.el('div','sql-bar-row');
   const label=raw(k.el('span','sql-bar-label',b.label));label.title=b.label;
   const track=k.el('span','sql-bar-track');const fill=k.el('span','sql-bar-fill');fill.style.width=Math.max(1,100*Math.max(0,b.value)/max)+'%';track.append(fill);
   row.append(label,track,raw(k.el('span','sql-bar-value',fmt(b.value,2))));box.append(row);
  }
  return box;
 }
 function bigNumber(k,ch,columns){
  const box=k.el('div','sql-number');box.append(raw(k.el('strong',null,fmt(ch.value,2))),raw(k.el('small',null,columns[ch.column]?.name||'')));return box;
 }
 function cell(v){if(v===null||v===undefined)return '—';if(typeof v==='number')return fmt(v,4);if(typeof v==='boolean')return v?'да':'нет';return String(v).length>140?String(v).slice(0,140)+'…':String(v);}
 function result(k,c){
  const r=c.result;if(!r)return null;
  const box=k.el('div','sql-result');
  const ch=r.chart;
  const chartNode=ch?.type==='line'?lineChart(k,ch,r.columns):ch?.type==='bars'?barChart(k,ch,r.columns):ch?.type==='number'?bigNumber(k,ch,r.columns):null;
  if(chartNode)box.append(chartNode);
  if(r.rows.length&&ch?.type!=='number'||r.columns.length>2){
   const rows=r.rows.map(row=>Object.fromEntries(row.map((v,i)=>[i,v])));
   const columns=r.columns.map((col,i)=>({label:col.name,value:row=>{const span=raw(k.el('span',typeof row[i]==='number'?'sql-num':null,cell(row[i])));return span;}}));
   const shown=k.table(columns,rows.slice(0,10));raw(shown);shown.classList.add('selectable');box.append(shown);
   if(rows.length>10){const more=k.el('details','sql-more');more.append(k.el('summary',null,'Показать все строки · '+rows.length));const all=k.table(columns,rows.slice(10));raw(all);all.classList.add('selectable');more.append(all);box.append(more);}
  }
  if(!r.rows.length)box.append(k.el('p','sql-empty','Запрос выполнен, строк нет.'));
  const meta=[r.total+(r.truncated?'+':'')+' '+plural(r.total,['строка','строки','строк']),fmt(r.elapsedMs/1000,2)+' с',r.bytesRead?'прочитано '+bytes(r.bytesRead):'',r.kept<r.total?'в карточке первые '+r.kept:''].filter(Boolean);
  box.append(k.el('small','sql-meta',meta.join(' · ')));
  return box;
 }
 const STATES={pending:['ждёт запуска','progress'],done:['выполнен','done'],error:['ошибка','alert'],rejected:['не прошёл проверку','alert'],blocked:['дороже лимита','alert']};
 function tsv(c){const r=c.result;return [r.columns.map(x=>x.name).join('\t'),...r.rows.map(row=>row.map(v=>v===null?'':String(v).replace(/[\t\n]/g,' ')).join('\t'))].join('\n');}

 function build(k,c){
  const body=k.el('div','sql-body');
  if(c.explanation)body.append(raw(k.el('p','sql-explain',c.explanation)));
  if(c.assumptions?.length){const list=k.el('ul','sql-assume');for(const a of c.assumptions)list.append(raw(k.el('li',null,a)));const d=k.el('details','sql-assume-box');d.open=c.state==='pending';d.append(k.el('summary',null,'Допущения · '+c.assumptions.length),list);body.append(d);}
  body.append(code(k,c.sql||''));
  const notes=k.el('div','sql-notes');
  if(c.limited)notes.append(k.chip({label:'LIMIT '+c.limit+' добавлен',title:'Петя ограничил число строк ответа',tone:''}));
  notes.append(k.chip({label:'только чтение',title:'Один SELECT; изменения данных запрещены проверкой и сервером',tone:'done'}));
  if(c.autoRun)notes.append(k.chip({label:'выполнен сразу: дешёвый запрос',tone:'done'}));
  body.append(notes);
  const cost=gauge(k,c);if(cost)body.append(cost);
  if(c.error)body.append(raw(k.el('p','sql-error selectable',c.error)));
  const res=result(k,c);if(res)body.append(res);
  const actions=[];
  const replace=next=>{const fresh=build(k,next);card.replaceWith(fresh);};
  if(['pending','done','error'].includes(c.state))actions.push({label:c.state==='pending'?'Выполнить':c.state==='done'?'Обновить':'Повторить',primary:c.state==='pending',run:async b=>{b.textContent='Выполняю…';const next=await feature('run',c.id);replace(next);if(next.state==='error')k.toast(next.error,{error:true});}});
  actions.push({label:'Копировать SQL',run:async()=>{await navigator.clipboard.writeText(c.sql||'');k.toast('SQL скопирован');}});
  if(c.result?.rows?.length)actions.push({label:'Копировать таблицу',run:async()=>{await navigator.clipboard.writeText(tsv(c));k.toast('Таблица скопирована');}});
  if(!c.typed)actions.push({label:'Уточнить вопрос',run:()=>k.ask(c.question+' ')});
  const [label,tone]=STATES[c.state]||STATES.pending;
  const status=c.state==='done'&&c.result?{label:c.result.total+(c.result.truncated?'+':'')+' '+plural(c.result.total,['строка','строки','строк']),tone:'done'}:{label,tone};
  const card=k.card({app:'SQL по словам',initial:'S',color:'#3f6b86',key:c.connection.name,status,subtitle:KINDS[c.connection.dialect]||'',title:c.question,body,actions,className:'sql-card'});
  card.dataset.sqlId=c.id;card.dataset.state=c.state;
  for(const n of card.querySelectorAll('.kit-key,.kit-title'))raw(n);
  return card;
 }
 window.renderSqlQuery=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.sql-card[data-sql-id="'+CSS.escape(String(c.id||''))+'"]'))return;
  parent.append(build(k,c));
 };

 window.renderSqlSchema=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.sql-schema'))return;
  const body=k.el('div','sql-body');
  if(c.table){
   const t=c.table;
   if(t.comment)body.append(raw(k.el('p','sql-explain',t.comment)));
   const list=k.el('div','sql-columns');
   for(const col of t.columns){const row=k.el('div','sql-col');row.append(raw(k.el('code','sql-col-name selectable',col.name)),raw(k.el('span','sql-col-type',col.type)),raw(k.el('span','sql-col-comment',col.comment||'')));list.append(row);}
   body.append(list);
   const status={label:t.columns.length+' '+plural(t.columns.length,['столбец','столбца','столбцов']),tone:'done'};
   const card=k.card({app:'SQL по словам',initial:'S',color:'#3f6b86',key:t.name,status,subtitle:c.connection.name+(t.rows!==null&&t.rows!==undefined?' · ≈ '+count(t.rows)+' '+plural(t.rows,['строка','строки','строк']):''),body,
    actions:[{label:'Спросить по этой таблице',run:()=>k.ask('Сколько строк в '+t.name+' за последнюю неделю?')}],className:'sql-card sql-schema'});
   raw(card.querySelector('.kit-key'));parent.append(card);return;
  }
  const max=Math.max(1,...c.tables.map(t=>Number(t.rows)||0));
  const rows=c.tables.map(t=>{
   const row=k.el('button','sql-table-row');row.type='button';row.title='Показать столбцы';
   const name=raw(k.el('code','sql-table-name',t.name));
   const size=k.el('span','sql-size');const fill=k.el('span','sql-size-fill');fill.style.width=(t.rows?Math.max(2,100*Math.log10(1+t.rows)/Math.log10(1+max)):0)+'%';size.append(fill);
   const facts=raw(k.el('span','sql-table-facts',(t.rows!==null&&t.rows!==undefined?'≈ '+count(t.rows)+' · ':'')+t.columns+' '+plural(t.columns,['столбец','столбца','столбцов'])));
   const cols=raw(k.el('span','sql-table-cols',(t.comment?t.comment+' — ':'')+t.names.join(', ')+(t.columns>t.names.length?', …':'')));
   row.append(name,size,facts,cols);
   row.onclick=()=>k.ask('Покажи схему таблицы '+t.name,{send:true});
   return row;
  });
  body.append(k.collapse(rows,12,'Ещё таблицы'));
  if(c.total>c.tables.length)body.append(k.el('small','sql-meta','Показаны '+c.tables.length+' из '+c.total));
  const card=k.card({app:'SQL по словам',initial:'S',color:'#3f6b86',key:c.connection.name,status:{label:c.total+' '+plural(c.total,['таблица','таблицы','таблиц']),tone:'done'},subtitle:(KINDS[c.connection.dialect]||'')+(c.database?' · '+c.database:''),body,
   actions:[{label:'Обновить схему',run:()=>k.ask('Обнови схему базы '+c.connection.name,{send:true})}],className:'sql-card sql-schema'});
  for(const n of card.querySelectorAll('.kit-key,.kit-subtitle'))raw(n);
  parent.append(card);
 };
})();
