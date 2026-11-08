// «Подписки и продления» card in the real chat: totals per currency, services with the next charge, sparklines and
// actions, renewals with their remaining time, lapsed services folded; «Не подписка» hides a row (stubbed feature
// call) and «Напомнить» sends the request to the chat.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),hidden=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name==='subscriptionsApp'&&method==='hide'){hidden.push(args);return {ok:true};}
  return null;
 });
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const charges=(amounts,step=30)=>amounts.map((amount,i)=>({date:day(-(amounts.length-i)*step+3),amount,url:'https://mail.google.com/mail/u/#all/'+i}));
 const sv=(merchant,amount,currency,period,next,days,list,extra={})=>({key:merchant.toLowerCase(),merchant,item:'',platform:'',currency,amount,period,periodSource:'mail',next:day(next),days,monthly:period==='year'?Math.round(amount/12*100)/100:amount,status:'active',charges:list,url:'https://mail.google.com/mail/u/#all/x',evidence:{amount:'Сумма: '+amount},records:[],remind:'Напомни '+merchant,...extra});
 const card={mode:'all',now:Date.now(),today:day(0),reminders:true,status:{records:14,scanned:Date.now()-3600000,connected:1,model:true,encrypted:true},
  services:[sv('Yandex Cloud',1250,'RUB','month',3,3,charges([980,1100,1250,1250]),{periodSource:'history'}),sv('Spotify',10.99,'EUR','month',6,6,charges([9.99,10.99,10.99])),sv('Netflix',799,'RUB','month',30,30,charges([699,699,799,799,799,799])),
   sv('Apple One Individual',19.95,'USD','month',22,22,charges([19.95,19.95]),{platform:'Apple'}),sv('Unity',2040,'USD','year',36,36,charges([1800,2040],365)),sv('<img src=x onerror=alert(1)>',1,'USD','month',40,40,charges([1])),
   {...sv('Figma',15,'USD','month',0,null,charges([15,15],30)),status:'lapsed',next:'',days:null}],
  renewals:[{id:'r1',kind:'domain',name:'bunkerwars.ru',expires:day(5),days:5,merchant:'REG.RU',amount:990,currency:'RUB',url:'https://mail.google.com/mail/u/#all/r1'},{id:'r2',kind:'certificate',name:'api.bunkerwars.com',expires:day(41),days:41,merchant:'Monitor',url:''},{id:'r3',kind:'license',name:'Rider',expires:day(67),days:67,merchant:'JetBrains',url:''}],
  totals:[{currency:'RUB',monthly:2049,count:2,yearly:24588},{currency:'USD',monthly:190.95,count:3,yearly:2291.4},{currency:'EUR',monthly:10.99,count:1,yearly:131.88}],week:3};
 await js(`view('home');showDialogueMessages([{role:'user',text:'за что я плачу каждый месяц'},{role:'assistant',text:'Вы платите за 6 сервисов.',by:'Подписки и продления',extensionData:{subscriptionsCard:${JSON.stringify(card)}}}],'Подписки')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.subs-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.subs-tile').length"),4,'three currencies and the week');
 assert.equal(await js("document.querySelectorAll('.subs-body > .subs-list:not(.renewals) > .subs-row').length"),6);
 assert.equal(await js("document.querySelectorAll('.subs-row.is-soon').length"),2,'within a week');
 assert.equal(await js("document.querySelectorAll('.subs-spark circle').length"),4+3+6+2+2+1+2);
 assert.equal(await js("document.querySelectorAll('.subs-renewal').length"),3);
 assert.equal(await js("document.querySelectorAll('.subs-renewal.is-soon').length"),1);
 assert.equal(await js("document.querySelectorAll('.subs-more .subs-row.is-lapsed').length"),1,'lapsed folded');
 assert.equal(await js("document.querySelectorAll('.subs-card img').length"),0,'merchant names are never HTML');
 assert.equal(await js("document.querySelectorAll('.subs-row .subs-tool').length")>=12,true);
 await require('./card-shot.cjs')(win,'.subs-card','petya-subscriptions');
 // «Не подписка» hides the row through the feature call.
 await js("[...document.querySelectorAll('.subs-row')].find(r=>r.querySelector('b').textContent==='Yandex Cloud').querySelector('[data-tool=hide]').click()");
 for(let i=0;i<60&&!hidden.length;i++)await new Promise(r=>setTimeout(r,30));
 assert.deepEqual(hidden,[['Yandex Cloud']]);
 for(let i=0;i<60;i++){if(await js("document.querySelectorAll('.subs-body > .subs-list:not(.renewals) > .subs-row').length===5"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.subs-body > .subs-list:not(.renewals) > .subs-row').length"),5);
 console.log('Subscriptions card: totals, services with next charge and sparklines, renewals, lapsed folded, hide passed');
}};
require('../src/main.cjs');
