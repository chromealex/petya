// «Запись экрана → баг», renderer. Two cards:
// - the choice: previews of screens and windows (the user picks one — nothing is recorded before «Начать запись»),
//   the game's log and the system info as switches, then the running recording with its time and «Стоп»;
// - the report: the recording's last frame and length, a timeline of the log's errors and warnings over the
//   recording, editable steps (the user's) / expected / actual (by the log, its lines cited), environment and
//   attachments; the tracker through k.links('task-tracker') and, once the task exists, «Прикрепить запись и лог».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('screen-bug-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('screenBug',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const clock=ms=>{const s=Math.round((Number(ms)||0)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
 const MB=n=>(Number(n||0)/1e6).toLocaleString(locale(),{maximumFractionDigits:1})+' МБ';
 const SAFE_IMG=/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/;
 const img=(k,url,cls)=>{const i=k.el('img',cls);i.alt='';if(SAFE_IMG.test(url||''))i.src=url;return i;};

 // --- The choice --------------------------------------------------------------------------------------------------------
 function pickCard(k,d,parent){
  let chosen=null,recording=null,timer=null;
  const body=k.el('div','sbug-body');
  const grid=k.el('div','sbug-sources');grid.setAttribute('role','radiogroup');grid.setAttribute('aria-label','Что записать');
  const tiles=d.sources.map(src=>{
   const b=k.el('button','sbug-source');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.dataset.id=src.id;
   const pic=k.el('span','sbug-thumb');pic.append(img(k,src.thumb));
   const name=k.el('span','sbug-source-name',src.name);if(src.kind==='window')name.dataset.noI18n='';
   b.append(pic,k.el('span','sbug-kind',src.kind==='screen'?'экран':'окно'),name);
   b.onclick=()=>{if(recording)return;chosen=src.id;for(const t of tiles)t.setAttribute('aria-checked',String(t===b));go.disabled=false;go.textContent='Начать запись · '+src.name;};
   return b;
  });
  grid.append(...tiles);
  const opts=k.el('div','sbug-options');
  const logRow=k.el('label','sbug-option');const logBox=k.el('input');logBox.type='checkbox';logBox.checked=!!d.logs.length;
  const logSelect=k.el('select','sbug-log-select');logSelect.dataset.noI18n='';
  const addLog=l=>{const o=k.el('option',null,l.label+(l.mtime?' · '+(window.relativeTime?window.relativeTime(new Date(l.mtime)):''):''));o.value=l.file;o.title=l.file;logSelect.append(o);};
  for(const l of d.logs)addLog(l);
  logSelect.disabled=!d.logs.length;
  logRow.append(logBox,k.el('span',null,'Лог игры'),logSelect);
  const other=k.el('button','sbug-other','Другой лог…');other.type='button';
  other.onclick=async()=>{try{const r=await call('chooseLog',d.pick);if(r.canceled)return;addLog({file:r.file,label:r.label});logSelect.value=r.file;logSelect.disabled=false;logBox.checked=true;}catch(e){k.toast(e.message,{error:true});}};
  const sysRow=k.el('label','sbug-option');const sysBox=k.el('input');sysBox.type='checkbox';sysBox.checked=true;sysRow.append(sysBox,k.el('span',null,'Сведения о системе (ОС, процессор, память, видеокарта, экраны)'));
  const logLine=k.el('div','sbug-log-line');logLine.append(logRow,other);
  if(!d.logs.length)logLine.append(k.el('small','sbug-muted','Editor.log и Player.log не нашлись'));
  opts.append(logLine,sysRow);
  if(d.note){const n=k.el('div','sbug-note');n.append(k.el('span','sbug-muted','Заметка: '));const t=k.el('span',null,d.note);t.dataset.noI18n='';n.append(t);opts.append(n);}
  const run=k.el('div','sbug-run');
  const go=k.el('button','primary sbug-go','Выберите окно или экран');go.type='button';go.disabled=true;
  const hint=k.el('small','sbug-muted','Запись до '+clock(d.max)+' · остановить — «Стоп» в окошке записи или здесь');
  const live=k.el('div','sbug-live');live.hidden=true;
  const dot=k.el('span','sbug-dot'),time=k.el('span','sbug-time','0:00'),bar=k.el('span','sbug-live-track'),fill=k.el('span','sbug-live-fill');bar.append(fill);
  const stop=k.el('button','sbug-stop','Стоп');stop.type='button';
  live.append(dot,time,bar,stop);
  run.append(go,hint,live);
  body.append(grid,opts,run);
  const node=k.card({app:'Запись экрана → баг',initial:'●',color:'#8a4f4f',key:'Что записать',status:{label:'выбор окна',tone:'progress'},body,className:'sbug-card sbug-pick'});
  const setStatus=st=>node.querySelector('.kit-card-head .kit-chip')?.replaceWith(k.chip(st));
  const finish=(label,tone)=>{clearInterval(timer);timer=null;live.classList.add('done');stop.hidden=true;setStatus({label,tone});};
  go.onclick=async()=>{
   if(!chosen)return;go.disabled=true;go.setAttribute('aria-busy','true');
   try{
    const sel=logSelect.selectedOptions[0];
    const r=await call('start',d.pick,chosen,{log:logBox.checked&&sel?sel.value:'',logLabel:sel?.textContent||'',system:sysBox.checked});
    recording=r.recording;node.dataset.recording=r.recording;go.hidden=true;hint.hidden=true;live.hidden=false;opts.classList.add('locked');
    for(const t of tiles)t.disabled=true;
    setStatus({label:'идёт запись',tone:'alert'});
    const started=Date.now();
    timer=setInterval(()=>{const ms=Date.now()-started;time.textContent=clock(ms)+' / '+clock(r.max);fill.style.width=Math.min(100,100*ms/r.max).toFixed(1)+'%';if(ms>r.max+10000)clearInterval(timer);},500);
   }catch(e){k.toast(e.message,{error:true});go.disabled=false;}finally{go.removeAttribute('aria-busy');}
  };
  stop.onclick=async()=>{stop.disabled=true;try{await call('stop');}catch(e){k.toast(e.message,{error:true});stop.disabled=false;}};
  document.addEventListener('petya-screen-bug',e=>{
   const item=e.detail;if(!recording||item.recording!==recording&&!String(item.version||'').endsWith(':'+recording))return;
   if(item.ready)finish('записано','done');else if(!item.busy)finish(item.kind==='error'?'не записано':'остановлено',item.kind==='error'?'alert':'progress');
  });
  parent.append(node);
 }

 // --- The report --------------------------------------------------------------------------------------------------------
 function timeline(k,d){
  const box=k.el('div','sbug-timeline');
  const log=d.log;
  const head=k.el('div','sbug-timeline-head');
  head.append(k.el('span',null,'Запись '+clock(d.duration)));
  if(log)head.append(k.el('span','sbug-muted','ошибок: '+log.errors+' · предупреждений: '+log.warnings+' · строк: '+log.lines.length));
  const track=k.el('div','sbug-track');track.setAttribute('role','img');
  const during=log?log.lines.filter(l=>l.during&&(l.level==='error'||l.level==='warning')):[];
  if(log?.mode==='time'&&d.duration){
   track.setAttribute('aria-label','Ошибки и предупреждения лога по времени записи');
   const start=d.at-d.duration;
   for(const l of during){const m=k.el('span','sbug-mark '+l.level);m.style.left=Math.max(0,Math.min(100,100*(l.t-start)/d.duration)).toFixed(1)+'%';m.title=l.n+': '+l.text.slice(0,140);m.dataset.noI18n='';track.append(m);}
  }else if(log){
   // Unity's lines carry no time: the share of errors, warnings and the rest written during the recording.
   track.classList.add('levels');track.setAttribute('aria-label','Строки лога за время записи по уровням');
   const all=log.lines.filter(l=>l.during),n=Math.max(1,all.length);
   for(const lv of ['error','warning','info','trace']){const c=all.filter(l=>l.level===lv).length;if(!c)continue;const seg=k.el('span','sbug-seg '+lv);seg.style.width=(100*c/n).toFixed(1)+'%';seg.title=c+'';track.append(seg);}
  }
  const legend=k.el('div','sbug-legend');
  for(const [cls,label] of [['error','ошибки'],['warning','предупреждения']]){const i=k.el('span');i.append(k.el('span','sbug-swatch '+cls),label);legend.append(i);}
  box.append(head,track);if(log)box.append(legend);else box.append(k.el('small','sbug-muted','Лог не добавлен'));
  return box;
 }
 function field(k,label,value,{multiline=false,rows=3,name,placeholder=''}){
  const l=k.el('label','sbug-field');l.append(k.el('span',null,label));
  const input=k.el(multiline?'textarea':'input');if(multiline)input.rows=rows;input.value=value||'';input.name=name;if(placeholder)input.placeholder=placeholder;l.append(input);return {node:l,input};
 }
 function logLines(k,lines,cited){
  const list=k.el('div','sbug-lines');list.dataset.noI18n='';
  for(const l of lines){const row=k.el('div','sbug-line '+l.level+(cited.has(l.n)?' cited':'')+(l.during?'':' before'));row.append(k.el('span','sbug-ln',String(l.n)),k.el('span','sbug-lt',l.text));list.append(row);}
  return list;
 }
 function reportCard(k,d,parent){
  const body=k.el('div','sbug-body');
  const top=k.el('div','sbug-top');
  const poster=k.el('div','sbug-poster');poster.append(img(k,d.poster),k.el('span','sbug-duration',clock(d.duration)));
  if(d.reason==='cap')poster.append(k.el('span','sbug-cap','лимит 2 мин'));
  const side=k.el('div','sbug-side');
  const src=k.el('div','sbug-source-line');src.append(k.el('span','sbug-muted',d.kind==='screen'?'Экран':'Окно: '));if(d.kind!=='screen'){const n=k.el('span',null,d.source);n.dataset.noI18n='';src.append(n);}
  side.append(src,timeline(k,d));
  top.append(poster,side);
  const draft=d.draft||{title:'',steps:[],expected:'',actual:'',evidence:[]};
  const f={title:field(k,'Заголовок',draft.title,{name:'title'}),
   steps:field(k,'Шаги — пишете вы, Петя их не придумывает',(draft.steps||[]).join('\n'),{multiline:true,rows:3,name:'steps',placeholder:'1. Открыть …\n2. Нажать …'}),
   expected:field(k,'Ожидалось',draft.expected,{multiline:true,rows:4,name:'expected',placeholder:'Что должно было произойти'}),actual:field(k,'Фактически',draft.actual,{multiline:true,rows:4,name:'actual'})};
  if(draft.model){const tag=k.el('span','sbug-tag','по логу · строки '+draft.evidence.join(', '));f.actual.node.firstChild.append(tag);}
  const form=k.el('div','sbug-form');form.append(f.title.node,f.steps.node);const pair=k.el('div','sbug-pair');pair.append(f.expected.node,f.actual.node);form.append(pair);
  body.append(top,form);
  // The cited lines (or the errors) first, the whole excerpt folded.
  if(d.log?.lines?.length){
   const cited=new Set(draft.evidence||[]);
   const key=d.log.lines.filter(l=>cited.size?cited.has(l.n):l.level==='error').slice(0,8);
   const sec=k.el('div','sbug-section');
   const h=k.el('div','sbug-section-title');h.append('Лог: ');const ln=k.el('span',null,d.log.label);ln.dataset.noI18n='';h.append(ln);
   if(d.log.unity){h.append(' · Unity ');const u=k.el('span',null,d.log.unity);u.dataset.noI18n='';h.append(u);}
   sec.append(h);
   if(key.length)sec.append(logLines(k,key,cited));
   const more=k.el('details','sbug-more');more.append(k.el('summary',null,'Весь отрывок · '+d.log.lines.length+' строк'+(d.log.hidden?' · скрыто похожих на пароли: '+d.log.hidden:'')),logLines(k,d.log.lines,cited));
   sec.append(more);body.append(sec);
  }else if(d.log)body.append(k.el('small','sbug-muted','В логе за время записи ничего не появилось.'));
  // Environment.
  if(d.system?.length){
   const sec=k.el('div','sbug-section');sec.append(k.el('div','sbug-section-title','Окружение'));
   const dl=k.el('dl','sbug-env');for(const r of d.system){dl.append(k.el('dt',null,r.label));const dd=k.el('dd',null,r.value);dd.dataset.noI18n='';dl.append(dd);}
   sec.append(dl);body.append(sec);
  }
  // Attachments: what «Прикрепить» will upload.
  const files=k.el('div','sbug-section');files.append(k.el('div','sbug-section-title','Вложения'));
  const pickVideo=k.el('input');pickVideo.type='checkbox';pickVideo.checked=true;
  const v=k.el('label','sbug-file');const vn=k.el('span','sbug-file-name',d.video.name);vn.dataset.noI18n='';v.append(pickVideo,vn,k.el('span','sbug-muted',clock(d.duration)+' · '+MB(d.video.bytes)));files.append(v);
  const pickLog=k.el('input');pickLog.type='checkbox';pickLog.checked=!!d.log?.lines?.length;pickLog.disabled=!d.log?.lines?.length;
  if(d.log){const l=k.el('label','sbug-file');const lnm=k.el('span','sbug-file-name',d.log.name);lnm.dataset.noI18n='';l.append(pickLog,lnm,k.el('span','sbug-muted',d.log.lines.length+' строк'));files.append(l);}
  body.append(files);
  // Tracker hand-off, then the upload to the created task.
  let handed=null,attached=null,poll=null;
  const attachBox=k.el('div','sbug-attach');attachBox.hidden=true;
  const target=k.el('input');target.placeholder='PROJ-123 или ссылка на задачу';target.dataset.noI18n='';
  const attachButton=k.el('button','primary','Прикрепить запись и лог');attachButton.type='button';
  const label=()=>{attachButton.textContent=target.value.trim()?'Прикрепить к '+target.value.trim().replace(/^https?:\/\/\S*\/(?:browse\/)?/,''):'Прикрепить запись и лог';};
  target.oninput=label;
  attachButton.onclick=async()=>{attachButton.disabled=true;attachButton.setAttribute('aria-busy','true');
   try{const r=await call('attach',d.id,handed,target.value.trim(),{video:pickVideo.checked,log:pickLog.checked});attached=r;clearInterval(poll);k.toast(r.text);sync();
    attachBox.replaceChildren(k.el('span','sbug-attached','✓ '+r.text));if(r.url&&k.safeUrl(r.url)){const a=k.el('a',null,'Открыть задачу');a.href=r.url;a.target='_blank';a.rel='noopener';attachBox.append(a);}}
   catch(e){k.toast(e.message,{error:true});}finally{attachButton.disabled=false;attachButton.removeAttribute('aria-busy');}};
  const row=k.el('div','sbug-attach-row');row.append(target,attachButton);
  attachBox.append(row,k.el('small','sbug-muted','Когда задача появится в чате, подставлю её ключ — файлы загружу по вашему нажатию.'));
  body.append(attachBox);
  const text=()=>{
   const steps=f.steps.input.value.split('\n').map(x=>x.trim().replace(/^\d+[.)]\s*/,'')).filter(Boolean);
   const parts=[];
   if(steps.length)parts.push('Шаги: '+steps.map((x,i)=>(i+1)+') '+x).join(' '));
   if(f.expected.input.value.trim())parts.push('Ожидалось: '+f.expected.input.value.trim());
   if(f.actual.input.value.trim())parts.push('Фактически: '+f.actual.input.value.trim());
   if(d.system?.length)parts.push('Окружение: '+d.system.map(r=>r.label+' — '+r.value).join('; '));
   parts.push('Вложения: запись экрана '+clock(d.duration)+(d.log?.lines?.length?', лог '+d.log.lines.length+' строк':''));
   return parts;
  };
  const payload=()=>{const title=f.title.input.value.trim();if(!title)throw Error('Напишите заголовок бага.');return {title,description:text().join('. '),type:'bug'};};
  const tracker=k.links('task-tracker',()=>payload(),{primary:true,title:'Петя покажет задачу перед созданием',onDone:async(result,provider)=>{
   try{const r=await call('handoff',d.id,provider.id);if(!r.attachable)return;handed=provider.id;attachBox.hidden=false;sync();
    const started=Date.now();clearInterval(poll);poll=setInterval(async()=>{if(Date.now()-started>600000||!node.isConnected){clearInterval(poll);return;}
     try{const found=await call('recent',d.id);if(found.length&&!target.value.trim()){target.value=found.at(-1).key;label();}}catch{/* chat changed */}},2500);}catch{/* not attachable */}}});
  const noTracker=k.el('small','sbug-muted','Чтобы завести задачу, подключите Jira или Asana. Пока можно скопировать текст и показать файл записи.');noTracker.hidden=true;
  (k.availableLinks?.('task-tracker')||Promise.resolve([])).then(list=>{noTracker.hidden=!!list?.length;}).catch(()=>{noTracker.hidden=false;});
  body.append(noTracker);
  const copy=async()=>{const p=payload();await navigator.clipboard.writeText(p.title+'\n\n'+text().join('\n'));k.toast('Текст бага скопирован');};
  const finder=window.petyaPlatform==='win32'?'Показать в Проводнике':'Показать в Finder';
  let node=null;
  function sync(){
   const title=f.title.input.value.trim();
   const st=attached?{label:'прикреплено',tone:'done'}:handed?{label:'задача у трекера',tone:'progress'}:title?{label:'черновик',tone:'accent'}:{label:'нужен заголовок',tone:'progress'};
   const head=node?.querySelector('.kit-card-head');if(!head)return;
   const key=head.querySelector('.kit-key');if(key){key.textContent=title||'Новый баг';key.dataset.noI18n='';}
   head.querySelector('.kit-chip')?.replaceWith(k.chip(st));
  }
  node=k.card({app:'Запись экрана → баг',initial:'●',color:'#8a4f4f',key:draft.title||'Новый баг',status:draft.title?{label:'черновик',tone:'accent'}:{label:'нужен заголовок',tone:'progress'},body,className:'sbug-card sbug-report',
   actions:[tracker,{label:'Скопировать текст',run:copy},{label:finder,run:()=>call('reveal',d.id)}]});
  node.dataset.recording=d.id;node.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  f.title.input.addEventListener('input',sync);
  parent.append(node);
 }

 window.renderScreenBug=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.sbug-card'))return;
  if(d.stage==='pick')pickCard(k,d,parent);else if(d.stage==='report')reportCard(k,d,parent);
 };
})();
