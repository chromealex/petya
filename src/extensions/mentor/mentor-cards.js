// «Петя-наставник», renderer: patterns ranked by the time automation would save, each with a mini bar, how often it
// happened, the evidence (the user's own requests with dates), the proposal type chip and what exactly will be
// created; «Создать» runs only that proposal (through the recurring commands, the skill tools, a draft file or the
// offers card), «Скрыть» stops proposing it. «Как считал» shows the time method.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('mentor-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('mentor',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const minutes=m=>Number(m||0).toLocaleString(locale(),{maximumFractionDigits:m>=10?0:1});
 const KIND={request:'повторяющаяся просьба',sequence:'цепочка действий',paste:'вставленный текст',search:'повторный поиск'};
 const TYPE={schedule:{label:'Расписание',tone:'done'},skill:{label:'Скилл',tone:'accent'},extension:{label:'Идея расширения',tone:'progress'},app:{label:'Приложение',tone:''}};
 const DAYS=['по воскресеньям','по понедельникам','по вторникам','по средам','по четвергам','по пятницам','по субботам'];
 const when=iso=>{const d=new Date(iso);if(!Number.isFinite(d.getTime()))return null;if(window.timeElement)return window.timeElement(d);return document.createTextNode(d.toLocaleDateString(locale(),{day:'numeric',month:'short'}));};
 function evidence(k,p){
  const box=k.el('details','mentor-evidence');box.append(k.el('summary',null,'Примеры ('+p.examples.length+')'));
  const ul=k.el('ul');
  for(const e of p.examples){const li=k.el('li');li.append(raw(k.el('span','mentor-quote',e.text)));const t=when(e.at);if(t){const s=k.el('span','mentor-when');s.append(t);li.append(s);}ul.append(li);}
  box.append(ul);return box;
 }
 function preview(k,p){
  const box=k.el('details','mentor-draft');const pr=p.proposal;
  box.append(k.el('summary',null,pr.type==='schedule'?'Что будет повторяться':pr.type==='skill'?'Черновик SKILL.md':pr.type==='extension'?'Черновик extension.json':'Что умеет приложение'));
  if(pr.type==='schedule'){box.append(raw(k.el('code','mentor-phrase',pr.phrase)));box.append(k.el('p','mentor-hint','Ответы будут приходить в чат «По расписанию»; остановить — в «Обучение → Повторяющиеся команды».'));}
  else if(pr.type==='skill')box.append(raw(k.el('pre','mentor-pre selectable',pr.skillMd)));
  else if(pr.type==='extension'){box.append(raw(k.el('pre','mentor-pre selectable',pr.json)));box.append(k.el('p','mentor-hint','Это заготовка: код расширения (feature.cjs, карточка) ещё нужно написать.'));}
  else{const p2=k.el('p','mentor-hint');p2.append(raw(k.el('b',null,pr.app.name)),' — ',raw(k.el('span',null,pr.app.pitch)));box.append(p2);}
  return box;
 }
 function row(k,p,i,scale,cardOf){
  const li=k.el('li','mentor-row');li.dataset.key=p.key;li.dataset.type=p.proposal.type;
  const head=k.el('div','mentor-head');
  head.append(k.el('span','mentor-rank',String(i+1)));
  const main=k.el('div','mentor-main');
  main.append(raw(k.el('div','mentor-title',p.kind==='sequence'?p.title:'«'+p.title+'»')));
  const meta=k.el('div','mentor-meta');
  meta.append(k.el('span',null,KIND[p.kind]),k.el('span',null,'раз: '+p.count+', дней: '+p.days));
  if(p.regular)meta.append(k.el('span',null,'обычно около '+p.time));
  main.append(meta);
  const side=k.el('div','mentor-side');
  const bar=k.el('div','mentor-bar');const fill=k.el('span');fill.style.width=Math.max(4,Math.round(100*p.savedWeek/scale))+'%';bar.append(fill);
  bar.setAttribute('role','img');bar.setAttribute('aria-label','Экономия: '+minutes(p.savedWeek)+' мин в неделю');
  side.append(bar,k.el('span','mentor-save','~'+minutes(p.savedWeek)+' мин/нед'));
  head.append(main,side);
  li.append(head);
  const chips=k.el('div','mentor-chips');chips.append(k.chip({label:p.proposal.type==='app'?TYPE.app.label+' «'+p.proposal.app.name+'»':TYPE[p.proposal.type].label,tone:TYPE[p.proposal.type].tone}));
  chips.append(k.el('span','mentor-spent','сейчас уходит ~'+minutes(p.spentWeek)+' мин/нед'));
  li.append(chips,evidence(k,p),preview(k,p));
  const actions=k.el('div','mentor-actions');
  const create=k.el('button','primary','Создать');create.type='button';
  const hide=k.el('button',null,'Скрыть');hide.type='button';
  const result=k.el('div','mentor-result');result.setAttribute('role','status');
  create.onclick=async()=>{
   create.disabled=hide.disabled=true;create.setAttribute('aria-busy','true');
   try{
    const r=await call('create',p.key);
    if(r.offer){result.replaceChildren();await window.renderExtensionOffer?.(result,r.offer);create.disabled=false;hide.disabled=false;}
    else if(r.ask){li.classList.add('done');result.replaceChildren(k.el('span',null,'Отправил в чат: создаю повтор.'));await k.ask(r.ask,{send:true});}
    else{li.classList.add('done');result.replaceChildren(k.el('span',null,r.text));
     if(r.path){const b=k.el('button',null,'Показать в папке');b.type='button';b.onclick=()=>call('reveal',r.path).catch(e=>k.toast(e.message,{error:true}));result.append(b);}}
   }catch(e){k.toast(e.message,{error:true});create.disabled=hide.disabled=false;}
   finally{create.removeAttribute('aria-busy');}
  };
  hide.onclick=async()=>{try{await call('hide',p.key);li.remove();k.toast('Скрыл. Больше не предложу.');const card=cardOf();if(!card.querySelector('.mentor-row'))card.querySelector('.mentor-list')?.replaceWith(k.el('p','mentor-empty','Все повторения скрыты.'));}catch(e){k.toast(e.message,{error:true});}};
  actions.append(create,hide);li.append(actions,result);
  return li;
 }
 window.renderMentorCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.mentor-card'))return;
  const body=k.el('div','mentor-body');
  let card;
  if(c.patterns.length){
   const total=k.el('div','mentor-total');
   total.append(k.el('span','mentor-total-value','~'+minutes(c.totalSaved)+' мин'),k.el('span','mentor-total-label','в неделю можно сэкономить'));
   body.append(total);
   const scale=Math.max(...c.patterns.map(p=>p.savedWeek),0.1);
   const ul=k.el('ol','mentor-list');
   c.patterns.forEach((p,i)=>ul.append(row(k,p,i,scale,()=>card)));
   body.append(ul);
  }else body.append(k.el('p','mentor-empty',c.requests<10?'Пока мало истории — загляну, когда наберётся больше.':'Повторяющихся действий не нашёл.'));
  const how=k.el('details','mentor-how');how.append(k.el('summary',null,'Как считал'));
  const m=c.method||{};
  const ul=k.el('ul');
  for(const line of ['История чатов на этом компьютере за '+c.weeks+' нед.: запросов — '+c.requests+', дней — '+c.days+'.',
   'Набор текста — '+Math.round((m.cps||3.3)*60)+' знаков в минуту, переход к Пете и отправка — '+(m.switch||15)+' с, чтение ответа — '+(m.read||20)+' с, просмотр результатов поиска — '+(m.results||40)+' с, найти и вставить шаблон — '+(m.paste||30)+' с.',
   'Время в неделю = время одного раза × сколько раз в неделю (от первого случая до сегодня).',
   'Экономия: расписание и приложение убирают набор и переход; скилл — набор всего, кроме короткой просьбы (≈'+(m.trigger||40)+' знаков); шаблон — поиск и вставку.'])ul.append(k.el('li',null,line));
  how.append(ul);body.append(how);
  const w=c.weekly||{};
  const weekly=k.el('div','mentor-weekly');
  if(w.enabled)weekly.append(k.el('span',null,'Еженедельный разбор: '+DAYS[w.day]+', '+w.time));
  else{
   weekly.append(k.el('span',null,'Еженедельный разбор выключен.'));
   const on=k.el('button',null,'Присылать '+DAYS[w.day??5]+', '+(w.time||'17:00'));on.type='button';
   on.onclick=async()=>{on.disabled=true;try{await window.petya.saveSettings({mentorWeekly:'true'});weekly.replaceChildren(k.el('span',null,'Еженедельный разбор: '+DAYS[w.day??5]+', '+(w.time||'17:00')));}catch(e){k.toast(e.message,{error:true});on.disabled=false;}};
   weekly.append(on);
  }
  body.append(weekly);
  card=k.card({app:'Петя-наставник',initial:'↻',color:'#5a6e3a',key:'Что автоматизировать',status:c.patterns.length?{label:'повторений: '+c.patterns.length,tone:'accent'}:{label:'нечего',tone:''},
   subtitle:'только на этом компьютере',body,className:'mentor-card'});
  parent.append(card);
 };
})();
