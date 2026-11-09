// «Учёт времени» cards in the real chat: the day (category bar, timeline with meetings and focus, apps with category
// chips), the week columns, the tasks card, and the Jira worklog preview (stubbed feature calls) that writes only
// the ticked rows after «Записать».
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const day=new Date();day.setHours(0,0,0,0);const at=(h,m=0)=>day.getTime()+(h*60+m)*60000;
 const labels={work:'Работа',meetings:'Встречи',communication:'Общение',other:'Другое'},colors={work:'#7fb894',meetings:'#d9a35f',communication:'#7aa6d8',other:'#8c8f96'};
 const timeline=[[9,0,10,30,'work','Unity'],[10,30,10,50,'communication','Slack'],[10,50,11,30,'work','Google Chrome, Rider'],[11,30,12,0,'meetings','Zoom'],[12,0,12,40,'other','Google Chrome'],
  [13,30,15,10,'work','Visual Studio Code, Unity'],[15,10,15,25,'communication','Telegram'],[15,25,16,0,'meetings','Microsoft Teams'],[16,0,17,45,'work','Unity'],[17,45,18,0,'communication','Slack']]
  .map(([a,b,c,d,category,label])=>({start:at(a,b),end:at(c,d),category,label}));
 const base={period:{kind:'day',label:'сегодня',from:day.getTime(),to:day.getTime()+86400000},now:Date.now(),labels,colors,tracking:{enabled:true,paused:false,interval:15,since:6},jira:true,worklog:false,exportReady:false,calendar:true,untagged:0,app:null,days:[]};
 const dayCard={...base,mode:'app',total:8*3600000,categories:[{id:'work',ms:5*3600000+5*60000},{id:'meetings',ms:65*60000},{id:'communication',ms:50*60000},{id:'other',ms:40*60000}],
  timeline,meetings:[{title:'Синк по магазину',start:at(11,30),end:at(12,0)},{title:'Ретро',start:at(15,30),end:at(16,0)}],focus:[{start:at(9,0),end:at(9,50),label:'BW-123 магазин'},{start:at(16,0),end:at(17,15),label:''}],
  rows:[{key:'Unity',ms:3.6*3600000,category:'work',detail:'',top:''},{key:'Google Chrome',ms:80*60000,category:'other',detail:'',top:'[BW-123] Магазин падает при покупке - Jira'},{key:'Visual Studio Code',ms:50*60000,category:'work',detail:'',top:''},{key:'Slack',ms:35*60000,category:'communication',detail:'своя категория',top:''},{key:'Zoom',ms:30*60000,category:'meetings',detail:'',top:''},{key:'<img src=x onerror=alert(1)>',ms:5*60000,category:'other',detail:'',top:''}]};
 const weekDays=[0,1,2,3,4].map(i=>({day:'',from:day.getTime()-(4-i)*86400000,by:{work:[5,6.5,4,7,3][i]*3600000,meetings:[1,0.5,2,0.8,1.2][i]*3600000,communication:[0.7,1,0.6,0.9,0.5][i]*3600000,other:[0.4,0.2,0.9,0.3,0.6][i]*3600000}}));
 const weekCard={...base,mode:'app',period:{kind:'week',label:'эта неделя',from:weekDays[0].from,to:day.getTime()+86400000},total:38*3600000,categories:dayCard.categories.map(c=>({...c,ms:c.ms*4.8})),timeline:[],meetings:[],focus:[],days:weekDays,
  app:{query:'Unity',label:'unity'},rows:[{key:'Bunker - Main - Windows, Mac, Linux - Unity 6000.0.3f1',ms:14*3600000,category:'work',detail:'',top:''},{key:'Bunker - Shop - Windows, Mac, Linux - Unity 6000.0.3f1',ms:5*3600000,category:'work',detail:'',top:''}]};
 const taskCard={...dayCard,mode:'task',worklog:true,rows:[{key:'BW-123',ms:95*60000,category:'work',url:'https://studio.atlassian.net/browse/BW-123',detail:'Google Chrome, Rider',top:'[BW-123] Магазин падает при покупке - Jira'},{key:'BW-77',ms:40*60000,category:'work',url:'https://studio.atlassian.net/browse/BW-77',detail:'Rider',top:'Bunker – BW-77 PlayerController.cs'}],untagged:5.8*3600000};
 // Feature calls of the card are stubbed in the main process: a worklog preview and the write of the ticked rows.
 const {ipcMain}=require('electron'),writes=[];
 const now=new Date(),today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name==='timeTracking'&&method==='worklogPreview')return {id:'p1',site:'https://studio.atlassian.net',rows:[{id:'BW-123|d',key:'BW-123',day:today,seconds:5700,title:'[BW-123] Магазин падает при покупке - Jira',done:false},{id:'BW-77|d',key:'BW-77',day:today,seconds:2400,title:'Bunker – BW-77 PlayerController.cs',done:false},{id:'BW-5|d',key:'BW-5',day:today,seconds:900,title:'',done:true}]};
  if(name==='timeTracking'&&method==='worklogWrite'){writes.push(args);return args[1].map(id=>({id,key:id.split('|')[0],ok:id!=='BW-77|d',error:id==='BW-77|d'?'Jira: нет прав на запись времени':''}));}
  return null;
 });
 const msg=(text,data)=>({role:'assistant',text,by:'Учёт времени',extensionData:{timeCard:data}});
 await js(`view('home');showDialogueMessages([{role:'user',text:'на что ушёл день'},${JSON.stringify(msg('Сегодня учтено 8 ч.',dayCard))},{role:'user',text:'сколько я сидел в Unity на этой неделе'},${JSON.stringify(msg('За эту неделю в «Unity» — 19 ч.',weekCard))},{role:'user',text:'запиши время в Jira'},${JSON.stringify(msg('Проверьте строки.',taskCard))}],'Учёт времени')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.time-card').length===3&&!!document.querySelector('.time-wl li')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.time-card').length"),3);
 assert.equal(await js("document.querySelectorAll('.time-card')[0].querySelectorAll('.time-seg').length"),4,'four categories in the bar');
 assert.equal(await js("document.querySelectorAll('.time-card')[0].querySelectorAll('.time-lane').length"),3,'meetings, focus, activity');
 assert.equal(await js("document.querySelectorAll('.time-card')[0].querySelectorAll('.time-lane-track.is-main .time-block').length"),10);
 assert.equal(await js("document.querySelectorAll('.time-card')[0].querySelectorAll('.time-block.is-meeting').length"),2);
 assert.equal(await js("document.querySelectorAll('.time-card img').length"),0,'app names are never HTML');
 assert.equal(await js("document.querySelectorAll('.time-card')[0].querySelectorAll('.time-cat').length"),6,'category chips for apps');
 assert.equal(await js("document.querySelectorAll('.time-card')[1].querySelectorAll('.time-day').length"),5,'week columns');
 assert.equal(await js("document.querySelectorAll('.time-card')[1].querySelectorAll('.time-cat').length"),0,'no category chips for one app');
 assert.equal(await js("document.querySelectorAll('.time-card')[2].querySelector('.time-name').getAttribute('href')"),'https://studio.atlassian.net/browse/BW-123');
 // The worklog preview: nothing written until «Записать»; the done row cannot be ticked; one row fails.
 assert.equal(writes.length,0);
 assert.equal(await js("document.querySelectorAll('.time-wl li').length"),3);
 assert.equal(await js("document.querySelector('.time-wl li:last-child input').disabled"),true);
 assert.match(await js("document.querySelector('.time-worklog button.primary').textContent"),/Записать в Jira: 2/);
 await require('./card-shot.cjs')(win,'.time-card','petya-time-tracking');
 await js("document.querySelector('.time-worklog button.primary').click()");
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.time-wl-state').length>=3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(writes,[['p1',['BW-123|d','BW-77|d']]],'only the ticked rows, once');
 assert.equal(await js("document.querySelectorAll('.time-wl-state.ok').length"),1);
 assert.equal(await js("document.querySelectorAll('.time-wl-state.bad').length"),1);
 await require('./card-shot.cjs')(win,'.time-card:has(.time-worklog:not([hidden]))','petya-time-tracking-written');
 console.log('Time tracking cards: category bar, day timeline with meetings and focus, week columns, tasks, confirmed worklog preview passed');
}};
require('../src/main.cjs');
