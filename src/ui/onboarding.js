// First-run introduction («Знакомство»): Petya asks the name, company and role (each with «Угадай»), then the
// permissions this role needs, one at a time. Progress is saved after every step (features/onboarding.cjs), so a
// restart required by macOS resumes at the same step. On a first launch the splash Petya lands on this screen.
(()=>{
 const api=(method,...args)=>window.petya.feature('onboarding',method,...args);
 const SOURCES={system:'учётная запись компьютера',browser:'профиль браузера',git:'настройки git',slack:'Slack на компьютере',apps:'установленные приложения',projects:'папки проектов'};
 const LOOKING={system:'Смотрю в учётной записи компьютера…',browser:'Заглядываю в профили браузеров…',git:'Читаю настройки git…',slack:'Ищу рабочие пространства Slack…',apps:'Смотрю, какие приложения установлены…',projects:'Проверяю папки проектов…'};
 const PERMISSIONS={
  microphone:{title:'Микрофон',why:'Чтобы слышать «Петя, …» и твой голос на встречах. Аудио не сохраняю.',
   next:{darwin:{'not-determined':'macOS покажет окно — нажми «Разрешить».',other:'Откроются настройки macOS: включи Петю в разделе «Микрофон».'},win32:{other:'Откроются настройки Windows: включи доступ к микрофону для классических приложений.'}}},
  screen:{title:'Запись экрана и системного звука',why:'Чтобы слушать звук встречи в Zoom и понимать, что встреча идёт. Видео не сохраняю.',
   next:{darwin:{other:'Откроются настройки macOS: включи Петю в разделе «Запись экрана». После этого macOS попросит перезапустить меня — это нормально, продолжим с этого же шага.'}}},
  accessibility:{title:'Универсальный доступ',why:'Чтобы видеть открытый тред в Slack и по твоей просьбе нажимать кнопки в приложениях.',
   next:{darwin:{'not-determined':'macOS покажет окно: открой настройки и включи Петю в разделе «Универсальный доступ».',other:'Откроются настройки macOS: включи Петю в разделе «Универсальный доступ».'}}}
 };
 // Which permissions the introduction offers for a role; the rest are asked when their feature is first used.
 const offered=role=>['microphone',...(['manager','lead'].includes(role)?['screen']:[]),'accessibility'];
 const MIN_GUESS=1200,STEP={name:0,company:1,role:2,permissions:3,done:4};
 let state,avatar,root,card,step=0,answers={},guessKind='',permissionQueue=null,poll=0;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const roleLabel=id=>state.roles.find(r=>r.id===id)?.label||(id.startsWith('custom:')?id.slice(7):id);
 const save=()=>api('progress',step,answers).catch(()=>{});

 // Petya's line: literals are translated, user data (names) stays as written in its own node.
 const nodes=parts=>[].concat(parts).map(part=>{if(typeof part==='string')return document.createTextNode(part);const span=el('span',null,part.data);span.dataset.noI18n='';return span;});
 // Everything Petya says is drawn as his speech bubble; while he guesses it turns into a thought cloud.
 function say(parts,{think=false}={}){
  const bubble=root.querySelector('.onb-say');bubble.replaceChildren(...nodes(parts));
  bubble.classList.toggle('think',think);bubble.classList.remove('pop');void bubble.offsetWidth;bubble.classList.add('pop');
  if(!think)avatar.mood('talk');
 }
 function frame({say:text,body,next='Дальше',onNext,back=true,skip}){
  const content=root.querySelector('.onb-content');content.replaceChildren();content.classList.remove('onb-enter');void content.offsetWidth;content.classList.add('onb-enter');
  say(text);content.append(...body);
  const actions=el('div','onb-actions');
  if(back&&step>0){const b=el('button','onb-back quiet','Назад');b.type='button';b.onclick=()=>go(step-1);actions.append(b);}
  const dots=el('div','onb-dots');for(let i=0;i<4;i++){const d=el('i');if(i===Math.min(step,3))d.className='on';else if(i<step)d.className='done';dots.append(d);}actions.append(dots);
  if(skip){const s=el('button','quiet onb-skip',skip.label);s.type='button';s.onclick=skip.run;actions.append(s);}
  const n=el('button','primary onb-next',next);n.type='button';n.onclick=onNext;actions.append(n);
  content.append(actions);
  root.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&event.target.tagName!=='BUTTON'){event.preventDefault();n.click();}};
  return n;
 }
 function evidenceText(result){
  return (result.evidence||[]).map(item=>{
   const label=SOURCES[item.source]||item.source;
   if(item.count)return label+' — проектов с коммитами за месяц: '+item.count;
   return label;
  });
 }
 // One «Угадай» run: Petya ponders, the lens shows each source as the main process checks it.
 async function guess(kind,apply,hint){
  if(guessKind)return;guessKind=kind;
  const button=root.querySelector('.onb-guess'),status=root.querySelector('.onb-status');
  button.disabled=true;status.className='onb-status';status.replaceChildren();root.querySelector('.onb-alternatives').replaceChildren();
  avatar.mood('guess');say('Хммм…',{think:true});
  const started=performance.now();let result=null;
  try{result=await Promise.race([api('guess',kind),wait(6000).then(()=>null)]);}catch{}
  await wait(Math.max(0,MIN_GUESS-(performance.now()-started)));
  guessKind='';button.disabled=false;
  if(!result?.value){say('Не угадал. Подскажешь?');avatar.mood('miss');hint?.focus();return;}
  apply(result.value);
  say(kind==='name'?['Ага! Тебя зовут ',{data:result.value},'?']:kind==='company'?['Ага! Ты работаешь в ',{data:result.value},'?']:['Ага! Похоже, ты — ',roleLabel(result.value),'.']);
  avatar.mood('found');
  const best=result.candidates.find(c=>c.value===result.value)||result.candidates[0];
  status.className='onb-status found';status.replaceChildren(el('span',null,'Нашёл:'));
  evidenceText(best).forEach((text,i)=>status.append(document.createTextNode(i?', ':' '),el('span',null,text)));
  for(const item of best.evidence||[])if(item.detail){const d=el('span','onb-detail',' · '+item.detail);d.dataset.noI18n='';status.append(d);}
  const others=result.candidates.filter(c=>c.value!==result.value);
  const chips=root.querySelector('.onb-alternatives');chips.replaceChildren();
  if(others.length){chips.append(el('span','onb-or','или'));for(const c of others){const b=el('button','onb-chip',kind==='role'?roleLabel(c.value):c.value);b.type='button';if(kind!=='role')b.dataset.noI18n='';b.onclick=()=>{apply(c.value);avatar.mood('talk');};chips.append(b);}}
 }
 function textStep({kind,key,text,placeholder,nextStep}){
  const input=el('input','onb-input');input.value=answers[key]||'';input.placeholder=placeholder;input.maxLength=50;input.autocomplete='off';input.spellcheck=false;
  const guessButton=el('button','onb-guess','Угадай');guessButton.type='button';
  const row=el('div','onb-row');row.append(input,guessButton);
  const status=el('p','onb-status'),alternatives=el('div','onb-alternatives');
  frame({say:text,body:[row,status,alternatives],onNext:()=>{answers[key]=input.value.trim();go(nextStep);}});
  guessButton.onclick=()=>guess(kind,value=>{input.value=value;},input);
  setTimeout(()=>input.focus(),50);
 }
 function roleStep(){
  const grid=el('div','onb-roles'),custom=el('input','onb-input onb-custom');
  custom.placeholder='Своя роль';custom.maxLength=60;
  const select=value=>{answers.role=value;for(const b of grid.children)b.classList.toggle('on',b.dataset.role===value);if(!value.startsWith('custom:'))custom.value='';};
  for(const role of state.roles){const b=el('button','onb-chip onb-role',role.label);b.type='button';b.dataset.role=role.id;b.onclick=()=>{select(role.id);avatar.mood('talk');};grid.append(b);}
  custom.oninput=()=>{const value=custom.value.trim();answers.role=value?'custom:'+value:'';for(const b of grid.children)b.classList.remove('on');};
  if(answers.role?.startsWith('custom:'))custom.value=answers.role.slice(7);
  const guessButton=el('button','onb-guess','Угадай');guessButton.type='button';
  const row=el('div','onb-row');row.append(custom,guessButton);
  const status=el('p','onb-status'),alternatives=el('div','onb-alternatives');
  frame({say:answers.name?[{data:answers.name},', а кем ты в команде?']:'А кем ты в команде?',body:[grid,row,status,alternatives],onNext:()=>go(STEP.permissions)});
  if(answers.role)select(answers.role);
  guessButton.onclick=()=>guess('role',select,custom);
 }
 // Permissions: one card at a time, only what the platform gates and this role needs. Settings sections are
 // opened by the shared permissions module; the status is re-read on return to the window and every 1.5 s.
 async function permissionsStep(){
  clearInterval(poll);
  let status;try{status=await window.petya.permissionStatus();}catch{status={platform:state.platform,items:[]};}
  const skipped=new Set(answers.skipped||[]);
  if(!permissionQueue)permissionQueue=offered(answers.role).filter(id=>{const item=status.items.find(i=>i.id===id);return item&&item.needed!==false&&!['granted','system','restricted'].includes(item.state)&&!skipped.has(id);});
  const id=permissionQueue[0];
  if(!id)return go(STEP.done);
  const info=PERMISSIONS[id],item=status.items.find(i=>i.id===id);
  const platformNext=info.next[status.platform]||{};
  const nextText=platformNext[item.state]||platformNext.other||'';
  const box=el('div','onb-permission');box.append(el('strong',null,info.title),el('p',null,info.why));
  const how=el('p','onb-how',nextText);if(nextText)box.append(how);
  const note=el('p','onb-status');box.append(note);
  let asked=false;
  const advance=()=>{clearInterval(poll);permissionQueue.shift();permissionsStep();};
  const button=frame({say:'Чтобы помогать по-настоящему, мне нужен доступ. По одному, без спешки.',body:[box],next:'Разрешить',
   skip:{label:'Позже',run:()=>{answers.skipped=[...skipped,id];save();advance();}},onNext:async()=>{
    if(asked&&item.restart){await api('progress',step,answers).catch(()=>{});return api('relaunch');}
    button.disabled=true;
    try{const next=await window.petya.requestPermission(id);if(next.items.find(i=>i.id===id)?.state==='granted')return granted();}
    catch(error){note.className='onb-status miss';note.textContent=error.message;}
    finally{button.disabled=false;}
    asked=true;watch();
   }});
  async function granted(){clearInterval(poll);say('Есть доступ!');avatar.mood('found');await wait(1100);advance();}
  function watch(){
   note.className='onb-status';note.textContent='';say('Жду, пока ты включишь доступ…',{think:true});
   // macOS applies screen recording only to a new process: offer our own restart instead of an endless wait.
   if(item.restart){button.textContent='Перезапустить Петю';say('Включил переключатель? Перезапусти меня — продолжим с этого же шага.');}
   clearInterval(poll);poll=setInterval(check,1500);
  }
  async function check(){if(step!==STEP.permissions||permissionQueue[0]!==id)return clearInterval(poll);try{const s=await window.petya.permissionStatus();if(s.items.find(i=>i.id===id)?.state==='granted')granted();}catch{}}
  window.addEventListener('focus',check,{once:true});
 }
 function doneStep(){
  const lines=el('ul','onb-summary');
  const line=(label,value)=>{const li=el('li');li.append(el('span',null,label),document.createTextNode(' '),...nodes({data:value}));lines.append(li);};
  if(answers.name)line('Имя:',answers.name);
  if(answers.company)line('Компания:',answers.company);
  if(answers.role){const li=el('li');li.append(el('span',null,'Роль:'),document.createTextNode(' '),answers.role.startsWith('custom:')?nodes({data:answers.role.slice(7)})[0]:el('span',null,roleLabel(answers.role)));lines.append(li);}
  const tail='Спрашивай что угодно в чате или скажи «Петя, …».';
  frame({say:answers.name?['Готово, ',{data:answers.name},'! ',tail]:['Готово!',' ',tail],body:[lines],next:'Начать',onNext:finish});
 }
 function go(next){step=next;save();permissionQueue=next===STEP.permissions?permissionQueue:null;
  if(step===STEP.name)textStep({kind:'name',key:'name',text:'Привет! Я Петя, твой рабочий напарник. Как тебя зовут?',placeholder:'Имя',nextStep:STEP.company});
  else if(step===STEP.company)textStep({kind:'company',key:'company',text:answers.name?[{data:answers.name},', приятно познакомиться! Где ты работаешь?']:'Приятно познакомиться! Где ты работаешь?',placeholder:'Компания',nextStep:STEP.role});
  else if(step===STEP.role)roleStep();
  else if(step===STEP.permissions)permissionsStep();
  else doneStep();
 }
 async function apply(){
  const input={};if(answers.name)input.userName=answers.name;if(answers.role)input.userRole=answers.role;
  if(Object.keys(input).length)await window.petya.saveSettings(input);
  // The settings form submits its fields later; keep them in step so an old empty value never wins.
  const nameField=document.getElementById('user-name');if(nameField&&answers.name){nameField.value=answers.name;nameField.dispatchEvent(new Event('input',{bubbles:true}));}
  if(answers.company){const list=await window.petya.companies();const current=list.companies.find(c=>c.id===list.activeId);
   if(current&&current.name!==answers.company){await window.petya.companyRename(list.activeId,answers.company);const field=document.getElementById('company-name');if(field)field.value=answers.company;}}
 }
 async function finish(){
  const button=root.querySelector('.onb-next');button.disabled=true;
  try{await apply();}catch(error){const note=el('p','onb-status miss',error.message);root.querySelector('.onb-content').insertBefore(note,root.querySelector('.onb-actions'));button.disabled=false;return;}
  await api('finish').catch(()=>{});
  document.dispatchEvent(new Event('petya-onboarding-done'));
  // Petya flies from the introduction into the logo in the app chrome, as after the splash.
  const logo=document.querySelector('.app-chrome .brand .logo'),from=avatar.figure.getBoundingClientRect(),to=logo?.getBoundingClientRect();
  const fade=(node,ms,delay=0)=>node.animate([{opacity:1},{opacity:0}],{duration:ms,delay,fill:'forwards',easing:'ease'}).finished;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!to?.width){await fade(root,250);return root.remove();}
  avatar.el.dataset.mood='idle';avatar.el.classList.add('pa-flying');logo.style.opacity='0';
  fade(root.querySelector('.onb-content'),200);fade(root.querySelector('.onb-say'),200);fade(root.querySelector('.onb-backdrop'),420,180);
  const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2),scale=to.width/from.width;
  await avatar.figure.animate([{transform:'none'},{transform:'translate('+dx*.3+'px,'+(dy*.3-60)+'px) scale('+((1+scale)/2)+') rotate(-12deg)',offset:.45},{transform:'translate('+dx+'px,'+dy+'px) scale('+scale+')'}],{duration:640,easing:'cubic-bezier(.45,0,.2,1)',fill:'forwards'}).finished.catch(()=>{});
  logo.style.opacity='';logo.animate([{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:280,easing:'ease-out'});
  root.remove();document.getElementById('command')?.focus();
 }
 function mount(){
  root=el('div','onb');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Знакомство с Петей');
  const backdrop=el('div','onb-backdrop'),stage=el('div','onb-stage');
  avatar=window.PetyaAvatar.create({size:150});
  const say=el('p','onb-say');say.setAttribute('aria-live','polite');
  card=el('div','onb-card');const content=el('div','onb-content');card.append(say,content);
  stage.append(avatar.el,card);root.append(backdrop,stage);document.body.append(root);
 }
 window.petyaEvents?.onOnboardingGuess?.(({kind,source})=>{if(kind!==guessKind||!root)return;avatar.source(source);if(LOOKING[source])say(LOOKING[source],{think:true});});
 async function start({force=false}={}){
  try{state=await api('state');}catch{return;}
  if(!state.pending&&!force)return;
  if(root)return;
  answers=state.answers||{};mount();
  const splash=window.petyaBootSplash;
  // A resumed introduction (after a restart) skips the splash flight: Petya is already here.
  if(splash&&!state.step){splash.target=avatar.figure;}else splash?.dismiss();
  go(Math.min(state.step||0,STEP.done));
 }
 window.petyaOnboarding={open:()=>start({force:true})};
 start();
})();
