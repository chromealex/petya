// Task runner plugin, renderer: the work plan card — approve or correct it, then follow each agent step.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('run-cards.css',document.currentScript.src).href;document.head.append(style);
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
 const call=(method,...args)=>window.petya.feature('taskRunner',method,...args);
 const labels={waiting:'ждёт',running:'выполняется',sent:'отправлено',done:'готово',failed:'ошибка',attention:'нужно ваше внимание',skipped:'пропущен'};
 const tones={running:'progress',sent:'progress',done:'done',failed:'alert',attention:'alert'};
 const toast=(text,error)=>window.resultKit?.toast(text,{error});
 function button(text,className,handler){const b=el('button',className,text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await handler();}catch(e){toast(e.message,true);}finally{b.disabled=false;}};return b;}

 function paint(box,run,version){
  const latest=run.version===version;
  box.replaceChildren();box.dataset.state=run.state;
  const head=el('div','run-head');
  head.append(el('span','run-kind',run.task.kind==='bug'?'Исправление':'Выполнение'));
  const key=el(run.task.url?'a':'span','run-key',run.task.key);if(run.task.url){key.href=run.task.url;key.target='_blank';key.rel='noopener';}
  head.append(key,el('span','run-version','вариант '+version));
  const done=run.plan.steps.filter(s=>s.state==='done').length;
  if(latest&&run.state!=='proposed')head.append(el('span','kit-chip '+(run.state==='done'?'tone-done':run.state==='stopped'?'':'tone-progress'),run.state==='done'?'выполнено':run.state==='stopped'?'остановлено':'готово '+done+' из '+run.plan.steps.length));
  if(!latest)head.append(el('span','kit-chip','устарел'));
  box.append(head,el('h4','run-title',run.task.title));
  if(run.plan.summary)box.append(el('p','run-summary',run.plan.summary));
  if(latest&&run.state!=='proposed'){const bar=el('div','run-progress');const fill=el('span');fill.style.width=(100*done/run.plan.steps.length)+'%';bar.append(fill);bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuenow',String(done));bar.setAttribute('aria-valuemax',String(run.plan.steps.length));box.append(bar);}
  const list=el('ol','run-steps');
  for(const step of run.plan.steps){
   const li=el('li','run-step');li.dataset.state=latest?step.state:'waiting';
   const top=el('div','run-step-head');top.append(el('span','run-step-title',step.title));
   if(latest&&run.state!=='proposed')top.append(el('span','kit-chip'+(tones[step.state]?' tone-'+tones[step.state]:''),labels[step.state]||step.state));
   li.append(top);
   if(step.details)li.append(el('p','run-step-details',step.details));
   if(step.check)li.append(el('p','run-step-check','Проверка: '+step.check));
   if(latest&&step.note)li.append(el('p','run-step-note',step.note));
   if(latest&&step.result)li.append(el('p','run-step-result',step.result));
   if(latest&&run.state==='running'){
    const row=el('div','kit-actions');
    if(step.hasChat)row.append(button('Чат агента','',()=>call('openStep',run.id,step.id)));
    if(['sent','attention','failed'].includes(step.state))row.append(button('Шаг готов','',async()=>refresh(await call('stepDone',run.id,step.id))));
    if(['failed','attention'].includes(step.state))row.append(button('Повторить','',async()=>refresh(await call('retry',run.id,step.id))));
    if(row.childElementCount)li.append(row);
   }
   list.append(li);
  }
  box.append(list);
  if(run.plan.questions?.length&&latest&&run.state==='proposed'){const q=el('div','run-questions');q.append(el('strong',null,'Уточните, если знаете:'));const ul=el('ul');for(const text of run.plan.questions)ul.append(el('li',null,text));q.append(ul);box.append(q);}
  if(!latest)return;
  const actions=el('div','kit-actions run-actions');
  if(run.state==='proposed'){
   const agent=el('select','run-agent');agent.setAttribute('aria-label','Кому отдать шаги');for(const [v,t] of [['auto','Агент: выбрать автоматически'],['codex','Агент: Codex'],['claude','Агент: Claude']])agent.append(new Option(t,v));agent.value=run.agent||'auto';
   actions.append(button('Утвердить','primary',async()=>refresh(await call('approve',run.id,agent.value))),
    button('Внести правки','',()=>{const c=document.getElementById('command');if(!c)return;c.placeholder='Что поменять в плане? Например: «сначала тест, потом фикс»';c.focus();}),agent);
  }else if(run.state==='running')actions.append(button('Остановить','',async()=>refresh(await call('stop',run.id))));
  if(actions.childElementCount)box.append(actions);
  function refresh(next){paint(box,next,version);schedule(next);}
  function schedule(next){clearTimeout(box.timer);if(next.state==='running'&&box.isConnected!==false)box.timer=setTimeout(async()=>{if(!box.isConnected)return;try{refresh(await call('status',run.id));}catch{}},5000);}
  schedule(run);
 }

 window.renderTaskRun=(parent,data)=>{
  if(!data?.runId||parent.querySelector(':scope>.run-card'))return;
  const box=el('section','run-card');box.append(el('p','run-summary','Загружаю план…'));parent.append(box);
  // The plan replaces its plain-text copy (kept in the message for the chat model).
  for(const p of parent.querySelectorAll(':scope>p,:scope>ol,:scope>ul'))if(!p.closest('.run-card'))p.remove();
  call('status',data.runId).then(run=>paint(box,run,data.version)).catch(e=>{box.replaceChildren(el('p','run-summary',e.message));});
 };
})();
