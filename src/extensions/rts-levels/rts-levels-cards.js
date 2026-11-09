// «Генератор уровней», renderer: the map draft drawn on a canvas (terrain colours, starts, resources), the players
// and path lengths between starts, validation problems, bot-match balance; the RTS projects list; the engine card
// with its download. Writes happen only from buttons, and «Сохранить в проект» asks first (twice to overwrite).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('rts-levels-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('rtsLevels',method,...args);
 const tr=text=>window.t?window.t(text):text;
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>Number(n).toLocaleString(locale());
 const MB=n=>Math.max(1,Math.round(n/1e6)).toLocaleString(locale())+' '+(/^ru/i.test(locale())?'МБ':'MB');
 const PLAYER=['#4a7fd6','#d65050','#4fae5a','#e0c341','#9a5fd0','#e08a3c','#3fbfbf','#d06aa8'];
 const TERRAIN={'.':'#6d8c4c',',':'#7f8b5a','~':'#2d5d8e','=':'#5b93b9','#':'#3b3835','/':'#a3925f','R':'#7a6c60','$':'#d8b444','n':'#2e5331','x':'#b2463f'};
 const LEVEL=['#6d8c4c','#839f5b','#99b06a','#adbf7b','#bfcd8d','#cfd99f','#dce3b1','#e6ebc3','#eef2d4','#f5f7e4'];
 const color=ch=>{if(TERRAIN[ch])return TERRAIN[ch];if(/[1-9]/.test(ch))return LEVEL[Number(ch)];if(/[A-H]/.test(ch))return PLAYER[ch.charCodeAt(0)-65];return '#4a4a48';};
 const SYM={none:'без симметрии',auto:'авто',point:'точечная',mirror:'зеркальная',['mirror-y']:'зеркальная по вертикали',mirror4:'зеркальная на 4',rot4:'поворот на 4',rotational:'поворотная'};
 const players=n=>n+' '+(n%10===1&&n%100!==11?'игрок':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'игрока':'игроков');
 function openSettings(){if(typeof view==='function')view('settings');const card=document.querySelector('[data-extension="rts-levels"]');if(card)window.revealSettings?.(card);}

 // ---- the map picture ----
 function preview(k,c){
  const rows=c.preview?.rows||[],h=rows.length,w=Math.max(0,...rows.map(r=>r.length));
  const box=k.el('div','rtsl-preview');
  if(!w||!h){box.append(k.el('p','rtsl-muted','Нет изображения карты.'));return box;}
  const cell=Math.max(2,Math.min(7,Math.floor(360/Math.max(w,h))));
  const canvas=document.createElement('canvas');const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=w*cell*dpr;canvas.height=h*cell*dpr;canvas.style.width=w*cell+'px';canvas.style.height=h*cell+'px';
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',tr('Карта')+' '+c.size[0]+'×'+c.size[1]);
  const g=canvas.getContext('2d');g.scale(dpr,dpr);
  rows.forEach((row,y)=>{for(let x=0;x<row.length;x++){g.fillStyle=color(row[x]);g.fillRect(x*cell,y*cell,cell,cell);}});
  // forests as darker dots, so the ground under them still reads
  g.fillStyle='#1d3a20';rows.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(row[x]==='n'&&cell>=4){g.beginPath();g.arc(x*cell+cell/2,y*cell+cell/2,cell*0.28,0,7);g.fill();}});
  const scale=c.preview.scale||1,px=v=>v/scale*cell;
  for(const [x,z] of c.preview.resources||[]){
   const cx=px(x),cy=px(z),r=Math.max(3,cell*0.9);
   g.fillStyle='#f2cf55';g.strokeStyle='#5a4310';g.lineWidth=1.2;g.beginPath();g.moveTo(cx,cy-r);g.lineTo(cx+r,cy);g.lineTo(cx,cy+r);g.lineTo(cx-r,cy);g.closePath();g.fill();g.stroke();
  }
  for(const p of c.roster||[]){
   if(!p.start)continue;const cx=px(p.start[0]),cy=px(p.start[1]),r=Math.max(7,cell*2.2);
   g.fillStyle='#0b0d0cdd';g.beginPath();g.arc(cx,cy,r+2,0,7);g.fill();
   g.fillStyle=PLAYER[(p.n-1)%8];g.beginPath();g.arc(cx,cy,r,0,7);g.fill();
   g.fillStyle='#fff';g.font='700 '+Math.round(r*1.15)+'px system-ui, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(p.n),cx,cy+0.5);
  }
  const frame=k.el('div','rtsl-canvas');frame.append(canvas);box.append(frame);
  const legend=k.el('ul','rtsl-legend');
  const used=new Set(rows.join(''));
  for(const [ch,label] of [['.','земля'],['1','возвышенность'],['n','лес'],['~','вода'],['=','брод, мель'],['#','скалы'],['/','склон'],['$','поле ресурсов']]){
   if(ch==='1'?![...used].some(x=>/[1-9]/.test(x)):!used.has(ch))continue;
   const li=k.el('li');const sw=k.el('span','rtsl-swatch');sw.style.background=color(ch);li.append(sw,k.el('span',null,label));legend.append(li);
  }
  if((c.preview.resources||[]).length){const li=k.el('li');li.append(k.el('span','rtsl-swatch rtsl-gem'),k.el('span',null,'месторождение'));legend.append(li);}
  box.append(legend);
  return box;
 }
 function roster(k,c){
  const box=k.el('div','rtsl-side');
  const list=k.el('ul','rtsl-roster');
  for(const p of c.roster||[]){
   const li=k.el('li');const dot=k.el('span','rtsl-dot',String(p.n));dot.style.background=PLAYER[(p.n-1)%8];
   const name=k.el('span','rtsl-name',p.name);name.dataset.noI18n='';
   li.append(dot,name);if(c.teams&&p.team!=null)li.append(k.el('small','rtsl-team','команда '+p.team));
   list.append(li);
  }
  box.append(k.el('h5',null,'Старты'),list);
  if((c.paths||[]).length){
   box.append(k.el('h5',null,'Путь между стартами, клеток'));
   const bars=k.el('ul','rtsl-paths'),max=Math.max(1,...c.paths.map(p=>p[2]));
   for(const [a,b,d] of c.paths.slice(0,10)){
    const li=k.el('li');li.append(k.el('span','rtsl-pair',a+'–'+b));const track=k.el('span','rtsl-track'),fill=k.el('span','rtsl-fill');fill.style.width=Math.max(4,100*d/max).toFixed(0)+'%';track.append(fill);li.append(track,k.el('span','rtsl-num',fmt(d)));bars.append(li);
   }
   box.append(bars);
   if(c.connected===false)box.append(k.el('p','rtsl-bad','Старты не связаны по земле.'));
  }
  return box;
 }
 function issues(k,c){
  const box=k.el('div','rtsl-issues');
  if(!(c.issues||[]).length){box.append(k.el('p','rtsl-ok','Проверка движком: проблем нет.'));return box;}
  box.append(k.el('h5',null,'Проверка движком'));
  const list=k.el('ul');
  for(const i of c.issues){const li=k.el('li',i.error?'error':'warning');const t=k.el('span',null,i.text);t.dataset.noI18n='';li.append(k.el('span','rtsl-mark',i.error?'ошибка':'внимание'),t);if(i.count>1)li.append(k.el('small',null,'×'+i.count));list.append(li);}
  box.append(list);return box;
 }
 function balance(k,c){
  const b=c.balance;if(!b)return null;
  const box=k.el('div','rtsl-balance');
  box.append(k.el('h5',null,'Баланс: '+b.runs+' '+(b.runs<5?'матча':'матчей')+' ботов'));
  const time=v=>Math.floor(v/60)+':'+String(Math.round(v%60)).padStart(2,'0');
  if(b.timeouts>=b.runs){
   box.append(k.el('p','rtsl-muted','Все матчи дошли до лимита '+time(b.seconds?.max||900)+' без победителя — по ним старты не сравнить. Так бывает, когда боты не пробиваются через реку или узкие проходы: попробуйте больше бродов или другой вариант.'));
   return box;
  }
  const list=k.el('ul','rtsl-wins');
  for(const p of b.players){
   const li=k.el('li');const dot=k.el('span','rtsl-dot',String(p.n));dot.style.background=PLAYER[(p.n-1)%8];
   const track=k.el('span','rtsl-track'),fill=k.el('span','rtsl-fill win');fill.style.width=Math.max(0,Math.min(100,p.winRate*100)).toFixed(0)+'%';track.append(fill);
   li.append(dot,track,k.el('span','rtsl-num',Math.round(p.winRate*100)+'%'));list.append(li);
  }
  box.append(list);
  const s=b.seconds;
  if(s)box.append(k.el('p','rtsl-muted','Длина матча: в среднем '+time(s.avg)+', медиана '+time(s.median)+', от '+time(s.min)+' до '+time(s.max)+(b.timeouts?' · без победителя: '+b.timeouts:'')));
  const fair=b.players.length>1&&Math.max(...b.players.map(p=>p.winRate))-Math.min(...b.players.map(p=>p.winRate))<=0.25;
  if(!b.timeouts||b.timeouts<b.runs)box.append(k.el('p',fair?'rtsl-ok':'rtsl-bad',fair?'Старты примерно равны.':'Один из стартов заметно сильнее — попробуйте другой вариант или симметрию.'));
  return box;
 }
 function chips(c){
  const out=[{label:c.preset.title},{label:c.size[0]+'×'+c.size[1]},{label:c.teams?c.teams.join(' на '):players(c.players)},{label:'симметрия: '+(SYM[c.symmetry]||c.symmetry)},{label:'сид '+c.seed}];
  if(c.river)out.push({label:'река '+c.river.width+' кл., бродов '+c.river.fords});
  for(const e of c.edits||[])out.push({label:e,tone:'progress'});
  return out;
 }

 function mapCard(k,parent,c,replace){
  if(c.discarded){
   const gone=k.card({app:'Генератор уровней',initial:'Г',color:'#5d7a3e',status:{label:'черновик удалён'},title:c.title,meta:[c.saved?'В проекте остался '+c.saved.file:'В проект не сохранялся'],className:'rtsl-card rtsl-gone'});
   gone.dataset.draftId=c.id;replace?replace.replaceWith(gone):parent.append(gone);return;
  }
  const body=k.el('div','rtsl-body');
  const top=k.el('div','rtsl-top');top.append(preview(k,c),roster(k,c));body.append(top,issues(k,c));
  const bal=balance(k,c);if(bal)body.append(bal);
  const run=k.el('div','rtsl-running');run.hidden=true;body.append(run);
  let node;
  const redraw=next=>{mapCard(k,parent,next,node);};
  const actions=[
   {label:'Ещё вариант',title:'Тот же запрос, следующий сид',run:async()=>redraw(await call('variant',c.id))},
   {label:c.saved?'Сохранить ещё раз':'Сохранить в проект',primary:!c.saved,run:async()=>{
    const where=c.projectName;
    if(!await window.petyaConfirm(tr('Сохранить карту в проект?'),{detail:tr('Файл')+' '+c.file+' · «'+where+'». '+tr('Карта добавится в список карт game.json. Запись делает rtsmcp движка.'),ok:tr('Сохранить')}))return;
    let r=await call('save',c.id,{file:c.file});
    if(r.exists){
     if(!await window.petyaConfirm(tr('Карта с таким файлом уже есть. Перезаписать?'),{detail:r.file+' · '+tr('Прежняя карта будет заменена этим черновиком.'),ok:tr('Перезаписать'),danger:true}))return;
     r=await call('save',c.id,{file:r.file,overwrite:true});
    }
    if(r.card){redraw(r.card);k.toast(tr('Сохранено в проект:')+' '+r.card.saved.file);}
   }},
   {label:c.balance?'Проверить баланс ещё раз':'Проверить баланс',run:async()=>{
    if(!await window.petyaConfirm(tr('Проверить баланс матчами ботов?'),{detail:tr('Сыграю 4 матча ботов на этой карте с разными сидами, до 15 игровых минут каждый. Обычно это десятки секунд, на больших картах дольше. Ничего не сохраняется.'),ok:tr('Запустить')}))return;
    run.hidden=false;run.replaceChildren(k.el('span','rtsl-spinner'),k.el('span',null,'Идут матчи ботов…'));
    const stop=k.el('button','quiet','Отменить');stop.type='button';stop.onclick=()=>call('cancelBalance',c.id);run.append(stop);
    try{const next=await call('balance',c.id,{runs:4});if(next?.cancelled){run.hidden=true;return;}redraw(next);}
    catch(e){run.hidden=true;throw e;}
   }}
  ];
  if(c.editor)actions.push({label:'Открыть в редакторе',title:c.saved?c.saved.file:'Проект в редакторе движка; черновик — после сохранения',run:async()=>{await call('openEditor',c.id);k.toast(tr('Открываю редактор движка'));}});
  if((c.edits||[]).length)actions.push({label:'Отменить правку',run:async()=>redraw(await call('undo',c.id))});
  const del=window.deleteButton?window.deleteButton('Удалить черновик',async()=>{
   if(!await window.petyaConfirm(tr('Удалить черновик карты?'),{detail:c.saved?tr('Сохранённая в проект карта останется.'):tr('В проект он не сохранялся.'),ok:tr('Удалить'),danger:true}))return;
   const r=await call('discard',c.id);redraw({...c,discarded:true,saved:r.saved?{file:r.saved}:c.saved});
  }):null;
  if(del)actions.push(del);
  const status=c.saved?{label:'сохранено',tone:'done'}:c.errors?{label:'есть ошибки',tone:'alert'}:{label:'черновик',tone:'progress'};
  const project=k.el('span','rtsl-project',c.projectName);project.title=c.folder;project.dataset.noI18n='';
  node=k.card({app:'Генератор уровней',initial:'Г',color:'#5d7a3e',status,title:c.title,body,chips:chips(c),
   meta:[(c.saved?'Файл: ':'Будет сохранено в ')+c.file,'проект «'+c.projectName+'»'],actions,className:'rtsl-card'});
  node.dataset.draftId=c.id;
  node.querySelector('.kit-title')?.setAttribute('data-no-i18n','');
  const meta=node.querySelector('.kit-meta');if(meta)meta.dataset.noI18n='';
  replace?replace.replaceWith(node):parent.append(node);
 }

 function projectsCard(k,parent,c){
  const body=k.el('div','rtsl-body');
  const list=k.el('ul','rtsl-projects');
  for(const p of c.projects){
   const li=k.el('li',p.current?'current':'');
   const name=k.el('strong',null,p.name),dir=k.el('small',null,p.dir);name.dataset.noI18n='';dir.dataset.noI18n='';dir.title=p.dir;
   const text=k.el('div','rtsl-project-text');text.append(name,dir);
   const maps=k.el('span','rtsl-maps',p.maps+' '+(p.maps%10===1&&p.maps%100!==11?'карта':p.maps%10>=2&&p.maps%10<=4&&(p.maps%100<10||p.maps%100>=20)?'карты':'карт'));
   li.append(text,maps);
   if(p.current)li.append(k.el('span','rtsl-current','выбран'));
   else{const b=k.el('button','quiet','Выбрать');b.type='button';b.onclick=async()=>{b.disabled=true;try{await call('setProject',p.dir);for(const x of list.querySelectorAll('li'))x.classList.remove('current');li.classList.add('current');b.replaceWith(k.el('span','rtsl-current','выбран'));k.toast(tr('Карты будут для этого проекта'));}catch(e){k.toast(e.message,{error:true});b.disabled=false;}};li.append(b);}
   list.append(li);
  }
  if(!c.projects.length)body.append(k.el('p','rtsl-muted','Проектов пока нет. Создайте проект в редакторе движка из шаблона или выберите папку с game.json.'));
  else body.append(list);
  if((c.templates||[]).length)body.append(k.el('p','rtsl-muted','Шаблонов в движке: '+c.templates.length+'.'));
  parent.append(k.card({app:'Генератор уровней',initial:'Г',color:'#5d7a3e',status:{label:c.folder?'проект выбран':'проект не выбран',tone:c.folder?'done':'progress'},title:'RTS-проекты',body,
   actions:[{label:'Выбрать папку…',run:async()=>{const st=await call('chooseProject');if(st?.folder)k.toast(tr('Выбрана папка')+' '+st.folder);}},{label:'Сгенерировать карту',primary:!!c.folder,run:()=>k.ask('Сгенерируй карту для 2 игроков')}],className:'rtsl-card rtsl-projects-card'}));
 }

 function engineCard(k,parent,c){
  const body=k.el('div','rtsl-body');
  const steps=k.el('ol','rtsl-steps');
  if(c.unsupported)body.append(k.el('p',null,c.unsupported));
  else{
   steps.append(k.el('li',null,'Скачаю готовую сборку движка с GitHub (chromealex/rts-engine, ветка builds)'+(c.size?' — '+MB(c.size):'')+'.'),k.el('li',null,'Проверю архив по контрольной сумме и распакую в папку Пети.'),k.el('li',null,'Запущу rtsmcp и проверю, что генератор карт отвечает.'));
   body.append(steps);
  }
  body.append(k.el('p','rtsl-muted','Если движок уже есть (rtsmcp в PATH или ~/RTSEngine), Петя возьмёт его и ничего не скачает. Свою папку можно указать в настройках.'));
  const progress=k.el('div','rtsl-running');progress.hidden=!c.busy;if(c.busy)progress.append(k.el('span','rtsl-spinner'),k.el('span',null,'Скачиваю — прогресс в уведомлениях.'));body.append(progress);
  let node;
  const actions=[];
  if(!c.unsupported)actions.push({label:'Скачать движок'+(c.size?' · '+MB(c.size):''),primary:true,run:async b=>{
   progress.hidden=false;progress.replaceChildren(k.el('span','rtsl-spinner'),k.el('span',null,'Скачиваю — прогресс в уведомлениях.'));
   const stop=k.el('button','quiet','Отменить');stop.type='button';stop.onclick=()=>call('cancelDownload');progress.append(stop);
   try{const r=await call('download');progress.hidden=true;if(r?.present){node.querySelector('.kit-actions')?.replaceChildren(Object.assign(k.el('button','primary','Повторить запрос'),{type:'button',onclick:()=>k.ask(c.command,{send:true})}));}}
   catch(e){progress.hidden=true;throw e;}
  }});
  actions.push({label:'Указать папку движка',run:openSettings});
  node=k.card({app:'Генератор уровней',initial:'Г',color:'#5d7a3e',status:{label:c.unsupported?'нет сборки':'нужен движок',tone:'progress'},title:'Движок RTS',body,actions,className:'rtsl-card rtsl-engine-card'});
  parent.append(node);
 }

 window.renderRtsLevels=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.rtsl-card'))return;
  if(data.type==='map')mapCard(k,parent,data);
  else if(data.type==='projects')projectsCard(k,parent,data);
  else if(data.type==='engine')engineCard(k,parent,data);
 };
})();
