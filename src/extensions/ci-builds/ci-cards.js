// «Сборки», renderer: the failed run (job, step, first error lines), a history strip per workflow (last runs as
// coloured squares) and the recent runs with status, branch, commit title, duration and age.
// «Перезапустить» asks for confirmation inside the card before calling the app. A failed run gets cross-app links:
// the Programmer (the error as a chat request), a task in the connected tracker and a message to the team.
(()=>{
 const U=unit=>' '+(/^ru/i.test(window.petyaLocale||'ru')?unit:({ТБ:'TB',ГБ:'GB',МБ:'MB',КБ:'KB',Б:'B',с:'s',мин:'min',ч:'h'}[unit]||unit));
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('ci-cards.css',document.currentScript.src).href;document.head.append(style);
 const STATUS={success:['успешно','done','✓'],failure:['упала','alert','✗'],running:['идёт','progress','◐'],queued:['в очереди','progress','…'],cancelled:['отменена','','⊘'],skipped:['пропущена','','–'],unknown:['неизвестно','','?']};
 const label=s=>(STATUS[s]||STATUS.unknown)[0],tone=s=>(STATUS[s]||STATUS.unknown)[1];
 const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);if(!Number.isFinite(m))return '';if(m<1)return 'только что';if(m<60)return m+' мин назад';const h=Math.round(m/60);if(h<24)return h+' ч назад';const d=Math.round(h/24);return d+' дн назад';};
 const duration=sec=>{if(!Number.isFinite(sec)||sec===null)return '';if(sec<60)return sec+U('с');const m=Math.floor(sec/60),s=sec%60;if(m<60)return m+U('мин')+(s&&m<10?' '+s+U('с'):'');return Math.floor(m/60)+U('ч')+' '+(m%60)+U('мин');};
 const open=(k,url)=>{const safe=k.safeUrl(url||'');if(safe)window.open(safe,'_blank','noopener');else k.toast('Ссылки на эту сборку нет',{error:true});};
 const sourceName=s=>s==='unity'?'Unity':'GitHub';
 // Service content (commit titles, workflow/job names, branches, logs) is left alone by the interface translator.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const PLATFORM={android:'Android',ios:'iOS',webgl:'WebGL',windows:'Windows',mac:'macOS',linux:'Linux'};

 function failureBlock(k,f){
  const box=k.el('div','ci-failure');
  const head=k.el('div','ci-failure-head');
  head.append(k.el('span','ci-dot failure'),raw(k.el('strong',null,f.workflow+(f.number!==undefined?' #'+f.number:''))));
  if(f.branch)head.append(raw(k.el('code','ci-branch',f.branch)));
  if(f.at)head.append(k.el('span','ci-muted',ago(f.at)));
  box.append(head);
  if(f.title)box.append(raw(k.el('div','ci-commit',f.title)));
  if(f.job||f.step){const path=raw(k.el('div','ci-path'));if(f.job)path.append(k.el('span','ci-job',f.job));if(f.job&&f.step)path.append(k.el('span','ci-arrow','→'));if(f.step)path.append(k.el('span','ci-step',f.step));box.append(path);}
  if(f.lines?.length){const pre=raw(k.el('div','ci-log'));pre.setAttribute('role','log');pre.setAttribute('aria-label','Первые строки ошибки');for(const line of f.lines)pre.append(k.el('div','ci-log-line',line));box.append(pre);}
  if(f.error)box.append(k.el('p','ci-warn',f.error));
  return box;
 }
 // Confirmation row for a side effect, shown inside the card; nothing is sent before «Да».
 function confirmRow(k,text,yes,run){
  const row=k.el('div','ci-confirm');row.setAttribute('role','group');row.append(k.el('span',null,text));
  const ok=k.el('button','primary',yes);ok.type='button';const no=k.el('button',null,'Отмена');no.type='button';
  no.onclick=()=>row.remove();
  ok.onclick=async()=>{ok.disabled=no.disabled=true;ok.setAttribute('aria-busy','true');try{await run();row.remove();}catch(e){k.toast(e.message,{error:true});ok.disabled=no.disabled=false;}finally{ok.removeAttribute('aria-busy');}};
  row.append(ok,no);return row;
 }
 function history(k,groups){
  const box=k.el('div','ci-history');
  for(const g of groups){
   const row=k.el('div','ci-history-row');
   const name=k.el('span','ci-history-name');name.append(k.el('span','ci-source '+g.source,sourceName(g.source)),raw(k.el('span','ci-history-title',g.name)));name.title=(g.repo?g.repo+' · ':'')+g.name;
   const strip=k.el('div','ci-strip');strip.setAttribute('role','list');strip.setAttribute('aria-label','История: '+g.name);
   for(let i=0;i<10-g.runs.length;i++)strip.append(k.el('span','ci-cell empty'));
   for(const r of g.runs){
    const text='#'+r.number+(r.branch?' · '+r.branch:'')+' · '+label(r.status)+(r.at?' · '+ago(r.at):'')+(r.title?'\n'+r.title:'');
    const cell=k.el(r.url?'a':'span','ci-cell '+r.status);cell.setAttribute('role','listitem');cell.title=text;cell.setAttribute('aria-label',text);
    if(r.url){const u=k.safeUrl(r.url);if(u){cell.href=u;cell.target='_blank';cell.rel='noopener';}}
    strip.append(cell);
   }
   const last=g.runs.at(-1);
   row.append(name,strip,k.el('span','ci-history-last '+(tone(last?.status)||'neutral'),last?label(last.status):''));
   box.append(row);
  }
  return box;
 }
 function runs(k,list){
  const ul=k.el('ul','ci-runs');
  for(const r of list){
   const li=k.el('li','ci-run');
   const status=k.el('span','ci-run-status '+r.status);status.append(k.el('span','ci-dot '+r.status),k.el('span',null,label(r.status)));
   const main=k.el('div','ci-run-main');
   const title=raw(k.safeUrl(r.url||'')?k.el('a','ci-run-title',r.title||r.workflow):k.el('span','ci-run-title',r.title||r.workflow));
   if(title.tagName==='A'){title.href=k.safeUrl(r.url);title.target='_blank';title.rel='noopener';}
   const sub=k.el('div','ci-run-sub');sub.append(raw(k.el('span',null,r.workflow+' #'+r.number)));if(r.branch)sub.append(raw(k.el('code','ci-branch',r.branch)));if(r.repo)sub.append(raw(k.el('span','ci-muted',r.repo)));
   main.append(title,sub);
   const side=k.el('div','ci-run-side');side.append(k.el('span',null,duration(r.duration)),k.el('span','ci-muted',ago(r.at)));
   li.append(status,main,side);li.setAttribute('aria-label',label(r.status)+': '+(r.title||r.workflow)+', '+r.workflow+' #'+r.number+(r.branch?', ветка '+r.branch:''));
   ul.append(li);
  }
  return ul;
 }

 window.renderCiCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.ci-card'))return;
  const body=k.el('div','ci-body');
  if(c.note)body.append(k.el('p','ci-muted ci-note',c.note));
  const f=c.failure;
  if(f)body.append(failureBlock(k,f));
  if(c.history?.length){body.append(k.el('div','ci-section',f?'История по workflow':'История по workflow · последние 10'));body.append(history(k,c.history));}
  if(c.runs?.length){body.append(k.el('div','ci-section','Последние запуски'));body.append(runs(k,c.runs));}
  else body.append(k.el('p','ci-muted','Запусков нет.'));
  for(const e of c.errors||[])body.append(k.el('p','ci-warn',e.text.startsWith(e.source)?e.text:e.source+': '+e.text));
  const running=(c.runs||[]).some(r=>r.status==='running'||r.status==='queued');
  const status=f?{label:'упала сборка',tone:'alert'}:running?{label:'идут сборки',tone:'progress'}:c.runs?.length?{label:'всё зелёное',tone:'done'}:null;
  const actions=[];
  const target=f?.url||c.runs?.[0]?.url;
  if(target)actions.push({label:'Открыть',primary:!f,run:()=>open(k,target)});
  if(f?.rerun)actions.push({label:'Перезапустить…',title:f.source==='github'?'Перезапустить упавшие jobs в GitHub Actions':'Поставить новую сборку в Unity Build Automation',run:()=>{
   if(card.querySelector('.ci-confirm'))return;
   const what=f.source==='github'?'Перезапустить упавшие jobs «'+f.workflow+'» #'+f.number+'?'+(f.repo?' · '+f.repo:''):'Запустить новую сборку «'+f.workflow+'» в Unity Build Automation?';
   card.querySelector('.kit-actions').before(confirmRow(k,what,'Перезапустить',async()=>{const r=await window.petya.feature('ciBuilds','rerun',f.rerun);k.toast(r.text);}));
  }});
  if(f){
   const run=f.workflow+(f.number!==undefined?' #'+f.number:'')+(f.repo?' в '+f.repo:'')+(f.branch?' (ветка '+f.branch+')':'');
   const where=[f.job,f.step].filter(Boolean).join(' → ');
   if(f.handoff)actions.push(k.links('code-fix',{text:f.handoff}));
   actions.push(k.links('task-tracker',{title:'Упала сборка '+run,description:(where?where+': ':'')+(f.lines||[]).slice(0,3).join(' / '),link:f.url||'',type:'bug'}),
    k.links('share-message',{text:'посмотреть упавшую сборку '+run+(where?', '+where:'')+'. '+(f.url||'')}));
  }
  if(!f)actions.push({label:'Обновить',run:()=>k.ask('Статус CI',{send:true})});
  const key=(c.repos||[]).join(', ')||(c.runs?.[0]?.source==='unity'?'Unity Build Automation':'CI');
  const card=k.card({app:'Сборки',initial:'▶',color:'#3d6b55',key,status,subtitle:c.filter?.platform||c.filter?.branch?[PLATFORM[c.filter.platform]||c.filter.platform,c.filter.branch].filter(Boolean).join(' · '):'',body,actions,className:'ci-card'});
  card.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  parent.append(card);
 };
})();
