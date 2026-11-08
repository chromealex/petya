// «Агенты» screen: a board of who is working on what — Petya's background chats and agents, the Programmer,
// Claude and Codex — with one set of statuses. Data comes from the agent-board feature; the board refreshes
// while the screen is open and on chat job / coder events.
(()=>{
 const STATUS={waiting:'Ждёт тебя',running:'В работе',queued:'В очереди',sent:'Отправлена',failed:'Ошибка',stopped:'Остановлена',done:'Готово'};
 const SUMMARY=['waiting','running','queued','sent','failed'];
 const MARK={petya:'П',coder:'</>',claude:'C',codex:'X'};
 const section=$('agents');
 const link=document.createElement('link');link.rel='stylesheet';link.href='agent-board.css';document.head.append(link);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};

 const root=el('div','agent-board');root.setAttribute('aria-live','polite');
 const top=el('div','agent-board-top');
 const summary=el('div','agent-board-summary');
 const scope=el('div','agent-board-scope');scope.setAttribute('role','group');scope.setAttribute('aria-label','Какие задачи показать');
 let mode='active';try{mode=localStorage.getItem('petya-agent-board')==='all'?'all':'active';}catch{}
 for(const [id,label] of [['active','Активные'],['all','Все за неделю']]){
  const b=el('button',null,label);b.type='button';b.dataset.mode=id;
  b.onclick=()=>{mode=id;try{localStorage.setItem('petya-agent-board',id);}catch{}paint();};scope.append(b);
 }
 top.append(summary,scope);
 const lanes=el('div','agent-board-lanes');
 root.append(top,lanes);
 section.querySelector('.intro')?.after(root);
 // The older handoff history stays below the board under its own heading.
 const history=el('h2','agent-handoffs-title','Передачи Claude и Codex');
 const historyIntro=section.querySelector(':scope > .intro + .agent-board + p');
 (historyIntro||$('agent-history')).before(history);

 let data=null,busy=false,again=false,timer=null;
 function action(label,fn){const b=el('button',null,label);b.type='button';b.onclick=run(async()=>{b.disabled=true;try{await fn();}finally{b.disabled=false;}});return b;}
 async function openChat(id){await selectDialogueTopic(id);view('home');}
 function card(task){
  const item=el('article','agent-card');item.dataset.status=task.status;
  const head=el('div','agent-card-head');
  const badge=el('span','agent-status',STATUS[task.status]||task.status);
  head.append(badge);
  if(task.at){const time=el('time','agent-card-time',window.relativeTime?window.relativeTime(task.at):'');time.dateTime=new Date(task.at).toISOString();time.title=window.fullTime?window.fullTime(task.at):'';head.append(time);}
  const title=el('h3','agent-card-title',task.title);title.dataset.noI18n='';title.title=task.title;
  item.append(head,title);
  if(task.label&&task.label!==STATUS[task.status]){const label=el('p','agent-card-label',task.label);item.append(label);}
  // Names and branches are the user's data; the rest of the line is interface text.
  const meta=[],own=value=>{const span=el('span',null,value);span.dataset.noI18n='';return span;};
  if(task.role){meta.push(el('span',null,task.role));if(task.parent)meta.push(own(task.parent));}
  if(task.project)meta.push(own(task.project));
  if(task.repo)meta.push(own(task.repo+(task.branch?' · '+task.branch:'')));
  if(task.files)meta.push(el('span',null,'Файлов: '+task.files));
  if(task.keys?.length)meta.push(own(task.keys.join(', ')));
  if(task.unassigned)meta.push(el('span',null,'Агент не выбран'));
  if(meta.length){const m=el('p','agent-card-meta');m.append(...meta);item.append(m);}
  const actions=el('div','agent-card-actions');
  if(task.open?.kind==='chat')actions.append(action('Открыть чат',()=>openChat(task.open.id)));
  if(task.open?.kind==='agent'){
   if(task.open.chat)actions.append(action('Открыть чат',()=>window.petya.agentChat(task.open.id)));
   if(['sent','running','waiting'].includes(task.status))actions.append(action('Проверить',async()=>{const result=await window.petya.taskProgress(task.open.id);view('home');await showDialogueReply(result);}));
   if(task.open.origin)actions.append(action('Обсуждение',()=>openChat(task.open.origin)));
  }
  if(actions.childElementCount)item.append(actions);
  return item;
 }
 function paint(){
  for(const b of scope.children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  if(!data)return;
  summary.replaceChildren();
  const shown=SUMMARY.filter(s=>data.totals[s]);
  if(!shown.length)summary.append(el('span','agent-board-calm','Сейчас никто ничего не делает'));
  for(const s of shown){const chip=el('span','agent-chip');chip.dataset.status=s;chip.append(el('span','agent-chip-dot'),el('span',null,STATUS[s]),el('b',null,String(data.totals[s])));summary.append(chip);}
  lanes.replaceChildren();
  for(const lane of data.lanes){
   const tasks=mode==='all'?lane.tasks:lane.tasks.filter(t=>['waiting','running','queued','sent'].includes(t.status));
   const col=el('section','agent-lane');col.dataset.lane=lane.id;col.setAttribute('aria-label',lane.name);
   const head=el('header','agent-lane-head');
   const mark=el('span','agent-lane-mark',MARK[lane.id]||'');mark.setAttribute('aria-hidden','true');mark.dataset.noI18n='';
   const name=el('h2','agent-lane-name',lane.name);
   const count=el('span','agent-lane-count',lane.active?String(lane.active):'');
   if(lane.active)count.title='Активных задач: '+lane.active;
   head.append(mark,name,count);
   if(lane.tasks.some(t=>t.status==='running'))col.dataset.busy='true';
   col.append(head);
   if(tasks.length){const list=el('div','agent-lane-list');for(const t of tasks)list.append(card(t));col.append(list);}
   else{const empty=el('p','agent-lane-empty');if(lane.tasks.length)empty.textContent='Активных задач нет';else empty.append(el('span',null,'Пока пусто.'),' ',el('span',null,lane.hint));col.append(empty);}
   lanes.append(col);
  }
 }
 async function refresh(){
  if(busy){again=true;return;}busy=true;
  try{data=await window.petya.feature('agent-board','list');paint();}
  catch(e){summary.replaceChildren(el('span','agent-board-calm',e.message));}
  finally{busy=false;if(again){again=false;refresh();}}
 }
 const visible=()=>!section.hidden;
 let soon=null;const nudge=()=>{if(!visible())return;clearTimeout(soon);soon=setTimeout(refresh,250);};
 function watch(on){clearInterval(timer);timer=on?setInterval(()=>{if(visible())refresh();},5000):null;}
 document.addEventListener('petya-view',e=>{const on=e.detail==='agents';watch(on);if(on)refresh();});
 document.addEventListener('petya-chat-job',nudge);
 window.petyaEvents?.onCoderProgress?.(nudge);
 $('refresh-agents')?.addEventListener('click',()=>refresh());
 window.refreshAgentBoard=refresh;
 paint();if(visible()){watch(true);refresh();}
})();
