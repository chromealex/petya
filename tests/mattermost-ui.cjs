// «Mattermost» cards in the real chat: the digest (channel chips, messages per day, who wrote with statuses, themes
// with verbatim quotes and post links, active threads with «Пересказать»), the model-free digest (latest messages),
// the thread summary (points with quotes, the last replies, a reply editor with the exact text, the task tracker),
// search results with the words marked, and the compose card (exact text and channel, sent once). Data never
// becomes HTML. Screenshots: petya-mattermost*.png in the temp folder.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),sent=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:[];
  if(name==='mattermostApp'&&method==='send'){sent.push(args);return {id:'s'.repeat(26),url:'https://chat.example.com/studio/pl/'+'s'.repeat(26),text:'Отправлено в Mattermost.'};}
  if(name==='outgoing'&&method==='review')return {text:args[0].text,findings:[],checked:[],skipped:[]};
  throw Error('unexpected '+name+'.'+method);
 });
 const pl=x=>'https://chat.example.com/studio/pl/'+(x+'0'.repeat(26)).slice(0,26);
 const day=i=>new Date(Date.UTC(2026,10,3+i)).toISOString().slice(0,10);
 const ago=h=>new Date(Date.now()-h*3600000).toISOString();
 const counts=[14,22,9,31,40,18,26];
 const digest={id:'d1',app:'mattermost',mode:'digest',since:day(0)+'T00:00:00Z',until:day(6)+'T20:00:00Z',days:7,total:160,server:'chat.example.com',
  channels:[{id:'a',name:'Dev',count:96,url:'https://chat.example.com/studio/channels/dev'},{id:'b',name:'QA',count:52,url:''},{id:'c',name:'Releases',count:12,url:''},{id:'e',name:'Random',count:0,url:''}],
  activity:counts.map((count,i)=>({date:day(i),count})),
  authors:[{name:'Оля Котова',count:48,status:'online'},{name:'Иван Петров',count:37,status:'away'},{name:'Марина',count:22,status:'dnd'},{name:'Сергей',count:9,status:'offline'}],
  threads:[{id:'t1',channel:{id:'a',name:'Dev'},title:'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',url:pl('t1'),replies:14,last:ago(2),people:['Оля Котова','Иван Петров','Марина']},
   {id:'t2',channel:{id:'b',name:'QA'},title:'Вылет на Android 14 при оплате <img src=x onerror=alert(1)>',url:pl('t2'),replies:6,last:ago(5),people:['Марина']}],
  themes:[{title:'Перенос релиза 2.3',count:31,quotes:[{text:'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',url:pl('p1'),author:'Оля Котова',channel:'Dev',at:ago(26)},{text:'Тогда я допилю экран оплаты к четвергу',url:pl('p2'),author:'Иван Петров',channel:'Dev',at:ago(25)}],messages:[]},
   {title:'Вылеты на Android 14',count:17,quotes:[{text:'Нашли вылет на Android 14 при оплате',url:pl('p3'),author:'Марина',channel:'QA',at:ago(30)}],messages:[]},
   {title:'Ревью матчмейкинга',count:8,quotes:[{text:'Кто ревьюит PR про матчмейкинг?',url:pl('p4'),author:'Сергей',channel:'Dev',at:ago(40)}],messages:[]}],
  latest:[],notes:[],model:true,at:Date.now()};
 const plain={...digest,id:'d2',days:1,total:3,themes:null,threads:[],channels:digest.channels.slice(0,2).map(c=>({...c,count:c.name==='Dev'?2:1})),activity:[{date:day(6),count:3}],authors:digest.authors.slice(0,2),
  latest:[{text:'build #512 упал на тестах оплаты',url:pl('l1'),author:'Иван Петров',channel:'Dev',at:ago(1)},{text:'Чиню',url:pl('l2'),author:'Оля Котова',channel:'Dev',at:ago(0.5)},{text:'Повторил вылет',url:pl('l3'),author:'Марина',channel:'QA',at:ago(0.2)}]};
 const thread={id:'th1',app:'mattermost',mode:'thread',channel:{id:'a',name:'Dev'},limit:16383,server:'chat.example.com',
  thread:{id:'t1'.padEnd(26,'0'),root:{text:'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',url:pl('t1'),author:'Оля Котова',channel:'Dev',at:ago(26)},replies:14,people:['Оля Котова','Иван Петров','Марина'],first:ago(26),last:ago(2),
   summary:'Релиз 2.3 перенесли на пятницу: экран оплаты не готов. Иван доделывает оплату, Оля пишет changelog, вылет на Android 14 ещё не разобран.',
   points:[{kind:'decision',text:'Релиз переносится на пятницу',quote:{text:'Релиз 2.3 переносим на пятницу',url:pl('t1'),author:'Оля Котова',channel:'Dev',at:ago(26),verbatim:true}},
    {kind:'task',text:'Иван доделывает экран оплаты к четвергу',quote:{text:'я допилю экран оплаты к четвергу',url:pl('p2'),author:'Иван Петров',channel:'Dev',at:ago(25),verbatim:true}},
    {kind:'question',text:'Кто разбирает вылет на Android 14?',quote:{text:'а вылет на Android 14 кто смотрит?',url:pl('p5'),author:'Марина',channel:'Dev',at:ago(20),verbatim:true}}],
   byModel:true,messages:[{text:'Changelog пишу я',url:pl('r1'),author:'Оля Котова',channel:'Dev',at:ago(4)},{text:'Ок',url:pl('r2'),author:'Иван Петров',channel:'Dev',at:ago(3)},{text:'Вылет беру на себя',url:pl('r3'),author:'Марина',channel:'Dev',at:ago(2)}]},notes:[],model:true,at:Date.now()};
 const search={id:'s1',app:'mattermost',mode:'search',query:'оплату',scope:'выбранные каналы',total:3,server:'chat.example.com',
  results:[{text:'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',url:pl('t1'),author:'Оля Котова',channel:'Dev',at:ago(26)},{text:'Нашли вылет на Android 14 при оплате',url:pl('p3'),author:'Марина',channel:'QA',at:ago(30)},{text:'Оплата в Китае снова падает <script>x</script>',url:pl('p9'),author:'Сергей',channel:'Dev',at:ago(70)}],notes:[],at:Date.now()};
 const compose={id:'m1',app:'mattermost',channel:{id:'c',name:'Releases'},text:'Билд 2.3 готов:\n- оплата починена\n- changelog в треде',limit:16383,sent:null,server:'chat.example.com'};
 const data=[['что нового в mattermost за неделю','mattermostCard',digest],['mattermost за сегодня','mattermostCard',plain],['перескажи тред','mattermostCard',thread],['найди в mattermost про оплату','mattermostCard',search],['отправь в mattermost','mattermostCompose',compose]];
 await js(`view('home');showDialogueMessages(${JSON.stringify(data.flatMap(([q,k,d])=>[{role:'user',text:q},{role:'assistant',text:'Mattermost.',by:'Mattermost',extensionData:{[k]:d}}]))},'Mattermost')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.mattermost-card').length===5"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.mattermost-card').length"),5);
 const card=n=>`document.querySelectorAll('.mattermost-card')[${n}]`;
 assert.equal(await js(card(0)+".querySelectorAll('.ms-channel').length"),4);
 assert.equal(await js(card(0)+".querySelectorAll('.ms-col').length"),7);
 assert.equal(await js(card(0)+".querySelectorAll('.ms-author .ms-dot.online').length"),1);
 assert.equal(await js(card(0)+".querySelectorAll('.ms-theme').length"),3);
 assert.equal(await js(card(0)+".querySelector('.ms-quote a').href"),pl('p1'));
 assert.equal(await js(card(0)+".querySelectorAll('.ms-theme-title[data-no-i18n]').length"),3);
 assert.equal(await js(card(0)+".querySelectorAll('.ms-thread').length"),2);
 assert.equal(await js("document.querySelectorAll('.mattermost-card img, .mattermost-card script').length"),0,'message text is never HTML');
 assert.match(await js(card(1)+".querySelector('.ms-themes').textContent"),/локальная модель/);
 assert.equal(await js(card(1)+".querySelectorAll('.ms-quote').length"),3);
 // Thread: points with quotes, the reply editor holds exactly the typed text.
 assert.equal(await js(card(2)+".querySelectorAll('.ms-point').length"),3);
 for(let i=0;i<50;i++){if(await js(card(2)+".querySelector('.kit-link')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(card(2)+".querySelectorAll('.kit-link').length"),1,'the thread can go to the task tracker');
 assert.equal(await js(card(3)+".querySelectorAll('.ms-result').length"),3);
 assert.equal(await js(card(3)+".querySelectorAll('.ms-result mark').length"),3);
 await require('./card-shot.cjs')(win,'.mattermost-card','petya-mattermost');
 const shot=async(n,name)=>{
  await js(`(()=>{const box=document.getElementById('card-shot'),n=document.querySelectorAll('.mattermost-card')[${n}];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()`);
  win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-mattermost-'+name+'.png'),(await win.webContents.capturePage()).toPNG());
 };
 await shot(1,'plain');await shot(2,'thread');await shot(3,'search');
 await js(card(2)+".querySelector('.ms-row-actions button').click()");
 await js(`(()=>{const a=${card(2)}.querySelector('.ms-editor textarea');a.value='Беру вылет на Android 14';a.dispatchEvent(new Event('input'));})()`);
 await shot(2,'reply');
 await js(card(2)+".querySelector('.ms-editor .primary').click()");
 for(let i=0;i<50;i++){if(sent.length===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[0],[{card:'th1',root:thread.thread.id},'Беру вылет на Android 14']);
 assert.equal(await js(card(2)+".querySelector('.ms-row-actions button').disabled"),true,'replied once');
 // Compose: exact text and channel; an empty text cannot be sent.
 assert.equal(await js(card(4)+".querySelector('textarea').value"),compose.text);
 assert.equal(await js(card(4)+".querySelector('.ms-target .kit-chip').textContent"),'~Releases');
 await js(`(()=>{const a=${card(4)}.querySelector('textarea');a.value='';a.dispatchEvent(new Event('input'));})()`);
 assert.equal(await js(card(4)+".querySelector('.ms-editor .primary').disabled"),true);
 await js(`(()=>{const a=${card(4)}.querySelector('textarea');a.value=${JSON.stringify(compose.text)};a.dispatchEvent(new Event('input'));})()`);
 await shot(4,'compose');
 await js(card(4)+".querySelector('.ms-editor .primary').click()");
 for(let i=0;i<50;i++){if(sent.length===2)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[1],[{card:'m1',channel:'c'},compose.text]);
 assert.equal(await js(card(4)+".querySelector('.kit-card-head .kit-chip').textContent"),'отправлено');
 console.log('Mattermost cards: digest with channels, activity, statuses, themes with quotes and links, threads; model-free digest; thread summary with points, reply editor and tracker; search with marks; compose with exact text sent once passed');
}};
require('../src/main.cjs');
