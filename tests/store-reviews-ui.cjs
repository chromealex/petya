// «Отзывы в сторах» card in the real chat: average with change, distribution bars, stacked timeline by rating,
// complaint themes with quotes, reviews with the «ответ отправлен» chip, the reply editor and a model-free card.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const day=i=>new Date(Date.UTC(2026,10,2+i)).toISOString().slice(0,10);
 const counts=[[1,0,1,2,6],[0,1,0,3,5],[2,1,1,2,4],[0,0,1,4,7],[3,2,1,1,3],[5,3,1,2,2],[4,2,2,1,3],[2,1,0,1,2]];
 const review=(id,store,rating,title,text,extra={})=>({id,store,app:store==='play'?'com.studio.bunker':'1234567890',rating,title,text,author:'Игрок '+id,date:'2026-11-0'+(8-Number(id.slice(1))%7)+'T10:2'+(id.length)+':00.000Z',territory:store==='appstore'?'USA':'',language:store==='play'?'ru':'',version:'4.13',versionCode:store==='play'?413:null,reply:null,limit:store==='play'?350:5970,...extra});
 const card={app:'Bunker Wars',stores:['appstore','play'],apps:{appstore:'1234567890',play:'com.studio.bunker'},days:7,from:day(0),to:day(7),focus:{bad:false,update:false,reply:false},version:null,territory:null,
  summary:{count:96,average:3.42,distribution:{1:17,2:10,3:7,4:16,5:46},previous:{count:61,average:3.96},delta:-0.54,compared:['appstore']},
  timeline:counts.map((c,i)=>({date:day(i),counts:c})),
  clusters:[{title:'Вылеты после обновления 4.13',count:14,quotes:[{text:'Игра вылетает на загрузке после обновления',review:'p1'},{text:'crashes after the update on iPhone 12',review:'a1'}]},{title:'Слишком много рекламы',count:8,quotes:[{text:'Слишком много рекламы, каждые 30 секунд',review:'p5'}]},{title:'Долгий матчмейкинг',count:3,quotes:[]}],
  reviews:[
   review('p1','play',1,'Вылетает после обновления','Игра вылетает на загрузке после обновления, Samsung A52. Переустанавливал два раза, чистил кэш, всё равно вылетает на 87% загрузки. До обновления всё работало отлично, играю с первого сезона. Верните, пожалуйста, как было, или скажите, когда исправите — клан ждёт войну.'),
   review('a1','appstore',2,'Crashes','The game crashes after the update on iPhone 12. <img src=x onerror=alert(1)>'),
   review('p5','play',1,'','Слишком много рекламы, каждые 30 секунд'),
   review('a3','appstore',3,'Ads','Too many ads between battles',{territory:'DEU',reply:{text:'Thanks, fewer ads soon!',state:'published',date:'2026-11-05T12:00:00.000Z'}}),
   review('p3','play',5,'','Отличная игра, играю каждый день',{reply:{text:'Спасибо!',state:'published',sentByPetya:true}}),
   review('p6','play',4,'','Нормально, но баланс танков странный')
  ],more:0,notes:['Google Play: только отзывы с текстом за последние 7 дней (ограничение API).'],model:true,at:Date.now()};
 const plain={...card,app:'Metro Wars',stores:['play'],apps:{play:'com.studio.metro'},clusters:null,model:false,summary:{count:5,average:4.2,distribution:{1:0,2:1,3:0,4:1,5:3},previous:null,delta:null,compared:null},timeline:counts.slice(0,8).map((c,i)=>({date:day(i),counts:i%3?[0,0,0,0,1]:[0,0,0,0,0]})),reviews:[review('p9','play',2,'','Лагает на старых телефонах')]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'что пишут в отзывах'},{role:'assistant',text:'Bunker Wars · 7 дней: 96 отзывов.',by:'Отзывы в сторах',extensionData:{storeReviews:${JSON.stringify(card)}}},{role:'assistant',text:'Metro Wars в Google Play.',by:'Отзывы в сторах',extensionData:{storeReviews:${JSON.stringify(plain)}}}],'Отзывы')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.reviews-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.reviews-card').length"),2);
 const first="document.querySelector('.reviews-card')";
 assert.equal(await js(first+".querySelector('.rv-average').textContent"),'3,42');
 assert.match(await js(first+".querySelector('.rv-delta').textContent"),/▼ −0,54/);
 assert.equal(await js(first+".querySelectorAll('.rv-dist-row').length"),5);
 assert.equal(await js(first+".querySelectorAll('.rv-col').length"),8);
 assert.equal(await js(first+".querySelectorAll('.rv-col')[5].querySelectorAll('.rv-seg').length"),5,'a day is stacked by rating');
 assert.equal(await js(first+".querySelectorAll('.rv-cluster').length"),3);
 assert.equal(await js(first+".querySelector('.rv-quote').textContent"),'«Игра вылетает на загрузке после обновления»');
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'review text is never HTML');
 assert.equal(await js(first+".querySelectorAll('.rv-text[data-no-i18n],.rv-title[data-no-i18n],.rv-quote[data-no-i18n],.rv-cluster-title[data-no-i18n]').length"),await js(first+".querySelectorAll('.rv-text,.rv-title,.rv-quote,.rv-cluster-title').length"),'review, quote and theme texts are not auto-translated');
 assert.equal(await js(first+".querySelectorAll('.rv-replied').length"),2,'«ответ отправлен» chips');
 assert.equal(await js(first+".querySelector('.rv-text').classList.contains('clamped')"),true,'long text collapsed');
 assert.equal(await js(first+".querySelector('.kit-chip.tone-alert').textContent"),'3,42★ −0,54','status: the drop is an alert');
 // The model-free card: numbers and reviews, no themes, «Написать ответ» opens an empty editor.
 const second="document.querySelectorAll('.reviews-card')[1]";
 assert.match(await js(second+".querySelector('.rv-clusters').textContent"),/локальная модель/);
 assert.equal(await js(second+".querySelector('.rv-item-actions button').textContent"),'Написать ответ');
 await js(second+".querySelector('.rv-item-actions button').click()");
 assert.equal(await js(second+".querySelector('.rv-editor textarea').value"),'');
 assert.equal(await js(second+".querySelector('.rv-editor .primary').disabled"),true,'empty reply cannot be sent');
 // Draft in the first card (the feature IPC stubbed in the main process): the editor shows exactly the draft,
 // send passes the edited text.
 const {ipcMain}=require('electron'),sent=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{if(name!=='storeReviews')throw Error('x');if(method==='draft')return {text:'Спасибо, что написали! Вылет исправлен в 4.13.1 — обновите игру.',limit:350};if(method==='send'){sent.push(args);return {reply:{text:args[1],state:'published'},text:'Ответ опубликован в Google Play.'};}});
 await js(first+".querySelector('.rv-item-actions button').click()");
 for(let i=0;i<50;i++){if(await js(first+".querySelector('.rv-editor')!==null"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(first+".querySelector('.rv-editor textarea').value"),'Спасибо, что написали! Вылет исправлен в 4.13.1 — обновите игру.');
 assert.match(await js(first+".querySelector('.rv-counter').textContent"),/^\d+ \/ 350$/);
 await require('./card-shot.cjs')(win,'.reviews-card','petya-store-reviews');
 // The cards are taller than the window: also capture the reviews with the open editor and the model-free card.
 for(const [part,selector] of [['reviews',".reviews-card .rv-list"],['plain',".reviews-card:nth-of-type(2)"]]){
  await js(`(()=>{const box=document.getElementById('card-shot'),n=document.querySelectorAll(${JSON.stringify(selector)})[0];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()`);
  win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-store-reviews-'+part+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js(`(()=>{const a=document.querySelector('.reviews-card .rv-editor textarea');a.value+=' Хорошей игры!';a.dispatchEvent(new Event('input'));a.closest('.rv-editor').querySelector('.primary').click();})()`);
 for(let i=0;i<50;i++){if(sent.length===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(sent[0],[{store:'play',app:'com.studio.bunker',id:'p1'},'Спасибо, что написали! Вылет исправлен в 4.13.1 — обновите игру. Хорошей игры!']);
 assert.equal(await js("document.querySelector('.reviews-card .rv-item .rv-replied')?.textContent"),'ответ отправлен');
 assert.equal(await js("document.querySelector('.reviews-card .rv-item').querySelector('.rv-editor')===null"),true,'editor closes after sending');
 console.log('Store reviews card: average/change, distribution, stacked timeline, themes with quotes, safe text, reply chips, editor with exact text, model-free card passed');
}};
require('../src/main.cjs');
