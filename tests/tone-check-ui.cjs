// «Проверка тона» in the real window: a Discord send confirmation reviewed by the real outgoing pipeline with the
// real tone check (no model): findings under the text, «Заменить на …» puts a suggestion into the field with
// «Вернуть», the review follows edits, «Отправить» stays enabled and sends exactly the field; and the chat card
// «как это звучит» with marked fragments, the calm ↔ harsh scale, a suggestion applied and the softer variant.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,what)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}assert.fail('timeout: '+what);};
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),sent=[],reviews=[];
 const pipe=require('../src/features/outgoing.cjs').create({settings:{'extension_tone-check':'true',model:''}});
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='outgoing'&&method==='review'){reviews.push(args[0]);return pipe.review(args[0]);}
  if(name==='appLinks'&&method==='available')return args[0]==='share-message'?[{id:'slack',name:'Slack',label:'Отправить в Slack'}]:[];
  if(name==='discordApp'&&method==='send'){sent.push(args);return {id:'900000000000000099',url:'https://discord.com/channels/1/2/900000000000000099',text:'Отправлено в Discord.'};}
  throw Error('unexpected '+name+'.'+method);
 });
 const compose={id:'m1',guild:'900000000000000001',guildName:'Bunker Wars',channel:{id:'12',name:'announcements'},text:'ВНИМАНИЕ ВСЕМ: как я уже писал, сервер перезапустится в 18:00!!! Иначе будут откаты прогресса.',limit:2000,replyTo:null,sent:null};
 const card={mode:'check',text:'Как я уже писал, ревью нужно до пятницы. КТО ОПЯТЬ СЛОМАЛ БИЛД?! Если до вечера не почините, будем откатывать.',audience:'public',language:'ru',sensitivity:'medium',model:true,
  findings:[
   {kind:'passive',severity:'warning',span:{start:0,end:17,text:'Как я уже писал'},message:'«Как я уже писал / говорил» звучит как упрёк.',suggestion:'Напомню'},
   {kind:'caps',severity:'problem',span:{start:41,end:62,text:'КТО ОПЯТЬ СЛОМАЛ БИЛД'},message:'Заглавные буквы читаются как крик.',suggestion:'Кто опять сломал билд'},
   {kind:'punctuation',severity:'info',span:{start:62,end:64,text:'?!'},message:'Несколько «!» или «?» подряд усиливают напор.',suggestion:'?'},
   {kind:'ultimatum',severity:'problem',span:{start:65,end:113,text:'Если до вечера не почините, будем откатывать'},message:'Условие с последствиями звучит как ультиматум: лучше объяснить, почему важен срок.',suggestion:'Если до вечера не получится починить, придётся откатить релиз'}],
  rewrite:'Напомню: ревью нужно до пятницы. Билд снова сломан — кто может посмотреть? Если до вечера не получится починить, придётся откатить релиз.'};
 // The spans in the fixture are placed on the real words.
 for(const f of card.findings){f.span.start=card.text.indexOf(f.span.text);f.span.end=f.span.start+f.span.text.length;}
 const clean={...card,text:'Привет! Посмотри, пожалуйста, тред про релиз, когда будет минутка.',findings:[],rewrite:'',audience:'team'};
 await js(`view('home');showDialogueMessages([{role:'user',text:'отправь в дискорд в announcements'},{role:'assistant',text:'Сообщение готово.',by:'Discord',extensionData:{discordCompose:${JSON.stringify(compose)}}},{role:'user',text:'как это звучит'},{role:'assistant',text:'Может прозвучать резко.',by:'Проверка тона',extensionData:{toneCard:${JSON.stringify(card)}}},{role:'assistant',text:'Звучит спокойно и понятно — замечаний нет.',by:'Проверка тона',extensionData:{toneCard:${JSON.stringify(clean)}}}],'Тон')`);
 await wait("document.querySelectorAll('.tone-card').length===2&&!!document.querySelector('.discord-compose')",'cards');

 // --- Discord confirmation with the review ---
 const box="document.querySelector('.discord-compose .kit-review')";
 await wait(box+"&&!"+box+".hidden&&"+box+".querySelectorAll('.kit-review-item').length>0",'review findings');
 assert.deepEqual(reviews[0].channel,{service:'discord',target:'#announcements',audience:'public'});
 const items=await js("[...document.querySelectorAll('.discord-compose .kit-review-item')].map(n=>[n.dataset.severity,n.querySelector('q')?.textContent||'',!!n.querySelector('.kit-review-apply')])");
 assert.deepEqual(items,[['warning','ВНИМАНИЕ ВСЕМ',true],['warning','как я уже писал',true],['info','!!!',true],['problem','Иначе будут',false]]);
 assert.equal(await js("document.querySelector('.discord-compose button.primary').disabled"),false,'sending is never blocked by findings');
 // Apply «ВНИМАНИЕ ВСЕМ» → «Внимание всем»: the field changes visibly, «Вернуть» appears, the review follows.
 await js("document.querySelector('.discord-compose .kit-review-apply').click()");
 const area="document.querySelector('.discord-compose textarea')";
 assert.equal(await js(area+'.value'),'Внимание всем: как я уже писал, сервер перезапустится в 18:00!!! Иначе будут откаты прогресса.');
 await wait(box+".querySelectorAll('.kit-review-item').length===3",'re-review after apply');
 assert.equal(await js(box+".querySelector('.kit-review-done').textContent.includes('Заменено:')"),true);
 assert.equal(await js(box+".querySelector('.kit-review-undo').disabled"),false);
 assert.equal(await js("document.querySelector('.discord-compose .kit-counter, .discord-compose .dc-counter').textContent.startsWith('9')"),true,'the editor counter follows the applied text');
 const shot1=await require('./card-shot.cjs')(win,'.discord-compose','petya-tone-check-discord');
 // «Вернуть» restores; applying again and editing by hand keeps everything in the field, nothing is changed silently.
 await js("document.querySelector('#card-shot .kit-review-undo').click()");
 assert.equal(await js("document.querySelector('#card-shot textarea').value"),compose.text);
 await js("document.querySelector('#card-shot .kit-review-apply').click()");
 await js("(()=>{const a=document.querySelector('#card-shot textarea');a.value=a.value.replace('!!!','.');a.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await wait("document.querySelector('#card-shot .kit-review').querySelectorAll('.kit-review-item').length===2",'review after a manual edit');
 const final=await js("document.querySelector('#card-shot textarea').value");
 await js("document.querySelector('#card-shot .discord-compose button.primary').click()");
 await wait("!!document.querySelector('#card-shot .dc-sent')",'sent');
 assert.equal(sent.length,1);assert.equal(sent[0][1],final,'exactly the field is sent, with the findings left as they are');
 await js("document.getElementById('card-shot').remove()");

 // --- The chat card ---
 const tone="document.querySelector('.tone-card')";
 assert.equal(await js(tone+".querySelectorAll('.tc-mark').length"),4);
 assert.equal(await js(tone+".querySelector('.tc-mark[data-severity=problem]').firstChild.textContent"),'КТО ОПЯТЬ СЛОМАЛ БИЛД');
 assert.equal(await js(tone+".querySelector('.kit-chip').textContent"),'Замечаний: 4');
 assert.ok(Number.parseFloat(await js(tone+".querySelector('.tc-scale-marker').style.left"))>=99,'harsh end of the scale');
 assert.equal(await js(tone+".querySelectorAll('.tc-text img,.tc-text script').length"),0);
 await js(tone+".querySelectorAll('.tc-apply')[1].click()");
 assert.equal(await js(tone+".querySelector('.tc-text').textContent.includes('Кто опять сломал билд')"),true);
 assert.equal(await js(tone+".querySelectorAll('.tc-item.done').length"),1);
 // Later spans moved with the text: the ultimatum is still marked at the right words.
 assert.equal(await js("[..."+tone+".querySelectorAll('.tc-mark')].map(m=>m.firstChild.textContent).join('|')"),'Как я уже писал|?!|Если до вечера не почините, будем откатывать');
 assert.equal(await js(tone+".querySelector('.tc-rewrite-text').textContent"),card.rewrite);
 assert.equal(await js("[..."+tone+".querySelectorAll('.kit-actions button')].map(b=>b.textContent).join('|')"),'Скопировать|Отправить в Slack|Проверить снова');
 assert.equal(await js("document.querySelectorAll('.tone-card')[1].querySelector('.tc-ok')!==null"),true);
 const shot2=await require('./card-shot.cjs')(win,'.tone-card','petya-tone-check-card');
 console.log('Tone check UI: Discord confirmation reviewed with findings, applied suggestion with «Вернуть», follows edits, sends exactly the field; chat card with marks, scale, applied fix and softer variant passed ('+shot1+', '+shot2+')');
}};
require('../src/main.cjs');
