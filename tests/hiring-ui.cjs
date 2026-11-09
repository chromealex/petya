// «Найм» cards in the real chat: the pipeline (a bar per stage, a stage menu that moves a candidate with «Отменить»,
// the red trash asking first), interview prep (questions per skill, doubts quoted, earlier notes folded), the feedback
// summary (criteria × notes grid, verbatim quotes with who wrote them, «нет данных», no score), the new-candidate and
// notes cards (saved once by their buttons) and scheduling (slots to choose, the invitation with the outgoing review,
// «Отправить приглашение» hands the calendar request to the chat). Notes and names never become HTML. Feature calls
// are stubbed.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name==='outgoing'&&method==='review')return {text:args[0].text,findings:[{id:'y',provider:'tone-check',providerName:'Проверка тона',severity:'warning',span:{start:0,end:12,text:'Здравствуйте'},message:'Можно обратиться по имени без формальностей.',suggestion:'Добрый день'}]};
  if(name==='hiring'){calls.push([method,...args]);
   if(method==='state')return 'pending';
   if(method==='move')return {ok:true,stage:args[1],text:'Анна Иванова: '+args[1]};
   if(method==='remove')return {ok:true,candidate:{id:args[0]},text:'Кандидат удалён: Пётр Сидоров'};
   if(method==='restore')return {ok:true};
   if(method==='add')return {ok:true,id:'c9',text:'Добавлено в воронку: '+args[1].name};
   if(method==='saveNote')return {ok:true,text:'Заметки сохранены: всего 3'};
   if(method==='invite')return {ok:true,ask:'Поставь встречу «Интервью · Бэкенд · Анна Иванова» с anna@mail.example 12 ноября в 15:00 на 60 минут'};
  }
  return null;
 });
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
 const at=(n,h)=>{const d=new Date();d.setDate(d.getDate()+n);d.setHours(h,0,0,0);return d.toISOString();};
 const STAGES=[['applied','Отклик'],['screen','Скрининг'],['tech','Техническое интервью'],['final','Финальное интервью'],['offer','Оффер'],['hired','Вышел'],['rejected','Отказ']];
 const cands=[{id:'c1',name:'Анна Иванова',role:'Бэкенд',email:'anna@mail.example',stage:'tech',stageLabel:'Техническое интервью',notes:2,updated:Date.now()},
  {id:'c2',name:'Пётр Сидоров',role:'Геймдизайнер',email:'',stage:'applied',stageLabel:'Отклик',notes:0,updated:Date.now()-1e6},
  {id:'c3',name:'Анна Белова',role:'Бэкенд',email:'',stage:'screen',stageLabel:'Скрининг',notes:1,updated:Date.now()-2e6},
  {id:'c4',name:'Илья Орлов',role:'Бэкенд',email:'',stage:'rejected',stageLabel:'Отказ',notes:3,updated:Date.now()-3e6}];
 const count=id=>cands.filter(c=>c.stage===id).length;
 const pipeline={mode:'pipeline',role:'',stages:STAGES.map(([id,label])=>({id,label,count:count(id)})),candidates:cands,roles:['Бэкенд','Геймдизайнер']};
 const anna=cands[0];
 const prep={mode:'prep',candidate:anna,role:'Бэкенд',skills:['Go','PostgreSQL','проектирование API'],by:'model',
  questions:[{skill:'Go',text:'Как вы отлаживали утечку горутин в продакшене?'},{skill:'Go',text:'Когда вы выберете каналы, а когда мьютекс?'},{skill:'PostgreSQL',text:'Как бы вы выбрали уровень изоляции для списания баланса?'},
   {skill:'проектирование API',text:'Расскажите о задаче, где вы применяли проектирование API: что было сложным и как вы это решили?'}],
  doubts:[{text:'В PostgreSQL слабо: путал уровни изоляции.',interviewer:'Вы',round:'screen',date:day(-6)},{text:'Не уверена в Kafka — стоит доспросить на финале.',interviewer:'Олег Смирнов',round:'tech',date:day(-2)}],
  previous:[{id:'n1',round:'screen',interviewer:'Вы',date:day(-6),text:'Уверенно проектирует API. [личные характеристики скрыты] <b>не HTML</b>'},{id:'n2',round:'tech',interviewer:'Олег Смирнов',date:day(-2),text:'Go знает глубоко.'}]};
 const summary={mode:'summary',candidate:anna,role:'Бэкенд',by:'model',dropped:1,rejected:2,
  notes:[{id:'n1',round:'screen',interviewer:'Вы',date:day(-6)},{id:'n2',round:'tech',interviewer:'Олег Смирнов',date:day(-2)}],
  criteria:[{criterion:'Go',quotes:[{text:'Go знает глубоко: горутины, контексты, профилирование.',note:'n2',interviewer:'Олег Смирнов',round:'tech',date:day(-2)}]},
   {criterion:'PostgreSQL',quotes:[{text:'В PostgreSQL слабо: путал уровни изоляции.',note:'n1',interviewer:'Вы',round:'screen',date:day(-6)}]},
   {criterion:'проектирование API',quotes:[{text:'Уверенно проектирует API, объяснил идемпотентность ретраев.',note:'n1',interviewer:'Вы',round:'screen',date:day(-6)},{text:'Хорошо разложил API на ресурсы.',note:'n2',interviewer:'Олег Смирнов',round:'tech',date:day(-2)}]},
   {criterion:'Kafka',quotes:[]}],
  other:[{text:'Не уверена в Kafka — стоит доспросить на финале.',note:'n2',interviewer:'Олег Смирнов',round:'tech'}]};
 const add={mode:'add',draftId:'draft-add',candidate:{name:'Пётр Сидоров',role:'Бэкенд',email:''},skills:['Go','PostgreSQL','проектирование API'],roles:['Бэкенд','Геймдизайнер'],known:false};
 const note={mode:'note',draftId:'draft-note',candidate:anna,round:'tech',interviewer:'Вы',text:'Уверенно проектирует API. Ей 45 лет.',flagged:1,stages:STAGES.map(([id,label])=>({id,label}))};
 const schedule={mode:'schedule',candidate:anna,duration:60,account:'lead@studio.example',interviewers:[{name:'Олег Смирнов',email:'oleg@studio.example'}],missing:[],
  people:[{name:'Вы',email:'lead@studio.example',self:true,error:''},{name:'Олег Смирнов',email:'oleg@studio.example',error:''}],
  slots:[{start:at(1,15),end:at(1,16),note:'свободны все, без встреч впритык'},{start:at(2,11),end:at(2,12),note:'свободны все'},{start:at(3,16),end:at(3,17),note:'свободны все'}],
  invitation:'Здравствуйте, Анна! Приглашаем вас на этап «Техническое интервью» по позиции «Бэкенд». Предлагаем время: {время} (60 минут). Если не подходит — ответьте, подберём другое.'};
 const msg=(card,text)=>({role:'assistant',text,by:'Найм',extensionData:{hiringCard:card}});
 await js(`view('home');showDialogueMessages(${JSON.stringify([msg(pipeline,'Найм: …'),msg(prep,'Интервью · …'),msg(summary,'Анна Иванова: …'),msg(add,'Кандидат …'),msg(note,'Заметки …'),msg(schedule,'Анна Иванова: слоты …')])},'Найм')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.hr-card').length===6"))break;await new Promise(r=>setTimeout(r,30));}
 const q=(sel)=>js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
 assert.equal(await q('.hr-pipeline .hr-stage'),7);assert.equal(await q('.hr-pipeline .hr-person'),4);
 assert.equal(await q('.hr-prep .hr-qskill'),3);assert.equal(await q('.hr-prep .hr-qs li'),4);assert.equal(await q('.hr-prep .hr-doubts .hr-quote'),2);
 assert.equal(await js("[...document.querySelectorAll('.hr-note p')].some(p=>p.textContent.includes('<b>'))&&!document.querySelector('.hr-note p b')"),true,'notes are text, never HTML');
 assert.equal(await q('.hr-summary .hr-mx-cell'),8);assert.equal(await q('.hr-summary .hr-mx-cell.has'),4);assert.equal(await q('.hr-summary .hr-crit .hr-quote'),5);
 assert.equal(await js("[...document.querySelectorAll('.hr-summary .hr-muted')].some(p=>p.textContent==='нет данных в заметках')"),true);
 assert.equal(await js("/score|балл|оценк/i.test(document.querySelector('.hr-summary').dataset.score||'')"),false);
 // Move Пётр: the stage menu, then «Отменить».
 await js("document.querySelectorAll('.hr-pipeline .hr-person')[1].querySelector('.kit-chip').click()");
 for(let i=0;i<60;i++){if(await js("!!document.querySelector('.kit-menu-item')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.startsWith('Скрининг')).click()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='move'))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='move'),['move','c2','screen']);
 for(let i=0;i<60;i++){if(await js("document.querySelectorAll('.hr-pipeline .hr-stage-n')[1].textContent==='2'"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.hr-pipeline .hr-stage-n')[1].textContent"),'2','the funnel follows');
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<60;i++){if(calls.filter(c=>c[0]==='move').length===2)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.filter(c=>c[0]==='move')[1],['move','c2','applied']);
 // The trash asks first: declined, nothing removed.
 await js("window.confirm=()=>false;void document.querySelectorAll('.hr-pipeline .delete-button')[1].click()");
 await new Promise(r=>setTimeout(r,200));assert.equal(calls.some(c=>c[0]==='remove'),false);
 // New candidate: the edited email, once.
 await js("(()=>{const c=document.querySelector('.hr-add');const i=c.querySelectorAll('.hr-field input');i[2].value='petr@mail.example';c.querySelector('.kit-actions .primary').click();})()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='add'))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='add'),['add','draft-add',{name:'Пётр Сидоров',role:'Бэкенд',email:'petr@mail.example'}]);
 for(let i=0;i<60;i++){if(await js("!document.querySelector('.hr-add > .kit-actions')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.hr-add .kit-chip').textContent"),'в воронке');
 // Notes: round changed to «Финальное интервью», interviewer kept.
 assert.equal(await q('.hr-note-card .hr-warn'),1);
 await js("(()=>{const c=document.querySelector('.hr-note-card');const s=c.querySelector('select');s.value='final';c.querySelector('.kit-actions .primary').click();})()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='saveNote'))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='saveNote'),['saveNote','draft-note',{round:'final',interviewer:'Вы'}]);
 // Scheduling: the second slot, the reviewed text, the hand-off.
 await js("window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,o]);};void 0");
 await js("document.querySelectorAll('.hr-schedule .hr-slot')[1].click()");
 assert.match(await js("document.querySelector('.hr-invite').value"),/^Здравствуйте, Анна! .* Предлагаем время: .+ \(60 минут\)/);
 assert.ok(!(await js("document.querySelector('.hr-invite').value")).includes('{время}'));
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.hr-schedule .kit-review:not([hidden])')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await q('.hr-schedule .kit-review-item'),1,'the outgoing review is shown');
 await require('./card-shot.cjs')(win,'.hr-schedule','petya-hiring-schedule');
 await js("document.querySelector('#card-shot .hr-schedule .kit-actions .primary').click()");
 for(let i=0;i<60;i++){if(await js("window.__asked.length===1"))break;await new Promise(r=>setTimeout(r,30));}
 const inv=calls.find(c=>c[0]==='invite');assert.equal(inv[1],'c1');assert.equal(inv[2].start,schedule.slots[1].start);assert.equal(inv[2].email,'anna@mail.example');
 assert.deepEqual(await js('window.__asked'),[['Поставь встречу «Интервью · Бэкенд · Анна Иванова» с anna@mail.example 12 ноября в 15:00 на 60 минут',{send:true}]]);
 await js("document.getElementById('card-shot').remove()");
 await require('./card-shot.cjs')(win,'.hr-pipeline,.hr-add,.hr-note-card','petya-hiring');
 await js("document.getElementById('card-shot').remove()");
 await require('./card-shot.cjs')(win,'.hr-summary','petya-hiring-summary');
 await js("document.getElementById('card-shot').remove()");
 await require('./card-shot.cjs')(win,'.hr-prep','petya-hiring-prep');
 console.log('Hiring cards: pipeline with stage menu and undo, trash asks, prep, verbatim summary grid, candidate and notes saved once, slots with reviewed invitation hand-off passed');
}};
require('../src/main.cjs');
