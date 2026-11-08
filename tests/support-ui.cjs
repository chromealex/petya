// «Поддержка игроков» cards in the real chat: tiles, tickets per day stacked by status, problems with quotes and
// «Создать баг», open tickets with priority chips and the wait against the SLA; the reply card with the thread,
// knowledge base, the removed-promise note and the editor that sends exactly its text.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),sent=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:[];
  if(name==='supportDesk'&&method==='send'){sent.push(args);return {url:'https://mystudio.zendesk.com/agent/tickets/1201',text:'Ответ отправлен в тикет #1201.'};}
  throw Error('unexpected '+name+'.'+method);
 });
 const day=i=>new Date(Date.UTC(2026,10,3+i)).toISOString().slice(0,10);
 const per=[[2,1,1,0,6],[1,2,0,0,9],[3,1,2,1,7],[2,3,1,0,5],[4,2,1,0,4],[5,4,2,1,2],[6,3,0,0,1]];
 const U='https://mystudio.zendesk.com/agent/tickets/';
 const t=(id,subject,status,priority,wait,slaLeft,extra={})=>({id:String(id),subject,text:'',status,priority,created:'2026-11-0'+(Math.max(1,9-Math.round(wait/24)))+'T08:00:00Z',updated:'2026-11-09T08:00:00Z',requester:'Игрок '+id,tags:[],url:U+id,sla:null,source:'zendesk',wait,slaLeft,overdue:slaLeft!==null&&slaLeft<0,...extra});
 const overview={id:'o1',mode:'overview',sources:[{id:'zendesk',name:'Zendesk'}],days:7,topic:null,slaHours:24,tiles:{open:38,overdue:5,today:9,urgent:4},
  daily:per.map(([n,o,p,h,s],i)=>({date:day(i),new:n,open:o,pending:p,hold:h,solved:s})),
  clusters:[{title:'Деньги списали, покупка не пришла',count:14,quotes:[{text:'деньги списали, а кристаллы не пришли',ticket:'1201'},{text:'Списали деньги два раза за одну покупку',ticket:'1202'}],tickets:['1201','1202']},
   {title:'Вылет на загрузке после 4.13',count:9,quotes:[{text:'Игра вылетает на загрузке после обновления 4.13 <img src=x onerror=alert(1)>',ticket:'1203'}],tickets:['1203']},
   {title:'Не могу войти после смены телефона',count:6,quotes:[],tickets:['1204']}],clustersByModel:true,
  tickets:[t(1201,'Не пришли кристаллы за 499 ₽','new','urgent',30,-6),t(1202,'Списали дважды','open','high',5,-1),t(1203,'Вылет на загрузке после обновления','open','normal',3,6),t(1205,'Где ввести промокод','new','low',20,2.5),t(1204,'Не могу войти в аккаунт','pending','normal',20,null),t(1206,'Читер в рейтинге','open','normal',1,23)],
  more:32,created:61,notes:[],model:true,at:Date.now()};
 const reply={id:'r1',mode:'reply',sources:[{id:'zendesk',name:'Zendesk'}],source:'zendesk',
  ticket:{...t(1201,'Не пришли кристаллы за 499 ₽','new','urgent',30,-6),text:'Оплатил пакет кристаллов за 499 рублей, деньги списали, а кристаллы не пришли.'},
  thread:[{id:'1',author:'Игрок 1201',agent:false,public:true,text:'Оплатил пакет кристаллов за 499 рублей, деньги списали, а кристаллы не пришли. Номер заказа GPA.3312-4410-2231.',created:'2026-11-08T02:00:00Z'},{id:'2',author:'Оля',agent:true,public:false,text:'Проверить транзакцию в биллинге',created:'2026-11-08T03:00:00Z'}],
  articles:[{title:'Покупка не пришла: что делать',url:'https://mystudio.zendesk.com/hc/ru/articles/360001',snippet:'Если покупка не пришла, перезапустите игру и проверьте, что вошли в тот же аккаунт.'}],
  draft:'Здравствуйте! Спасибо, что написали. Пожалуйста, перезапустите игру — обычно покупка приходит после этого.\n\nПодробнее: https://mystudio.zendesk.com/hc/ru/articles/360001',
  removed:['Мы вернём вам деньги в течение суток.'],refundAllowed:false,macros:12,model:true,notes:[],sent:null,at:Date.now()};
 await js(`view('home');showDialogueMessages([{role:'user',text:'что жалуются в поддержку'},{role:'assistant',text:'Поддержка игроков: открыто 38.',by:'Поддержка игроков',extensionData:{supportCard:${JSON.stringify(overview)}}},{role:'assistant',text:'Тикет #1201.',by:'Поддержка игроков',extensionData:{supportCard:${JSON.stringify(reply)}}}],'Поддержка')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.support-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.support-card').length"),2);
 const first="document.querySelector('.support-card')";
 assert.deepEqual(await js(first+".querySelectorAll('.sp-tile .sp-value').length"),4);
 assert.equal(await js(first+".querySelector('.sp-tile.alert .sp-value').textContent"),'5');
 assert.equal(await js(first+".querySelectorAll('.sp-col').length"),7);
 assert.equal(await js(first+".querySelectorAll('.sp-col')[5].querySelectorAll('.sp-seg').length"),5,'a day is stacked by status');
 assert.equal(await js(first+".querySelectorAll('.sp-cluster').length"),3);
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'ticket text is never HTML');
 assert.equal(await js(first+".querySelectorAll('.sp-ticket.overdue').length"),2);
 assert.equal(await js(first+".querySelector('.sp-ticket .kit-chip.tone-alert').textContent"),'срочный');
 assert.match(await js(first+".querySelector('.sp-ticket .sp-wait-text').textContent"),/просрочен на 6 часов/);
 for(let i=0;i<50;i++){if(await js(first+".querySelector('.sp-cluster .kit-link')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(first+".querySelector('.sp-cluster .kit-link').textContent"),'Создать баг · Jira');
 assert.equal(await js(first+".querySelectorAll('.sp-cluster-title[data-no-i18n],.sp-subject[data-no-i18n]').length"),await js(first+".querySelectorAll('.sp-cluster-title,.sp-subject').length"));
 // The reply card: the editor holds exactly the draft; the removed promise is shown.
 const second="document.querySelectorAll('.support-card')[1]";
 assert.equal(await js(second+".querySelector('.sp-editor textarea').value"),reply.draft);
 assert.match(await js(second+".querySelector('.sp-warning').textContent"),/вернём вам деньги/);
 assert.equal(await js(second+".querySelectorAll('.sp-msg').length"),2);
 assert.equal(await js(second+".querySelectorAll('.sp-msg.internal').length"),1);
 await require('./card-shot.cjs')(win,'.support-card','petya-support');
 for(const [part,selector] of [['list',".support-card .sp-list"],['reply',".support-card:nth-of-type(2)"]]){
  await js(`(()=>{const box=document.getElementById('card-shot'),n=document.querySelectorAll(${JSON.stringify(selector)})[0];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()`);
  win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-support-'+part+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js(`(()=>{const a=document.querySelectorAll('.support-card')[1].querySelector('.sp-editor textarea');a.value=a.value.replace('Здравствуйте!','Здравствуйте, Игрок!');a.dispatchEvent(new Event('input'));a.closest('.sp-editor').querySelector('.primary').click();})()`);
 for(let i=0;i<50;i++){if(sent.length===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[0],[{card:'r1',source:'zendesk',id:'1201'},reply.draft.replace('Здравствуйте!','Здравствуйте, Игрок!')]);
 assert.equal(await js(second+".querySelector('.sp-editor')"),null,'the editor is replaced by the sent text');
 assert.match(await js(second+".querySelector('.sp-sent').textContent"),/Отправлено игроку/);
 assert.equal(await js(second+".querySelector('.kit-card-head .kit-chip').textContent"),'ответ отправлен');
 console.log('Support cards: tiles, per-day by status, problems with quotes and «Создать баг», tickets with priority and SLA wait, reply card with thread, KB, removed promise and exact-text send passed');
}};
require('../src/main.cjs');
