// «Ретро», renderer: velocity bars with this sprint highlighted, tiles (done / carry-over / bugs / CI / incidents),
// the sprint's timeline with the dated facts, three columns «Хорошо / Плохо / Попробовать» whose items point at their
// facts (F1, F2… — hover shows the fact, click highlights it in the list), team votes per item (stored by the app,
// restored when the card is drawn again) and the facts with links to their sources. Action items go to the task
// tracker only through the `task-tracker` link (the tracker previews and asks before creating anything).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('retro-cards.css',document.currentScript.src).href;document.head.append(style);
 const SVG='http://www.w3.org/2000/svg';
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=n=>Number(n||0).toLocaleString(locale(),{maximumFractionDigits:1});
 const date=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'});};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const svg=(tag,attrs={})=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const call=(method,...args)=>window.petya.feature('retro',method,...args);
 const COLS=[['good','Хорошо'],['bad','Плохо'],['try','Попробовать']];
 const KIND={velocity:'скорость',carry:'перенос',bugs:'баги',estimate:'оценки',ci:'CI',incident:'инцидент',decision:'решение',complaint:'жалоба',open:'вопрос'};

 function velocity(k,c){
  const box=k.el('div','retro-velocity');
  const v=c.velocity,rows=v.sprints||[];
  const head=k.el('div','retro-panel-head');head.append(k.el('span',null,'Скорость'),k.el('span','retro-muted',v.average?'в среднем '+num(v.average):''));
  box.append(head);
  if(!rows.length)return box;
  const W=230,H=96,bottom=18,top=10,max=Math.max(1,...rows.map(r=>Math.max(r.completed,r.committed))),gap=8,bw=(W-gap*(rows.length+1))/rows.length;
  const y=val=>top+(H-top-bottom)*(1-val/max);
  const chart=svg('svg',{viewBox:'0 0 '+W+' '+H,class:'retro-velocity-chart',role:'img','aria-label':'Скорость по спринтам'});
  rows.forEach((r,i)=>{
   const x=gap+i*(bw+gap),mine=i===rows.length-1;
   const g=svg('g',{class:'bar'+(mine?' mine':'')});
   const t=svg('title');t.textContent=r.name+': '+num(r.completed)+' / '+num(r.committed);g.append(t);
   g.append(svg('rect',{x,y:y(r.committed),width:bw,height:Math.max(0,H-bottom-y(r.committed)),rx:3,class:'committed'}));
   g.append(svg('rect',{x:x+3,y:y(r.completed),width:Math.max(2,bw-6),height:Math.max(1,H-bottom-y(r.completed)),rx:2,class:'completed'}));
   const label=svg('text',{x:x+bw/2,y:H-5,'text-anchor':'middle',class:'label','data-no-i18n':''});label.textContent=(String(r.name).match(/\d+$/)||[String(r.name).slice(0,4)])[0];g.append(label);
   chart.append(g);
  });
  if(v.average){const ay=y(v.average);chart.append(svg('line',{x1:2,x2:W-2,y1:ay,y2:ay,class:'average'}));}
  box.append(chart);
  return box;
 }

 function tiles(k,c){
  const box=k.el('div','retro-tiles');
  const fact=kind=>c.facts.find(f=>f.kind===kind);
  const tile=(value,label,tone,title)=>{const t=k.el('div','retro-tile'+(tone?' tone-'+tone:''));t.append(raw(k.el('b',null,value)),k.el('span',null,label));if(title)t.title=title;box.append(t);};
  const v=fact('velocity')?.value;
  if(v)tile(num(v.completed)+' / '+num(v.committed),'сделано из взятого',fact('velocity').tone);
  const carry=fact('carry')?.value;
  if(carry)tile(String(carry.count),'перенос',carry.count?'bad':'good');
  const bugs=fact('bugs')?.value;
  if(bugs)tile(bugs.open+' / '+bugs.total,'багов открыто',bugs.open?'bad':'good');
  const ci=c.facts.filter(f=>f.kind==='ci'&&f.value);
  if(c.sources.ci)tile(String(ci.reduce((n,f)=>n+f.value.failed,0)),'падений CI',ci.some(f=>f.value.failed)?'bad':'good');
  if(c.sources.monitoring){const n=c.facts.filter(f=>f.kind==='incident').length;tile(String(n),'инцидентов',n?'bad':'good');}
  return box;
 }

 // The sprint's days with a mark for every dated fact.
 function timeline(k,c,focus){
  const dated=c.facts.filter(f=>f.at);
  const from=Date.parse(c.sprint.start),to=Math.max(Date.parse(c.sprint.end)||0,...dated.map(f=>Date.parse(f.at)));
  if(!dated.length||!(to>from))return null;
  const box=k.el('div','retro-timeline');
  const W=600,H=46;
  const chart=svg('svg',{viewBox:'0 0 '+W+' '+H,class:'retro-timeline-chart',role:'img','aria-label':'События спринта по дням'});
  chart.append(svg('line',{x1:6,x2:W-6,y1:22,y2:22,class:'axis'}));
  const x=t=>6+(W-12)*Math.min(1,Math.max(0,(t-from)/(to-from)));
  const days=Math.round((to-from)/86400000);
  for(let d=0;d<=days;d++){const t=from+d*86400000;chart.append(svg('line',{x1:x(t),x2:x(t),y1:19,y2:25,class:'tick'}));}
  const lanes={};
  for(const f of dated){
   const cx=x(Date.parse(f.at));const lane=lanes[Math.round(cx/10)]=(lanes[Math.round(cx/10)]||0)+1;
   const dot=svg('circle',{cx,cy:22+(lane%2?-1:1)*Math.min(14,(lane-1)*6),r:4.5,class:'dot tone-'+f.tone+' kind-'+f.kind,tabindex:'0'});
   const t=svg('title');t.textContent=f.id+' · '+date(f.at)+' · '+f.text;dot.append(t);
   dot.addEventListener('click',()=>focus(f.id));
   chart.append(dot);
  }
  const a=svg('text',{x:6,y:43,class:'label'});a.textContent=date(c.sprint.start);chart.append(a);
  const b=svg('text',{x:W-6,y:43,'text-anchor':'end',class:'label'});b.textContent=date(new Date(to).toISOString());chart.append(b);
  const legend=k.el('div','retro-legend');
  const key=(tone,label)=>{const s=k.el('span');s.append(k.el('i','tone-'+tone),label);return s;};
  legend.append(k.el('span','retro-legend-title','События спринта'),key('good','хорошо'),key('bad','плохо'));
  box.append(legend,chart);
  return box;
 }

 function columns(k,c,state,focus){
  const box=k.el('div','retro-columns');
  const facts=new Map(c.facts.map(f=>[f.id,f]));
  for(const [col,title] of COLS){
   const column=k.el('section','retro-col col-'+col);
   const head=k.el('div','retro-col-head');head.append(k.el('span',null,title),k.el('span','retro-muted',String(c.drafts[col].length)));
   column.append(head);
   if(!c.drafts[col].length)column.append(k.el('p','retro-empty','Нечего добавить по фактам.'));
   for(const item of c.drafts[col]){
    const row=k.el('div','retro-item');row.dataset.item=item.id;
    row.append(raw(k.el('p','retro-text',item.text)));
    const refs=k.el('div','retro-refs');
    for(const id of item.facts){const f=facts.get(id);if(!f)continue;const ref=k.el('button','retro-ref',id);ref.type='button';ref.title=f.text;ref.onclick=e=>{e.stopPropagation();focus(id);};refs.append(ref);}
    const votes=k.el('div','retro-votes');
    refs.append(votes);
    row.append(refs);
    if(col==='try')row.append(k.links('task-tracker',()=>({title:item.text,description:'Из ретро «'+c.sprint.name+'». Основание: '+item.facts.map(id=>facts.get(id)?.text).filter(Boolean).join('; '),link:item.facts.map(id=>facts.get(id)?.source?.url).find(Boolean)||''}),{label:'В задачу',className:'retro-task'}));
    state.rows.set(item.id,{votes,item,col});
    column.append(row);
   }
   box.append(column);
  }
  return box;
 }

 function paintVotes(k,c,state){
  const voters=c.team.length?c.team:[{key:'me',name:'Мой голос'}];
  for(const [id,r] of state.rows){
   const list=state.votes[id]||[];
   r.votes.replaceChildren();
   const who=k.el('span','retro-voters');
   for(const key of list.slice(0,4)){const p=voters.find(v=>v.key===key);if(p&&c.team.length)who.append(k.avatar(p.name,{size:16}));}
   const label=(list.length?'Голоса: '+list.length:'Голосовать');
   let chip;
   if(c.team.length){
    chip=k.chip({label,title:'Отметьте, кто из команды голосует за пункт',menu:async()=>voters.map(v=>({label:((state.votes[id]||[]).includes(v.key)?'✓ ':'')+v.name,id:v.key,who:v.name})),
     pick:async option=>toggle(k,c,state,id,option.id)});
   }else chip=k.chip({label,title:'Голос за пункт',onClick:()=>toggle(k,c,state,id,'me')});
   chip.classList.add('retro-vote');if(list.length)chip.classList.add('voted');
   r.votes.append(who,chip);
  }
 }
 async function toggle(k,c,state,itemId,voter){
  const on=!(state.votes[itemId]||[]).includes(voter);
  try{state.votes=await call('vote',c.retroId,itemId,voter,on)||state.votes;paintVotes(k,c,state);}
  catch(e){k.toast(e.message,{error:true});}
 }

 function factList(k,c){
  const box=k.el('div','retro-facts');
  const head=k.el('div','retro-panel-head');head.append(k.el('span',null,'Факты спринта'),k.el('span','retro-muted',String(c.facts.length)));
  box.append(head);
  const rows=[];
  for(const f of c.facts){
   const row=k.el('div','retro-fact tone-'+f.tone);row.dataset.fact=f.id;
   row.append(k.el('span','retro-fact-id',f.id));
   const main=k.el('div','retro-fact-main');
   main.append(raw(k.el('span','retro-fact-text',f.text)));
   const meta=k.el('div','retro-fact-meta');
   meta.append(k.el('span','retro-kind',KIND[f.kind]||f.kind));
   const url=k.safeUrl?.(f.source.url)||'';
   const src=raw(k.el(url?'a':'span','retro-source',f.source.label||f.source.name));
   if(url){src.href=url;src.target='_blank';src.rel='noopener';}
   meta.append(src);
   if(f.author)meta.append(raw(k.el('span','retro-muted',f.author)));
   if(f.at)meta.append(k.el('span','retro-muted',date(f.at)));
   main.append(meta);
   if(f.issues?.length){
    const keys=k.el('div','retro-keys');
    for(const i of f.issues.slice(0,6)){const u=k.safeUrl?.(i.url)||'';const a=raw(k.el(u?'a':'span','retro-key'+(i.done?' done':''),i.key));if(u){a.href=u;a.target='_blank';a.rel='noopener';}a.title=i.summary||'';keys.append(a);}
    main.append(keys);
   }
   row.append(main);rows.push(row);
  }
  box.append(k.collapse(rows,6,'Остальные факты'));
  return box;
 }

 window.renderRetroCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.sprint||parent.querySelector('.retro-card'))return;
  const state={rows:new Map(),votes:{}};
  const body=k.el('div','retro-body');
  let facts;
  const focus=id=>{const row=facts?.querySelector('[data-fact="'+id+'"]');if(!row)return;row.closest('details')?.setAttribute('open','');row.classList.remove('flash');void row.offsetWidth;row.classList.add('flash');row.scrollIntoView?.({block:'nearest',behavior:'smooth'});};
  const top=k.el('div','retro-top');top.append(velocity(k,c),tiles(k,c));
  body.append(top);
  const line=timeline(k,c,focus);if(line)body.append(line);
  body.append(columns(k,c,state,focus));
  facts=factList(k,c);body.append(facts);
  if(c.notes?.length){const notes=k.el('ul','retro-notes');for(const n of c.notes)notes.append(raw(k.el('li',null,n)));body.append(notes);}
  const shareText=()=>'Ретро «'+c.sprint.name+'». Проголосуйте за пункты (номер +1):\n'+COLS.flatMap(([col,title])=>c.drafts[col].map(i=>i.id+' — '+title+': '+i.text)).join('\n');
  const tasks=()=>({title:'Ретро «'+c.sprint.name+'»',tasks:[...c.drafts.try].sort((a,b)=>(state.votes[b.id]||[]).length-(state.votes[a.id]||[]).length).map(i=>i.text)});
  const span=c.sprint.start?date(c.sprint.start)+' – '+date(c.sprint.end):'';
  const status=c.sprint.state==='active'?{label:'спринт идёт',tone:'progress'}:{label:'спринт закрыт',tone:'done'};
  const card=k.card({app:'Ретро',initial:'Р',color:'#6a5a8c',status,subtitle:span,title:c.sprint.name,body,className:'retro-card',
   meta:['Jira · '+c.project,c.drafts.by==='rules'?'черновики по правилам':'черновики — локальная модель, проверены по фактам'],
   actions:[
    k.links('task-tracker',tasks,{label:'Создать задачи из «Попробовать»',primary:true}),
    k.links('share-message',()=>({text:shareText()}),{label:'Отправить на голосование'}),
    {label:'Обновить',run:()=>k.ask('Подготовь ретро'+(c.sprint.name?' по спринту «'+c.sprint.name+'»':''),{send:true})}
   ]});
  card.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  parent.append(card);
  paintVotes(k,c,state);
  if(c.retroId&&window.petya?.feature)call('votes',c.retroId).then(v=>{if(v&&typeof v==='object'){state.votes=v;paintVotes(k,c,state);}}).catch(()=>{});
 };
})();
