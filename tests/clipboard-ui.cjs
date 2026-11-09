// «История буфера» in the real window: the settings card (off by default, the switch through the app), the search
// card with a week of copies as bars, numbered rows with the searched words marked and a picture preview, «В буфер»
// putting a row back on the clipboard, the link → BW-12 confirmation whose tracker button writes the comment only
// when pressed (provider stubbed), and «Стереть всё» asking first. Copied text never becomes HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+(label||test));};
 await js('window.chatNavigationReady');
 win.setContentSize(1180,1400);
 const electron=require('electron');
 const app=require('../src/extensions/clipboard/feature.cjs');
 // 1. Settings: added from the catalog, history still off.
 await js("window.extensionHost.open('clipboard',{stay:true})");
 await wait("!!document.querySelector('[data-extension=\"clipboard\"] [role=status]')?.textContent",'settings card');
 assert.match(await js("document.querySelector('[data-extension=\"clipboard\"] [role=status]').textContent"),/^История выключена · записей: 0/);
 assert.equal(await js("document.querySelector('[data-extension=\"clipboard\"] input[type=checkbox]').checked"),false,'off by default');
 await js("(()=>{const c=document.querySelector('[data-extension=\"clipboard\"] input[type=checkbox]');c.click();})()");
 await wait("/История включена/.test(document.querySelector('[data-extension=\"clipboard\"] [role=status]').textContent)",'switched on');
 // 2. A week of copies (times spread over the days), a picture among them.
 const st=app.state.store;assert.ok(st,'the store is open');
 const DAY=86400000,now=Date.now();
 const pic=await js(`(()=>{const c=document.createElement('canvas');c.width=192;c.height=96;const g=c.getContext('2d');g.fillStyle='#1e2a33';g.fillRect(0,0,192,96);g.fillStyle='#e5ce8c';g.fillRect(10,10,120,14);g.fillStyle='#86a8e0';g.fillRect(10,34,172,50);return c.toDataURL('image/jpeg',0.8);})()`);
 const add=(text,app_,ago)=>{const i=st.add({kind:'text',text,app:app_});i.at=now-ago;return i;};
 add('Где взять API ключ для AppMetrica: Настройки приложения → API ключ (только чтение)','Safari',5.6*DAY);
 add('git checkout -b feature/inventory-fix','Terminal',4.2*DAY);
 add('https://acme.atlassian.net/wiki/spaces/BW/pages/42/Release+checklist','Safari',3.1*DAY);
 add('<img src=x onerror=alert(1)> SELECT count(*) FROM purchases','DataGrip',2.2*DAY);
 const image=st.add({kind:'image',png:Buffer.from(pic.split(',')[1],'base64'),width:2880,height:1440,thumb:pic,app:'Unity'});image.at=now-1.3*DAY;
 add('Ключи API для стейджинга ротируются раз в месяц — см. раздел «Доступы»','Slack',0.9*DAY);
 add('https://github.com/acme/bunker-wars/pull/381','Safari',0.2*DAY);
 add('Inventory не открывается после покупки сундука','Telegram',0.05*DAY);
 const search=await js("window.petya.feature('clipboard','list','API ключ')");
 assert.deepEqual(search.items.map(i=>i.text?.slice(0,12)),['Ключи API дл','Где взять AP']);
 const all=await js("window.petya.feature('clipboard','list','')");
 const link={...all,mode:'link',status:all.status,items:[all.items.find(i=>i.link)],link:{issue:'BW-12',url:'https://github.com/acme/bunker-wars/pull/381',id:all.items.find(i=>i.link).id,n:1}};
 const paste={...all,mode:'paste',items:all.items.slice(0,4),pasted:{id:all.items[2].id,n:3,previous:all.items[0].id}};
 paste.items=[all.items[2],...all.items.filter(i=>i!==all.items[2])].slice(0,4);
 // The tracker: Jira connected; its provider is stubbed so the press is recorded instead of sent.
 const jira=require('../src/extensions/jira/task-tracker.cjs');const calls=[];
 jira.run=async(services,payload,check)=>{check();calls.push(payload);return {done:true,key:payload.issue,url:'https://acme.atlassian.net/browse/'+payload.issue,text:'Комментарий добавлен в '+payload.issue+'.'};};
 await js("window.petya.saveSettings({module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token'})");
 await js("view('home');window.resultKit.availableLinks.clear()");
 const msg=(text,d)=>({role:'assistant',text,by:'История буфера',extensionData:{clipboardHistory:d}});
 await js(`showDialogueMessages([{role:'user',text:'что я копировал про API ключ'},${JSON.stringify(msg('Нашёл в истории буфера про «API ключ»: 2 записи.',search))},{role:'user',text:'история буфера'},${JSON.stringify(msg('В истории буфера 8 записей.',all))},{role:'user',text:'скопируй последнюю ссылку из буфера в Jira задачу BW-12'},${JSON.stringify(msg('Добавить ссылку в BW-12 комментарием?',link))},{role:'user',text:'вставь третье скопированное'},${JSON.stringify(msg('Положил в буфер №3.',paste))}],'Буфер')`);
 await wait("document.querySelectorAll('.clip-card').length===4",'cards');
 await js("document.querySelectorAll('.onb').forEach(n=>n.style.display='none')");
 const card=n=>`document.querySelectorAll('.clip-card')[${n}]`;
 assert.ok((await js(`[...${card(0)}.querySelectorAll('.clip-text mark')].map(m=>m.textContent.toLowerCase())`)).every(t=>/^(?:api|ключ)$/.test(t)),'only the searched words are marked');
 assert.equal(await js(`${card(0)}.querySelectorAll('.clip-day').length`),7);
 assert.equal(await js(`${card(0)}.querySelector('.kit-key').textContent`),'«API ключ»');
 assert.equal(await js(`${card(1)}.querySelectorAll('.clip-item').length`),8);
 assert.deepEqual(await js(`[...${card(1)}.querySelectorAll('.clip-n')].map(n=>n.textContent)`),['#1','#2','#3','#4','#5','#6','#7','#8']);
 assert.equal(await js(`${card(1)}.querySelectorAll('img[src=x], img[onerror]').length`),0,'copied text never becomes HTML');
 assert.ok(await js(`${card(1)}.querySelector('.clip-pic img').src.startsWith('data:image/jpeg')`),'picture preview');
 await require('./card-shot.cjs')(win,'.clip-card:nth-of-type(1)','petya-clipboard-search');
 // «В буфер» on a row puts it back on the system clipboard.
 electron.clipboard.writeText('что-то другое');
 await js(`${card(1)}.querySelectorAll('.clip-copy')[1].click()`);
 await wait("!!document.querySelector('.kit-toast')",'toast');
 assert.equal(electron.clipboard.readText(),all.items[1].text);
 // The link confirmation: exact link and issue; the comment is written only on the press.
 await wait(`!!${card(2)}.querySelector('.kit-link')`,'tracker button');
 assert.equal(await js(`${card(2)}.querySelector('.kit-link').textContent`),'Добавить в BW-12 · Jira');
 assert.equal(await js(`${card(2)}.querySelector('.clip-url').textContent`),'https://github.com/acme/bunker-wars/pull/381');
 assert.equal(calls.length,0,'nothing sent before the press');
 await require('./card-shot.cjs')(win,'.clip-card','petya-clipboard');
 await js(`${card(2)}.querySelector('.kit-link').click()`);
 await wait('document.querySelectorAll(".clip-card")[2].querySelector(".kit-chip").textContent==="добавлено"','comment written');
 assert.deepEqual(calls,[{issue:'BW-12',comment:'https://github.com/acme/bunker-wars/pull/381',title:'Ссылка из буфера'}]);
 assert.equal(await js(`${card(2)}.querySelector('.kit-links').hidden`),true,'the button goes away after the comment');
 assert.equal(await js(`${card(2)}.querySelector('.clip-confirm-actions a').href`),'https://acme.atlassian.net/browse/BW-12');
 await js(`${card(2)}.dataset.shot='1';${card(3)}.dataset.shot='1'`);
 await require('./card-shot.cjs')(win,'.clip-card[data-shot]','petya-clipboard-link');
 // «Стереть всё» asks first; «Отмена» keeps everything.
 await js(`${card(1)}.querySelector('.clip-wipe-button').click()`);
 assert.match(await js(`${card(1)}.querySelector('.clip-wipe p').textContent`),/^Стереть всю историю буфера \(8 записей\)\? Это нельзя отменить\.$/);
 await js(`${card(1)}.querySelector('.clip-wipe button:not(.primary)').click()`);
 assert.equal((await js("window.petya.feature('clipboard','status')")).count,8);
 await js(`${card(1)}.querySelector('.clip-wipe-button').click()`);
 await js(`${card(1)}.querySelector('.clip-wipe .primary').click()`);
 await wait("window.petya.feature('clipboard','status').then(s=>s.count===0)",'wiped');
 await js("window.petya.feature('clipboard','enable',false)");
 console.log('Clipboard cards: settings off by default, week bars, numbered rows with marks and previews, back to the clipboard, link confirmation and comment on press, wipe asks first passed');
}};
require('../src/main.cjs');
