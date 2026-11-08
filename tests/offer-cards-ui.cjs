// Offer cards in the chat: a direct offer, a quiet one under an answer, a tie with two buttons; «Подключить»
// adds the extension and sends the saved request again; «Не предлагать» mutes. Screenshot for a visual check.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async code=>{for(let i=0;i<120;i++){if(await js(code))return;await sleep(60);}throw Error('Timeout '+code);};
 await js('window.chatNavigationReady');
 // Offers are created by the main process; the renderer only shows them and calls accept/dismiss.
 const direct={items:[{id:'o1',ext:'regex-cron',name:'Регулярки и cron',pitch:'объясню и проверю регулярку на ваших строках, составлю cron и покажу ближайшие запуски',connect:'install'}],direct:true};
 const quiet={items:[{id:'o2',ext:'regex-cron',name:'Регулярки и cron',pitch:'объясню и проверю регулярку',connect:'install'}],direct:false};
 const tie={items:[{id:'o3',ext:'crashes',name:'Крэши',pitch:'топ крэшей из Sentry с графиком',connect:'settings'},{id:'o4',ext:'store-reviews',name:'Отзывы в сторах',pitch:'отзывы App Store и Google Play',connect:'settings'}],direct:true};
 await js(`view('home');showDialogueMessages([{role:'user',text:'объясни регулярку /^a+$/'},{role:'assistant',text:'Для этого нужно расширение.',by:'расширения',extensionData:{extensionOffer:${JSON.stringify(direct)}}},{role:'user',text:'у нас странный крон'},{role:'assistant',text:'Расскажите подробнее, что в нём странного.',extensionData:{extensionOffer:${JSON.stringify(quiet)}}},{role:'assistant',text:'Это может сделать одно из расширений.',by:'расширения',extensionData:{extensionOffer:${JSON.stringify(tie)}}}],'Предложения')`);
 await wait("document.querySelectorAll('.offer-card').length===3");
 assert.equal(await js("document.querySelectorAll('.offer-card.quiet').length"),1);
 assert.deepEqual(await js("[...document.querySelectorAll('.offer-card')[2].querySelectorAll('.kit-actions button')].map(b=>b.textContent)"),['Подключить «Крэши»','Подключить «Отзывы в сторах»','Не сейчас','Не предлагать']);
 await require('./card-shot.cjs')(win,'.offer-card','petya-offer-cards',{width:640});
 await js("document.getElementById('card-shot').remove()");
 // The real path: a direct request without the extension → the offer from the main process → «Подключить»
 // adds it and sends the saved request again → the regex card answers it.
 await js("view('home');$('command').value='проверь регулярку /^a+$/ на строках: «aaa», «ab»';window.sendChatNow();true");
 try{await wait("[...document.querySelectorAll('.dialogue-messages .offer-card')].some(c=>c.textContent.includes('Регулярки и cron'))");}
 catch(e){console.log('DEBUG',await js("document.querySelector('.dialogue-messages').innerText.slice(-600)"),await js("document.getElementById('notice')?.textContent||''"));throw e;}
 await js("[...document.querySelectorAll('.dialogue-messages .offer-card')].at(-1).querySelector('.kit-actions .primary').click();true");
 await wait("!!document.querySelector('.dialogue-messages .regex-card')");
 assert.equal(await js("document.querySelector('.dialogue-messages .regex-card .regex-lines mark').textContent"),'aaa');
 const catalog=await js("window.petya.feature('extensionUI','catalog')");
 assert.equal(catalog.find(e=>e.id==='regex-cron').installed,true,'accepting adds the extension');
 // Added now: the same kind of request goes straight to the app, no second offer.
 await js("$('command').value='проверь регулярку /b/ на строках: «b»';window.sendChatNow();true");
 await wait("document.querySelectorAll('.dialogue-messages .regex-card').length===2");
 assert.equal(await js("document.querySelectorAll('.dialogue-messages .offer-card').length"),1);
 console.log('Offer cards: direct/quiet/tie rendering, live offer → add → saved request answered by the app, no repeat offer passed');
}};
require('../src/main.cjs');
