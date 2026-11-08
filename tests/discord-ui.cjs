// «Discord» cards in the real chat: channel chips with unread counts, messages per day with bugs marked, mood meter,
// themes with verbatim quotes and message links, a bug theme to the task tracker, FAQ with a pinned-based draft and
// its reply editor (exact text, the question's own channel), the model-free card and the compose card.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),sent=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:[];
  if(name==='discordApp'&&method==='send'){sent.push(args);return {id:'900000000000000099',url:'https://discord.com/channels/1/2/900000000000000099',text:'Отправлено в Discord.'};}
  throw Error('unexpected '+name+'.'+method);
 });
 const G='900000000000000001',url=(c,m)=>'https://discord.com/channels/'+G+'/'+c+'/'+m;
 const day=i=>new Date(Date.UTC(2026,10,3+i)).toISOString().slice(0,10);
 const counts=[[12,1],[18,2],[9,0],[25,6],[31,11],[22,4],[14,2]];
 const card={id:'c1',guild:G,guildName:'Bunker Wars',mode:'digest',days:null,from:day(0)+'T00:00:00Z',to:day(6)+'T20:00:00Z',total:131,
  channels:[{id:'10',name:'general',type:0,count:84,unread:23,url:''},{id:'11',name:'bug-reports',type:0,count:31,unread:9,url:''},{id:'12',name:'announcements',type:5,count:0,unread:0,url:''},{id:'13',name:'help',type:15,count:16,unread:0,url:''}],
  activity:counts.map(([count,bugs],i)=>({date:day(i),count,bugs})),mood:{score:-0.32,byModel:true},
  clusters:[
   {title:'Вылеты после патча 4.13',kind:'bug',sentiment:-1,count:14,quotes:[{text:'После патча вылетает на загрузке 87%',url:url(11,'5001'),author:'Dima',channel:'11',id:'5001'},{text:'Samsung A52, вылет сразу после логотипа',url:url(10,'5002'),author:'Anna',channel:'10',id:'5002'}],messages:[]},
   {title:'Когда новый сезон',kind:'question',sentiment:0,count:11,quotes:[{text:'Когда будет новый сезон? Уже всё прошёл',url:url(10,'5003'),author:'Petr',channel:'10',id:'5003'}],messages:[]},
   {title:'Ивент «Пламя» понравился',kind:'praise',sentiment:1,count:7,quotes:[{text:'Спасибо за ивент, очень круто! <img src=x onerror=alert(1)>',url:url(10,'5004'),author:'Kolya',channel:'10',id:'5004'}],messages:[]},
   {title:'Дорогой боевой пропуск',kind:'feedback',sentiment:-1,count:5,quotes:[{text:'пропуск за 999 это перебор',url:url(10,'5005'),author:'Lena',channel:'10',id:'5005'}],messages:[]}],
  faq:[
   {question:'Когда стартует новый сезон?',count:11,answer:'Новый сезон стартует 20 ноября — все детали в #announcements.',pin:{url:url(12,'4001'),text:'Новый сезон стартует 20 ноября.',channel:'12'},latest:{text:'Когда будет новый сезон? Уже всё прошёл',url:url(10,'5003'),author:'Petr',channel:'10',id:'5003'},channel:'10',thread:null,messages:[]},
   {question:'Где взять ключи от бункера?',count:4,answer:'',pin:null,latest:{text:'Где взять ключи от бункера?',url:url(20,'5010'),author:'Ivan',channel:'13',id:'5010'},channel:'13',thread:'20',messages:[]}],
  faqByModel:true,bugs:[],pinned:[],sendable:[{id:'10',name:'general'},{id:'12',name:'announcements'}],hidden:false,notes:[],model:true,at:Date.now()};
 const plain={...card,id:'c2',mode:'bugs',days:7,clusters:null,faq:null,mood:{score:-0.5,byModel:false},channels:card.channels.slice(0,2).map(c=>({...c,unread:0})),
  bugs:[{text:'Магазин не открывается, ошибка 502',url:url(11,'5020'),author:'Lena',channel:'11',at:'2026-11-08T12:10:00Z',id:'5020'},{text:'Игра вылетает после обновления на Samsung A52',url:url(10,'5021'),author:'Anna',channel:'10',at:'2026-11-08T10:40:00Z',id:'5021'}]};
 const compose={id:'m1',guild:G,guildName:'Bunker Wars',channel:{id:'12',name:'announcements'},text:'Патч 4.13.1 уже в сторах:\n- исправлен вылет на загрузке\n- ускорен матчмейкинг',limit:2000,replyTo:null,sent:null};
 await js(`view('home');showDialogueMessages([{role:'user',text:'что нового в дискорде'},{role:'assistant',text:'Discord с прошлого просмотра: 131 сообщение игроков.',by:'Discord',extensionData:{discordDigest:${JSON.stringify(card)}}},{role:'assistant',text:'Баги.',by:'Discord',extensionData:{discordDigest:${JSON.stringify(plain)}}},{role:'assistant',text:'Сообщение готово.',by:'Discord',extensionData:{discordCompose:${JSON.stringify(compose)}}}],'Discord')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.discord-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.discord-card').length"),3);
 const first="document.querySelector('.discord-card')";
 assert.deepEqual(await js(first+".querySelectorAll('.dc-channel').length"),4);
 assert.equal(await js(first+".querySelector('.dc-channel .dc-unread').textContent"),'23');
 assert.equal(await js(first+".querySelectorAll('.dc-col').length"),7);
 assert.equal(await js(first+".querySelectorAll('.dc-seg.bug').length"),6,'days with bug reports are marked');
 assert.equal(await js(first+".querySelector('.dc-mood-track').getAttribute('aria-valuenow')"),'-0.32');
 assert.equal(await js(first+".querySelectorAll('.dc-cluster').length"),4);
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'player text is never HTML');
 assert.equal(await js(first+".querySelector('.dc-quote a').href"),url(11,'5001'));
 assert.equal(await js(first+".querySelectorAll('.dc-cluster-title[data-no-i18n]').length"),4);
 for(let i=0;i<50;i++){if(await js(first+".querySelector('.dc-cluster .kit-link')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(first+".querySelectorAll('.dc-cluster .kit-link').length"),1,'only the bug theme goes to the tracker');
 assert.equal(await js(first+".querySelectorAll('.dc-faq-item').length"),2);
 assert.match(await js(first+".querySelectorAll('.dc-faq-item')[1].textContent"),/ответа нет/);
 // Reply to a frequent question: the editor holds exactly the draft and names the question's channel.
 await js(first+".querySelector('.dc-faq-item .dc-row-actions button').click()");
 assert.equal(await js(first+".querySelector('.dc-editor textarea').value"),'Новый сезон стартует 20 ноября — все детали в #announcements.');
 assert.match(await js(first+".querySelector('.dc-editor .kit-draft-label').textContent"),/#general/);
 await require('./card-shot.cjs')(win,'.discord-card','petya-discord');
 for(const [part,selector] of [['faq',".discord-card .dc-faq"],['plain',".discord-card:nth-of-type(2)"]]){
  await js(`(()=>{const box=document.getElementById('card-shot'),n=document.querySelectorAll(${JSON.stringify(selector)})[0];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()`);
  win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-discord-'+part+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js(`(()=>{const a=document.querySelector('.discord-card .dc-editor textarea');a.value+=' Ждём вас!';a.dispatchEvent(new Event('input'));a.closest('.dc-editor').querySelector('.primary').click();})()`);
 for(let i=0;i<50;i++){if(sent.length===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[0],[{card:'c1',replyTo:'5003'},'Новый сезон стартует 20 ноября — все детали в #announcements. Ждём вас!']);
 assert.equal(await js(first+".querySelector('.dc-faq-item .dc-row-actions button').disabled"),true,'sent once');
 // Model-free bugs card and the compose card.
 const second="document.querySelectorAll('.discord-card')[1]";
 assert.match(await js(second+".querySelector('.dc-clusters').textContent"),/локальная модель/);
 assert.equal(await js(second+".querySelectorAll('.dc-bug').length"),2);
 const third="document.querySelectorAll('.discord-card')[2]";
 assert.equal(await js(third+".querySelector('textarea').value"),compose.text);
 assert.equal(await js(third+".querySelector('.dc-target .kit-chip').textContent"),'#announcements');
 await js(`(()=>{const a=document.querySelectorAll('.discord-card')[2].querySelector('textarea');a.value='';a.dispatchEvent(new Event('input'));})()`);
 assert.equal(await js(third+".querySelector('.dc-editor .primary').disabled"),true,'an empty message cannot be sent');
 await js(`(()=>{const a=document.querySelectorAll('.discord-card')[2].querySelector('textarea');a.value=${JSON.stringify(compose.text)};a.dispatchEvent(new Event('input'));})()`);
 await js(`(()=>{const box=document.getElementById('card-shot'),n=document.querySelectorAll('.discord-card')[2];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()`);
 win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-discord-compose.png'),(await win.webContents.capturePage()).toPNG());
 await js(third+".querySelector('.dc-editor .primary').click()");
 for(let i=0;i<50;i++){if(sent.length===2)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[1],[{card:'m1',channel:'12'},compose.text]);
 assert.equal(await js(third+".querySelector('.kit-card-head .kit-chip').textContent"),'отправлено');
 console.log('Discord cards: channel chips with unread, activity with bugs, mood, themes with quotes and links, bug to tracker, FAQ editor with exact text, model-free card, compose card passed');
}};
require('../src/main.cjs');
