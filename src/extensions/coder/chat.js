// Chat card of Petya's coding result: summary, changed files, the diff, the check, steps and the decision buttons.
(()=>{
 if(!document.getElementById('coder-style')){
  const style=document.createElement('style');style.id='coder-style';
  style.textContent='.coder-card{margin-top:10px;border:1px solid var(--line,#303637);border-radius:12px;padding:12px 14px;background:#151a19}'+
   '.coder-head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;font-size:12px;color:var(--muted,#969e9a)}.coder-head strong{color:var(--ink,#f0f2ed);font-size:13px}'+
   '.coder-files{list-style:none;margin:8px 0;padding:0;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}.coder-files li{display:flex;gap:10px}.coder-add{color:#8fd694}.coder-del{color:#f19a8f}'+
   '.coder-card details{margin-top:6px}.coder-card summary{cursor:pointer;font-size:12px;color:var(--muted,#969e9a)}'+
   '.coder-diff{max-height:420px;overflow:auto;margin:6px 0;padding:8px 0;border-radius:8px;background:#0e1211;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}'+
   '.coder-diff div{padding:0 10px;white-space:pre-wrap;overflow-wrap:anywhere}.coder-diff .a{background:#16301c;color:#b9f0bd}.coder-diff .d{background:#3a1b18;color:#ffc9c0}.coder-diff .h{color:#7fb0d6}.coder-diff .f{color:#d0f596;font-weight:600;margin-top:6px}'+
   '.coder-check{font-size:12px;margin:6px 0}.coder-check.ok{color:#8fd694}.coder-check.bad{color:#f19a8f}.coder-output{max-height:220px;overflow:auto;font:11px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:#0e1211;padding:8px;border-radius:8px}'+
   '.coder-steps{margin:6px 0;padding-left:18px;font-size:12px;color:var(--muted,#969e9a)}.coder-steps .bad{color:#f19a8f}'+
   '.coder-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.coder-actions button{padding:7px 13px;font-size:12px}';
  document.head.append(style);
 }
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const STATES={review:'ждёт решения',running:'работаю…',merged:'влито',kept:'в ветке',discarded:'отклонено',failed:'ошибка',empty:'без изменений'};
 function send(text){
  const input=document.getElementById('command');if(!input)return;
  input.value=text;input.dispatchEvent(new Event('input'));
  if(window.sendChatNow)window.sendChatNow();else document.getElementById('command-form')?.requestSubmit();
 }
 function diff(patch){
  const box=el('div','coder-diff');
  for(const line of String(patch||'').split('\n').slice(0,4000)){
   const cls=line.startsWith('diff --git')?'f':line.startsWith('@@')?'h':line.startsWith('+++')||line.startsWith('---')||line.startsWith('index ')?null:line.startsWith('+')?'a':line.startsWith('-')?'d':'';
   if(cls===null)continue;
   box.append(el('div',cls,cls==='f'?line.replace(/^diff --git a\/(\S+) b\/.*$/,'$1'):line||' '));
  }
  return box;
 }
 window.renderCodingRun=function(parent,run){
  const card=el('section','coder-card');card.dataset.coderRun=run.id;
  const head=el('div','coder-head');
  head.append(el('strong',null,'Программист · '+(STATES[run.state]||run.state)));
  if(run.branch)head.append(el('span',null,run.repo+' → '+run.branch));
  if(run.files?.length)head.append(el('span',null,run.files.length+' файл(ов), +'+(run.added||0)+' −'+(run.removed||0)));
  if(run.model)head.append(el('span',null,run.model));
  card.append(head);
  if(run.files?.length){
   const list=el('ul','coder-files');
   for(const f of run.files.slice(0,40)){const li=el('li');li.append(el('span','coder-add','+'+f.added),el('span','coder-del','−'+f.removed),el('span',null,f.path));list.append(li);}
   card.append(list);
  }
  if(run.verification){
   card.append(el('div','coder-check '+(run.verification.ok?'ok':'bad'),(run.verification.ok?'✓ ':'✗ ')+run.verification.command+(run.verification.ok?' — прошло':' — код '+run.verification.exitCode)));
   if(!run.verification.ok&&run.verification.output){const d=el('details');d.append(el('summary',null,'Вывод проверки'),el('pre','coder-output',run.verification.output));card.append(d);}
  }
  if(run.patch){const d=el('details');d.open=run.state==='review'&&String(run.patch).length<6000;d.append(el('summary',null,'Изменения'),diff(run.patch));card.append(d);}
  if(run.steps?.length){
   const d=el('details'),ol=el('ol','coder-steps');d.append(el('summary',null,'Шаги ('+run.steps.length+')'));
   for(const step of run.steps){const li=el('li',step.ok?'':'bad',step.label+(step.note?' — '+step.note:''));ol.append(li);}
   d.append(ol);card.append(d);
  }
  if(run.state==='review'&&run.files?.length){
   const actions=el('div','coder-actions');
   const button=(label,command,primary)=>{const b=el('button',primary?'primary':'',label);b.type='button';b.onclick=()=>{actions.querySelectorAll('button').forEach(x=>x.disabled=true);send(command);};return b;};
   actions.append(button('Принять и влить','Прими',true),button('Оставить в ветке','Оставь в ветке'),button('Отклонить','Отклони'));
   card.append(actions);
  }
  parent.append(card);
 };
})();
