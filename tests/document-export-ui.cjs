// «Сохранить в Google Docs» on other apps' cards (cross-app kind `document-export`): the meeting summary, the
// «Поиск по всему» answer and the journal week report. Without a connected provider there is no button; with one,
// pressing it hands the card's text as Markdown (title, app, text) to the provider, which only prepares a request.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+(label||test));};
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),runs=[];let connected=false;
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='document-export'&&connected?[{id:'google-drive',name:'Google Диск',label:'Сохранить в Google Документы'}]:[];
  if(name==='appLinks'&&method==='run'){runs.push(args);return {text:'ok'};}
  return null;
 });
 const summary={sessionId:'s1',title:'Планирование спринта 14',basis:'recording',decisions:['Релиз 1.5 переносим на среду'],
  tasks:[{what:'Починить вылет при входе в магазин',who:'Олег',due:'пятница'},{what:'Подготовить сборку для QA',who:'Мария',due:''}],notDiscussed:['Бюджет на рекламу'],discussed:['Метрики удержания']};
 const now=Date.now();
 const answer={query:'матчмейкинг',found:true,text:'На пиках поиск идёт до 4 минут [1]. Решили начать с окна MMR 200 [2].',citations:[
  {n:1,source:'slack',title:'#jw-bw-dev · Матчмейкинг [пики]',url:'https://team.slack.com/archives/C1/p1762000100000200',at:now-3600e3},
  {n:2,source:'google-drive',label:'Google Диск',icon:'drive',color:'#a8d5b0',title:'Матчмейкинг: правила лиг',url:'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit',at:now-86400e3}]};
 const pad=v=>String(v).padStart(2,'0'),ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const day0=new Date();day0.setHours(0,0,0,0);const monday=new Date(day0);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
 const T=(meetings,tasks,commits,chats,messages,reminders,focusMinutes=0)=>({meetings,meetingMinutes:meetings*40,tasks,commits,focusMinutes,chats,messages,reminders,notes:0});
 const days=[...Array(7)].map((_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return {date:ymd(d),future:d>day0,totals:d>day0?T(0,0,0,0,0,0):T(1,2,3,1,0,0)};});
 const at=(h,m)=>{const d=new Date(day0);d.setHours(h,m,0,0);return d.getTime();};
 const week={mode:'week',date:ymd(day0),now,tomorrow:ymd(new Date(day0.getTime()+86400000)),week:days,totals:T(4,7,12,5,2,1),carry:[],planned:[],errors:[],sources:[],focus:false,timeline:[
  {at:at(10,30),kind:'meeting',icon:'meeting',title:'Синк по UI',detail:'≈ 45 мин',source:'meeting'},
  {at:at(11,0),kind:'chat',icon:'chat',title:'Почему падает билд',detail:'',source:'chat'},
  {at:at(12,0),kind:'note',icon:'note',title:'Запись в дневнике',detail:'',private:true,source:'note'},
  {at:at(13,0),kind:'task',icon:'task',title:'Создана задача BW-130',detail:'Краш на Android 9',url:'https://acme.atlassian.net/browse/BW-130',source:'jira'}]};
 const messages=[{role:'user',text:'сводка встречи'},{role:'assistant',text:'Сводка встречи.',by:'Встречи',extensionData:{meetingSummary:summary}},
  {role:'user',text:'Ответь по найденному'},{role:'assistant',text:answer.text,by:'Поиск по всему',extensionData:{searchAllAnswer:answer}},
  {role:'user',text:'итоги недели'},{role:'assistant',text:'За неделю…',by:'Дневник дня',extensionData:{journalCard:week}}];
 const show=()=>js(`view('home');window.resultKit.availableLinks.clear();showDialogueMessages(${JSON.stringify(messages)},'Документы')`);
 const cards=['.meeting-card','.sa-answer','.journal-card'];
 // 1. No provider connected: nothing changes on the cards.
 await show();
 await wait(cards.map(c=>`!!document.querySelector('${c}')`).join('&&'),'cards');
 await new Promise(r=>setTimeout(r,500));
 for(const c of cards)assert.equal(await js(`document.querySelectorAll('${c} .kit-links[data-kind=document-export] button').length`),0,c+': no provider → no button');
 // 2. «Google Диск» connected: one button per card, with the cards' own label.
 connected=true;await show();
 await wait(cards.map(c=>`!!document.querySelector('${c} .kit-links[data-kind=document-export] button')`).join('&&'),'buttons');
 for(const c of cards)assert.equal(await js(`document.querySelector('${c} .kit-links[data-kind=document-export] button').textContent`),'Сохранить в Google Docs',c);
 const press=async c=>{const n=runs.length;await js(`document.querySelector('${c} .kit-links[data-kind=document-export] button').click()`);for(let i=0;i<100&&runs.length===n;i++)await new Promise(r=>setTimeout(r,30));const [kind,id,payload]=runs.at(-1);assert.equal(kind,'document-export');assert.equal(id,'google-drive');return payload;};
 const meeting=await press('.meeting-card');
 assert.equal(meeting.title,'Сводка встречи: Планирование спринта 14');assert.equal(meeting.app,'Встречи');
 assert.equal(meeting.text,'## Решили\n- Релиз 1.5 переносим на среду\n\n## Задачи\n- Починить вылет при входе в магазин — Олег (срок: пятница)\n- Подготовить сборку для QA — Мария\n\n## Не обсудили\n- Бюджет на рекламу\n\n## Обсудили\n- Метрики удержания');
 const found=await press('.sa-answer');
 assert.equal(found.title,'Ответ по найденному: матчмейкинг');assert.equal(found.app,'Поиск по всему');
 assert.equal(found.text,'На пиках поиск идёт до 4 минут [1]. Решили начать с окна MMR 200 [2].\n\n## Источники\n- [1] [#jw-bw-dev · Матчмейкинг (пики)](https://team.slack.com/archives/C1/p1762000100000200) — Slack\n- [2] [Матчмейкинг: правила лиг](https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit) — Google Диск');
 const report=await press('.journal-card');
 assert.match(report.title,/^Итоги недели · \d+ \S+ – \d+ \S+$/);assert.equal(report.app,'Дневник дня');
 assert.match(report.text,/^## Итого\n- Встречи: 4\n- Задачи: 7\n- Коммиты: 12\n- Чаты с Петей: 5\n- Сообщения: 2\n\n## По дням\n/);
 assert.match(report.text,/## Главное за неделю\n- \S+ 10:30 · Синк по UI — ≈ 45 мин\n- \S+ 13:00 · \[Создана задача BW-130\]\(https:\/\/acme\.atlassian\.net\/browse\/BW-130\) — Краш на Android 9$/);
 assert.doesNotMatch(report.text,/Почему падает билд|Запись в дневнике/,'chats and private notes stay out');
 // An answer card saved before the answer text was kept offers nothing to save.
 await js(`showDialogueMessages([{role:'assistant',text:'Старый ответ.',by:'Поиск по всему',extensionData:{searchAllAnswer:${JSON.stringify({...answer,text:undefined})}}}],'Старый')`);
 await wait("!!document.querySelector('.sa-answer')");await new Promise(r=>setTimeout(r,300));
 assert.equal(await js("document.querySelectorAll('.sa-answer .kit-links[data-kind=document-export]').length"),0);
 await show();await wait(cards.map(c=>`!!document.querySelector('${c} .kit-links[data-kind=document-export] button')`).join('&&'),'buttons again');
 await require('./card-shot.cjs')(win,'.meeting-card','petya-document-export-meeting');
 await require('./card-shot.cjs')(win,'.sa-answer','petya-document-export-answer');
 await require('./card-shot.cjs')(win,'.journal-card','petya-document-export-week');
 console.log('Document export from other cards: no button without a provider; meeting summary, search answer and week report handed over as Markdown passed');
}};
require('../src/main.cjs');
