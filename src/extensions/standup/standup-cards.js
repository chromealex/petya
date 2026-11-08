// «Стендап», renderer: tiles (answered, blockers, silent), an answers bar (answered in Slack / drafted from Jira and
// git / no answer), and one row per person — avatar, source, «нет ответа», and three columns «Вчера / Сегодня /
// Блокеры» with issue links and blockers in alert tone. Actions go through other apps' confirmed flows:
// the summary and the thread question to Slack (share-message), blockers to the task tracker (task-tracker).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('standup-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const when=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString(locale(),{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};

 function tile(k,value,label,tone=''){const b=k.el('div','standup-tile'+(tone?' '+tone:''));b.append(k.el('span','standup-value',value),k.el('span','standup-label',label));return b;}
 function bar(k,t,thread){
  const box=k.el('div','standup-bar');box.setAttribute('role','img');
  const parts=[['answered',t.answered,thread?'ответили в треде':'ответили'],['drafted',t.drafted,'черновик по Jira и git'],['silent',t.silent,thread?'нет ответа':'нет активности']];
  const total=Math.max(1,t.people);
  const track=k.el('div','standup-track'),legend=k.el('div','standup-legend');
  for(const [cls,n,label] of parts){if(!n)continue;const seg=k.el('span','seg '+cls);seg.style.flexGrow=String(n);seg.title=label+': '+n;track.append(seg);const l=k.el('span');l.append(k.el('i',cls),label+' '+n);legend.append(l);}
  box.setAttribute('aria-label',parts.filter(p=>p[1]).map(p=>p[2]+' '+p[1]).join(', ')+' из '+total);
  box.append(track,legend);return box;
 }
 function item(k,x,blocker){
  const li=k.el('li',blocker?'standup-blocker':'');
  if(x.key){const a=raw(k.el('a','standup-key',x.key));const u=k.safeUrl(x.url);if(u){a.href=u;a.target='_blank';a.rel='noopener';}li.append(a);}
  // The key is shown as a link once; the text keeps the rest («коммит: GAME-60 boss AI» → «коммит: boss AI»).
  const text=x.key&&x.text.includes(x.key)?x.text.replace(x.key,'').replace(/\s{2,}/g,' ').replace(/^[\s:—-]+|[\s:—-]+$/g,'').replace(/:\s*$/,'')||x.text:x.text;
  li.append(raw(k.el('span',null,text)));li.title=x.text;
  return li;
 }
 function column(k,cls,label,items,empty,blocker=false){
  const box=k.el('div','standup-col '+cls);box.append(k.el('div','standup-col-head',label));
  if(items.length){const ul=k.el('ul');for(const x of items.slice(0,6))ul.append(item(k,x,blocker));if(items.length>6)ul.append(k.el('li','standup-more','ещё '+(items.length-6)));box.append(ul);}
  else box.append(k.el('div','standup-none',empty));
  return box;
 }
 function person(k,p,thread){
  const row=k.el('article','standup-person'+(p.blockers.length?' blocked':'')+(p.noAnswer?' silent':''));row.dataset.source=p.source;
  const who=k.el('div','standup-who');who.append(k.avatar(p.name,{size:30}));
  const names=k.el('div','standup-names');names.append(raw(k.el('strong',null,p.name)));if(p.role)names.append(raw(k.el('small',null,p.role)));
  const chips=k.el('div','standup-chips');
  if(p.source==='slack')chips.append(k.chip({label:'ответ в треде',tone:'done',title:p.answeredAt?'Ответ в Slack: '+when(p.answeredAt):'Ответ в Slack'}));
  else if(p.source==='draft')chips.append(k.chip({label:'черновик',tone:'progress',title:'Собрано по Jira'+(p.commits?' и коммитам':'')+' — человек не отвечал'}));
  if(p.noAnswer){const c=k.chip({label:thread?'нет ответа':'нет активности',tone:'alert',title:thread?'Не ответил в треде стендапа':'Нет активности в Jira и коммитов с прошлого стендапа'});c.classList.add('standup-silent');chips.append(c);}
  if(p.blockers.length){const c=k.chip({label:p.blockers.length+' '+plural(p.blockers.length,['блокер','блокера','блокеров']),tone:'alert'});chips.append(c);}
  names.append(chips);who.append(names);
  const cols=k.el('div','standup-cols');
  cols.append(column(k,'yesterday','Вчера',p.yesterday,p.source==='slack'?'не написал':'нет активности'),column(k,'today','Сегодня',p.today,'нет задач в работе'),column(k,'blockers','Блокеры',p.blockers,'нет',true));
  row.append(who,cols);
  if(p.note){const n=raw(k.el('blockquote','standup-note',p.note));n.title='Ответ без разметки «вчера / сегодня / блокеры»';row.append(n);}
  return row;
 }
 function digest(c){
  const lines=['Стендап «'+c.project.name+'» · '+when(c.at)];
  for(const p of c.people){
   if(p.noAnswer&&!p.yesterday.length&&!p.today.length&&!p.blockers.length){lines.push(p.name+': '+(c.thread?'нет ответа':'нет активности'));continue;}
   const part=(label,list)=>list.length?label+': '+list.slice(0,4).map(x=>x.text).join('; '):'';
   lines.push(p.name+' — '+[part('вчера',p.yesterday),part('сегодня',p.today),p.blockers.length?part('БЛОКЕРЫ',p.blockers):''].filter(Boolean).join(' · '));
  }
  return lines.join('\n');
 }

 window.renderStandupCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!Array.isArray(c.people)||parent.querySelector('.standup-card'))return;
  const t=c.totals||{people:0,answered:0,drafted:0,blocked:0,blockers:0,silent:0};
  const body=k.el('div','standup-body');
  const tiles=k.el('div','standup-tiles');
  tiles.append(tile(k,(c.thread?t.answered:t.people-t.silent)+' / '+t.people,c.thread?'ответили в треде':'с активностью'),
   tile(k,String(t.blockers),plural(t.blockers,['блокер','блокера','блокеров'])+(t.blocked?' у '+t.blocked:''),t.blockers?'alert':''),
   tile(k,String(t.silent),c.thread?'нет ответа':'без активности',t.silent?'progress':''));
  body.append(tiles);
  if(t.people)body.append(bar(k,t,!!c.thread));
  const list=k.el('div','standup-people');
  if(c.people.length)list.append(k.collapse(c.people.map(p=>person(k,p,!!c.thread)),6,'Ещё участники'));
  else list.append(k.el('p','standup-empty','В «Команде» нет людей — некого спрашивать.'));
  body.append(list);
  if(c.warnings?.length){const w=k.el('ul','standup-warnings');for(const line of c.warnings)w.append(raw(k.el('li',null,line)));body.append(w);}
  const blockers=c.people.flatMap(p=>p.blockers.map(b=>({title:'Блокер у '+p.name+': '+(b.key&&!b.text.includes(b.key)?b.key+' ':'')+b.text})));
  const ask=c.thread?.url?'в треде стендапа '+c.thread.url+' — напишите, пожалуйста: Вчера: … Сегодня: … Блокеры: …':'напишите, пожалуйста, ответ на стендап: Вчера: … Сегодня: … Блокеры: …';
  const actions=[
   k.links('share-message',()=>({text:digest(c)}),{label:'Отправить сводку в Slack',primary:true}),
   ...blockers.length?[k.links('task-tracker',{title:'Стендап '+new Date(c.at).toLocaleDateString(locale(),{day:'numeric',month:'short'}),tasks:blockers},{label:'Создать задачи по блокерам'})]:[],
   k.links('share-message',{text:ask},{label:'Спросить в треде'}),
   {label:'Обновить',run:()=>k.ask('Собери стендап',{send:true})}
  ];
  const status=t.blockers?{label:t.blocked+' с блокерами',tone:'alert'}:t.silent?{label:'не все ответили',tone:'progress'}:{label:'без блокеров',tone:'done'};
  const src=[c.sources?.jira?'Jira':'',c.sources?.git?'git':'',c.sources?.slack?'Slack':''].filter(Boolean).join(' · ');
  const subtitle='с '+when(c.since)+(src?' · '+src:'')+(c.schedule?' · '+c.schedule.days+' в '+c.schedule.time:'');
  const card=k.card({app:'Стендап',initial:'С',color:'#5b4fc4',key:c.project.name+(c.jira?' · '+c.jira:''),href:c.thread?.url,status,subtitle,body,actions,className:'standup-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
