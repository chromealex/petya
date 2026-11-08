// «Скриншот → задача», renderer: the screenshot on a canvas with simple annotation tools (frame, arrow, text, blur
// for sensitive data — pixelated, saved as PNG), the drafted bug as editable fields, the vision model's state, the
// project's tracker through k.links('task-tracker') and, after the tracker's flow created the task, «Прикрепить
// скриншот к KEY». Also opens the card when the global shortcut took a shot.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('screenshot-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('screenshotTask',method,...args);
 const RED='#ff453a';
 const TOOLS=[['rect','Рамка','<rect x="4" y="6" width="16" height="12" rx="1.5"/>'],['arrow','Стрелка','<path d="M5 19 19 5"/><path d="M10 5h9v9"/>'],['text','Текст','<path d="M5 6h14"/><path d="M12 6v13"/>'],['blur','Размыть','<rect x="4" y="4" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/><rect x="14" y="14" width="5" height="5"/><rect x="14" y="4" width="5" height="5"/><rect x="4" y="14" width="5" height="5"/>']];
 const icon=paths=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
 const GB=n=>(n/1e9).toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:1})+' ГБ';

 // Shapes are in image pixels; the canvas has the image's own size and is scaled by CSS.
 function drawShape(g,shape,base){
  const w=g.canvas.width,line=Math.max(3,Math.round(w/320));
  g.save();g.lineWidth=line;g.strokeStyle=RED;g.fillStyle=RED;g.lineJoin='round';g.lineCap='round';
  if(shape.type==='rect'){g.strokeRect(shape.x,shape.y,shape.w,shape.h);}
  else if(shape.type==='arrow'){
   const {x1,y1,x2,y2}=shape,a=Math.atan2(y2-y1,x2-x1),head=line*5;
   g.beginPath();g.moveTo(x1,y1);g.lineTo(x2-Math.cos(a)*head*0.6,y2-Math.sin(a)*head*0.6);g.stroke();
   g.beginPath();g.moveTo(x2,y2);g.lineTo(x2-head*Math.cos(a-0.45),y2-head*Math.sin(a-0.45));g.lineTo(x2-head*Math.cos(a+0.45),y2-head*Math.sin(a+0.45));g.closePath();g.fill();
  }else if(shape.type==='text'){
   const size=Math.max(16,Math.round(w/45));g.font='600 '+size+'px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';g.textBaseline='top';
   g.lineWidth=Math.max(3,size/5);g.strokeStyle='#fff';g.strokeText(shape.text,shape.x,shape.y);g.fillText(shape.text,shape.x,shape.y);
  }else if(shape.type==='blur'){
   // Pixelation: the area is shrunk to a few blocks and drawn back without smoothing — unreadable, not reversible.
   const x=Math.round(shape.x),y=Math.round(shape.y),bw=Math.max(1,Math.round(shape.w)),bh=Math.max(1,Math.round(shape.h));
   const block=Math.max(10,Math.round(Math.min(bw,bh)/6));const t=document.createElement('canvas');t.width=Math.max(1,Math.ceil(bw/block));t.height=Math.max(1,Math.ceil(bh/block));
   const tg=t.getContext('2d');tg.drawImage(g.canvas,x,y,bw,bh,0,0,t.width,t.height);g.imageSmoothingEnabled=false;g.drawImage(t,0,0,t.width,t.height,x,y,bw,bh);
  }
  g.restore();
 }
 const norm=s=>s.type==='rect'||s.type==='blur'?{...s,x:Math.min(s.x,s.x+s.w),y:Math.min(s.y,s.y+s.h),w:Math.abs(s.w),h:Math.abs(s.h)}:s;

 function editor(k,d,{onChange}){
  const box=k.el('div','shot-editor');
  const bar=k.el('div','shot-tools');bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Пометки на скриншоте');
  const wrap=k.el('div','shot-canvas');const canvas=k.el('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Скриншот с пометками');
  const loading=k.el('div','shot-loading','Загружаю снимок…');wrap.append(canvas,loading);
  const g=canvas.getContext('2d');let image=null,shapes=[],tool='rect',draft=null,start=null;
  const paint=()=>{if(!image)return;g.clearRect(0,0,canvas.width,canvas.height);g.drawImage(image,0,0);for(const s of shapes)drawShape(g,norm(s));if(draft)drawShape(g,norm(draft));};
  const buttons=TOOLS.map(([id,label,paths])=>{const b=k.el('button','shot-tool');b.type='button';b.dataset.tool=id;b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(id===tool));b.innerHTML=icon(paths);b.append(k.el('span',null,label));b.onclick=()=>{tool=id;for(const x of buttons)x.setAttribute('aria-pressed',String(x.dataset.tool===id));};return b;});
  const undo=k.el('button','shot-tool shot-undo');undo.type='button';undo.innerHTML=icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>');undo.append(k.el('span',null,'Отменить'));undo.title='Отменить последнюю пометку';undo.disabled=true;
  undo.onclick=()=>{shapes.pop();undo.disabled=!shapes.length;paint();onChange(canvas,shapes);};
  bar.append(...buttons,undo);
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
  const commit=shape=>{shapes.push(shape);undo.disabled=false;paint();onChange(canvas,shapes);};
  canvas.addEventListener('pointerdown',e=>{
   if(!image||e.button!==0)return;e.preventDefault();const p=point(e);
   if(tool==='text'){
    const r=canvas.getBoundingClientRect(),input=k.el('input','shot-text-input');input.placeholder='Текст и Enter';
    input.style.left=(e.clientX-r.left)+'px';input.style.top=(e.clientY-r.top)+'px';wrap.append(input);input.focus();
    const done=ok=>{const v=input.value.trim();input.remove();if(ok&&v)commit({type:'text',x:p.x,y:p.y,text:v.slice(0,120)});};
    input.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();done(true);}else if(ev.key==='Escape'){ev.preventDefault();done(false);}};input.onblur=()=>done(true);return;
   }
   start=p;canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{if(!start)return;const p=point(e);draft=tool==='arrow'?{type:'arrow',x1:start.x,y1:start.y,x2:p.x,y2:p.y}:{type:tool,x:start.x,y:start.y,w:p.x-start.x,h:p.y-start.y};paint();});
  canvas.addEventListener('pointerup',()=>{if(!start)return;const s=draft;start=null;draft=null;
   if(s&&(s.type==='arrow'?Math.hypot(s.x2-s.x1,s.y2-s.y1)>8:Math.abs(s.w)>6&&Math.abs(s.h)>6))commit(norm(s));else paint();});
  box.append(bar,wrap);
  call('image',d.id).then(r=>{const img=new Image();img.onload=()=>{image=img;canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;shapes=Array.isArray(r.shapes)?r.shapes:[];undo.disabled=!shapes.length;loading.remove();paint();};img.src=r.url;})
   .catch(e=>{loading.textContent=e.message;loading.classList.add('error');});
  return {box,canvas,get shapes(){return shapes;},get ready(){return !!image;}};
 }

 function field(k,label,value,{multiline=false,rows=3,name}){
  const l=k.el('label','shot-field');l.append(k.el('span',null,label));
  const input=k.el(multiline?'textarea':'input');if(multiline)input.rows=rows;input.value=value||'';input.name=name;l.append(input);return {node:l,input};
 }
 const body=f=>{const steps=f.steps.input.value.split('\n').map(x=>x.trim().replace(/^\d+[.)]\s*/,'')).filter(Boolean);const parts=[];
  if(steps.length)parts.push('Шаги: '+steps.map((x,i)=>(i+1)+') '+x).join(' '));if(f.expected.input.value.trim())parts.push('Ожидалось: '+f.expected.input.value.trim());if(f.actual.input.value.trim())parts.push('Фактически: '+f.actual.input.value.trim());
  return parts;};

 window.renderScreenshotTask=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.shot-card'))return;
  let saving=null,timer=null,attached=null,handed=null,poll=null;
  const save=(canvas,shapes)=>{clearTimeout(timer);timer=setTimeout(()=>{saving=call('save',d.id,canvas.toDataURL('image/png'),shapes).catch(e=>k.toast(e.message,{error:true}));},350);};
  const ed=editor(k,d,{onChange:save});
  const draft=d.draft||{title:'',steps:[],expected:'',actual:''};
  const f={title:field(k,'Заголовок',draft.title,{name:'title'}),steps:field(k,'Шаги (по одному в строке)',(draft.steps||[]).join('\n'),{multiline:true,rows:3,name:'steps'}),
   expected:field(k,'Ожидалось',draft.expected,{multiline:true,rows:2,name:'expected'}),actual:field(k,'Фактически',draft.actual,{multiline:true,rows:2,name:'actual'})};
  const form=k.el('div','shot-form');form.append(f.title.node,f.steps.node);const pair=k.el('div','shot-pair');pair.append(f.expected.node,f.actual.node);form.append(pair);
  // The model: redraft with a note, or download it, or fill the fields by hand.
  const model=k.el('div','shot-model');
  const note=k.el('input','shot-note');note.placeholder='Что не так — подсказка для описания';note.value=d.note||'';
  const redraft=k.el('button',null,d.draft?'Составить заново':'Составить описание');redraft.type='button';
  redraft.onclick=async()=>{redraft.disabled=true;redraft.setAttribute('aria-busy','true');try{await saving;const r=await call('draft',d.id,note.value);
    if(r.needsModel){k.toast('Нужна модель для скриншотов — скачайте её кнопкой ниже.',{error:true});return;}
    f.title.input.value=r.draft.title;f.steps.input.value=r.draft.steps.join('\n');f.expected.input.value=r.draft.expected;f.actual.input.value=r.draft.actual;sync();}
   catch(e){k.toast(e.message,{error:true});}finally{redraft.disabled=false;redraft.removeAttribute('aria-busy');}};
  if(d.vision?.model){model.append(note,redraft);const m=k.el('small','shot-model-name',d.vision.model);m.dataset.noI18n='';model.append(m);}
  else{const dl=k.el('button',null,'Скачать модель для скриншотов · '+GB(d.vision?.size||3.3e9));dl.type='button';
   dl.onclick=async()=>{dl.disabled=true;try{await call('downloadModel');k.toast('Скачиваю модель — прогресс в уведомлениях. Потом нажмите «Составить описание».');model.replaceChildren(note,redraft);}catch(e){k.toast(e.message,{error:true});dl.disabled=false;}};
   model.append(dl,k.el('small','shot-hint','или заполните поля сами'));}
  // Tracker and attaching the picture to the created task.
  const attachBox=k.el('div','shot-attach');attachBox.hidden=true;
  const attachInput=k.el('input');attachInput.placeholder='PROJ-123 или ссылка на задачу';attachInput.dataset.noI18n='';
  const attachButton=k.el('button','primary','Прикрепить скриншот');attachButton.type='button';
  const attachNote=k.el('small','shot-hint','Когда задача появится в чате, подставлю её сюда — картинку прикреплю по вашему нажатию.');
  const target=()=>attachInput.value.trim();
  const label=()=>{attachButton.textContent=target()?'Прикрепить скриншот к '+target().replace(/^https?:\/\/\S*\/(?:browse\/)?/,''):'Прикрепить скриншот';};
  attachInput.oninput=label;
  attachButton.onclick=async()=>{attachButton.disabled=true;attachButton.setAttribute('aria-busy','true');try{await saving;const r=await call('attach',d.id,handed,target());attached=r;clearInterval(poll);k.toast(r.text);sync();
    attachBox.replaceChildren(k.el('span','shot-attached','✓ '+r.text));if(r.url&&k.safeUrl(r.url)){const a=k.el('a',null,'Открыть задачу');a.href=r.url;a.target='_blank';a.rel='noopener';attachBox.append(a);}}
   catch(e){k.toast(e.message,{error:true});}finally{attachButton.disabled=false;attachButton.removeAttribute('aria-busy');}};
  const row=k.el('div','shot-attach-row');row.append(attachInput,attachButton);attachBox.append(row,attachNote);
  const payload=()=>{const title=f.title.input.value.trim();if(!title)throw Error('Напишите заголовок бага.');return {title,description:[...body(f),d.window?'Окно: '+d.window:''].filter(Boolean).join('. '),type:'bug'};};
  const tracker=k.links('task-tracker',()=>payload(),{primary:true,title:'Петя покажет задачу перед созданием',onDone:async(result,provider)=>{
   try{const r=await call('handoff',d.id,provider.id);if(!r.attachable)return;handed=provider.id;attachBox.hidden=false;
    const started=Date.now();clearInterval(poll);poll=setInterval(async()=>{if(Date.now()-started>600000||!node.isConnected){clearInterval(poll);return;}
     try{const found=await call('recent',d.id);if(found.length&&!target()){attachInput.value=found.at(-1).key;label();}}catch{/* chat changed */}},2500);}catch{/* not attachable */}}});
  const noTracker=k.el('small','shot-hint','Чтобы завести задачу, подключите Jira или Asana. Пока можно скопировать текст и картинку.');noTracker.hidden=true;
  (k.availableLinks?.('task-tracker')||Promise.resolve([])).then(list=>{noTracker.hidden=!!list?.length;}).catch(()=>{noTracker.hidden=false;});
  const copyText=async()=>{const p=payload();await navigator.clipboard.writeText(p.title+'\n\n'+body(f).join('\n')+(d.window?'\nОкно: '+d.window:''));k.toast('Текст бага скопирован');};
  const bodyNode=k.el('div','shot-body');
  const meta=k.el('small','shot-meta');if(d.window){const w=k.el('span',null,d.window);w.dataset.noI18n='';meta.append(w,' · ');}meta.append(d.width+'×'+d.height);
  bodyNode.append(ed.box,meta,form,model,noTracker,attachBox);
  let node=null;
  function sync(){
   const title=f.title.input.value.trim();
   const status=attached?{label:'прикреплено к '+(attached.provider==='jira'?attached.key:'Asana'),tone:'done'}:handed?{label:'задача в работе у трекера',tone:'progress'}:title?{label:'черновик',tone:'accent'}:{label:'нужно описание',tone:'progress'};
   const head=node?.querySelector('.kit-card-head');if(!head)return;
   const key=head.querySelector('.kit-key');if(key){key.textContent=title||'Новый баг';key.dataset.noI18n='';}
   head.querySelector('.kit-chip')?.replaceWith(k.chip(status));
  }
  node=k.card({app:'Скриншот → задача',initial:'⌗',color:'#8a5a5a',key:draft.title||'Новый баг',status:{label:draft.title?'черновик':'нужно описание',tone:draft.title?'accent':'progress'},body:bodyNode,
   actions:[tracker,{label:'Скопировать текст',run:copyText},{label:'Скопировать картинку',run:async()=>{await saving;await call('copy',d.id);k.toast('Картинка скопирована');}},{label:'Показать файл',run:async()=>{await saving;await call('reveal',d.id);}}],className:'shot-card'});
  node.dataset.shotId=d.id;node.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  f.title.input.addEventListener('input',sync);
  parent.append(node);
 };

 // The global shortcut took a shot: open its card in the chat with the ordinary request.
 const opened=new Set();
 window.petyaEvents?.onExtensionInstall?.(item=>{
  if(item?.id!=='screenshot-task-shot'||!item.shot||opened.has(item.shot))return;opened.add(item.shot);
  if(typeof view==='function')view('home');
  (window.resultKit?.ask?.('скрин в задачу',{send:true})||Promise.resolve()).catch(e=>window.resultKit?.toast?.(e.message,{error:true}));
 });
})();
