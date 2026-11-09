// «VK Teams» cards in the real chat: the chat digest (chat chips, messages per day, who wrote, themes with verbatim
// quotes, the note that the bot reads only since it joined, active threads), the thread summary with a reply editor,
// search over received messages and the compose card (exact text and chat, sent once). VK Teams messages have no web
// links: quotes show author, chat and time. Data never becomes HTML. Screenshots: petya-vk-teams*.png in the temp folder.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),sent=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name==='vkTeamsApp'&&method==='send'){sent.push(args);return {id:'9001',url:'',text:'Отправлено в VK Teams.'};}
  if(name==='outgoing'&&method==='review')return {text:args[0].text,findings:[],checked:[],skipped:[]};
  throw Error('unexpected '+name+'.'+method);
 });
 const day=i=>new Date(Date.UTC(2026,10,3+i)).toISOString().slice(0,10);
 const ago=h=>new Date(Date.now()-h*3600000).toISOString();
 const q=(text,author,channel,h)=>({text,url:'',author,channel,at:ago(h)});
 const digest={id:'v1',app:'vk-teams',mode:'digest',since:day(0)+'T00:00:00Z',until:day(6)+'T20:00:00Z',days:7,total:58,server:'VK Teams',
  channels:[{id:'681@chat.agent',name:'Релизы',count:41,url:''},{id:'682@chat.agent',name:'QA команда',count:15,url:''},{id:'ivan@corp',name:'Иван',count:2,url:''}],
  activity:[0,0,6,12,9,18,13].map((count,i)=>({date:day(i),count})),
  authors:[{name:'Оля Котова',count:24},{name:'Иван',count:19},{name:'Марина',count:15}],
  themes:[{title:'Перенос релиза 2.3',count:22,quotes:[q('Релиз 2.3 переносим на пятницу, не успеваем с оплатой','Оля Котова','Релизы',30)],messages:[]},
   {title:'Вылеты на Android 14',count:11,quotes:[q('Повторил вылет на Pixel 8 <b>после</b> оплаты','Марина','QA команда',8)],messages:[]}],
  threads:[{id:'7001',channel:{id:'681@chat.agent',name:'Релизы'},title:'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',url:'',replies:9,last:ago(3),people:['Оля Котова','Иван']}],
  latest:[],notes:['Бот получает сообщения с момента подключения: самое раннее сохранённое — 5 ноября, 10:12.'],model:true,at:Date.now(),sendable:[]};
 const thread={id:'vt',app:'vk-teams',mode:'thread',channel:{id:'681@chat.agent',name:'Релизы'},limit:4096,server:'VK Teams',
  thread:{id:'7001',root:q('Релиз 2.3 переносим на пятницу, не успеваем с оплатой','Оля Котова','Релизы',30),replies:9,people:['Оля Котова','Иван'],first:ago(30),last:ago(3),
   summary:'Релиз перенесли на пятницу; Иван доделывает оплату, Оля пишет changelog.',
   points:[{kind:'decision',text:'Релиз в пятницу',quote:{...q('Релиз 2.3 переносим на пятницу','Оля Котова','Релизы',30),verbatim:true}},{kind:'task',text:'Changelog — Оля',quote:{...q('Changelog за мной','Оля Котова','Релизы',20),verbatim:true}}],
   byModel:true,messages:[q('Ок, допилю экран оплаты','Иван','Релизы',25),q('Changelog за мной','Оля Котова','Релизы',20)]},notes:[],model:true,at:Date.now()};
 const search={id:'vs',app:'vk-teams',mode:'search',query:'сборку',scope:'сообщения, полученные ботом',total:2,server:'VK Teams',results:[q('Сборку 512 выложил в TestFlight','Иван','Релизы',5),q('сборка падает на тестах','Марина','QA команда',9)],notes:[],at:Date.now()};
 const compose={id:'vc',app:'vk-teams',channel:{id:'681@chat.agent',name:'Релизы'},text:'Билд 2.3 готов, changelog в треде',limit:4096,sent:null,server:'VK Teams'};
 const data=[['что нового в vk teams','vkTeamsCard',digest],['перескажи тред','vkTeamsCard',thread],['найди в vk teams','vkTeamsCard',search],['отправь в vk teams','vkTeamsCompose',compose]];
 await js(`view('home');showDialogueMessages(${JSON.stringify(data.flatMap(([text,k,d])=>[{role:'user',text},{role:'assistant',text:'VK Teams.',by:'VK Teams',extensionData:{[k]:d}}]))},'VK Teams')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.vk-teams-card').length===4"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.vk-teams-card').length"),4);
 const card=n=>`document.querySelectorAll('.vk-teams-card')[${n}]`;
 assert.equal(await js(card(0)+".querySelectorAll('.ms-channel').length"),3);
 assert.equal(await js(card(0)+".querySelector('.ms-channel-name').textContent"),'Релизы','chat titles have no sigil');
 assert.equal(await js(card(0)+".querySelectorAll('.ms-theme').length"),2);
 assert.equal(await js(card(0)+".querySelectorAll('.ms-quote a').length"),0,'no web links for VK Teams messages');
 assert.match(await js(card(0)+".textContent"),/с момента подключения/);
 assert.equal(await js("document.querySelectorAll('.vk-teams-card b:not(.kit-draft-label b)').length"),0,'message text is never HTML');
 await require('./card-shot.cjs')(win,'.vk-teams-card','petya-vk-teams');
 const shot=async(n,name)=>{
  await js(`(()=>{const box=document.getElementById('card-shot'),n=document.querySelectorAll('.vk-teams-card')[${n}];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()`);
  win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-vk-teams-'+name+'.png'),(await win.webContents.capturePage()).toPNG());
 };
 await shot(1,'thread');
 // Thread reply: exactly the typed text, to the thread's root.
 await js(card(1)+".querySelector('.ms-row-actions button').click()");
 await js(`(()=>{const a=${card(1)}.querySelector('.ms-editor textarea');a.value='Changelog готов';a.dispatchEvent(new Event('input'));})()`);
 await js(card(1)+".querySelector('.ms-editor .primary').click()");
 for(let i=0;i<50;i++){if(sent.length===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[0],[{card:'vt',root:'7001'},'Changelog готов']);
 assert.equal(await js(card(2)+".querySelectorAll('.ms-result').length"),2);
 assert.equal(await js(card(3)+".querySelector('.ms-target .kit-chip').textContent"),'Релизы');
 assert.equal(await js(card(3)+".querySelector('textarea').value"),compose.text);
 await shot(2,'search');
 await js(card(3)+".querySelector('.ms-editor .primary').click()");
 for(let i=0;i<50;i++){if(sent.length===2)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[1],[{card:'vc',channel:'681@chat.agent'},compose.text]);
 for(let i=0;i<50;i++){if(await js(card(3)+".querySelector('.ms-editor')===null"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(card(3)+".querySelector('.ms-editor')"),null,'sent once: the editor is gone');
 assert.equal(await js(card(3)+".querySelector('.kit-card-head .kit-chip').textContent"),'отправлено');
 console.log('VK Teams cards: chat digest with themes, quotes without links and the since-joined note; thread with points and a reply to the root; search; compose with exact text and chat sent once passed');
}};
require('../src/main.cjs');
