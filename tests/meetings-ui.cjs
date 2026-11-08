// Meetings without Zoom in the core, in the real window: the home button «Слушать встречу», Petya's own «Запись встреч»
// settings card (no meeting app → manual only; the Zoom extension added → «Приложения встреч: Zoom» and the start
// mode), the Zoom extension's own card with the personal room, Zoom in the catalog's «Встречи и календарь», the
// team's «Имя на встречах», and the meeting summary card with a service letter. Screenshots for a visual check.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async code=>{for(let i=0;i<150;i++){if(await js(code))return;await sleep(60);}throw Error('Timeout '+code);};
 const shot=async name=>{win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(250);const file=path.join(os.tmpdir(),name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());return file;};
 await js('window.chatNavigationReady');win.setContentSize(1100,860);win.showInactive();
 const files=[];
 // Home: a generic meeting button that works without any meeting app.
 await js("view('home')");
 assert.equal(await js("$('meeting').textContent"),'Слушать встречу');
 assert.doesNotMatch(await js("document.getElementById('home').textContent"),/zoom/i,'the home page names no meeting app');
 // The button lives in the composer's «+» menu, group «Встреча».
 await js("$('meeting').closest('details').open=true");await wait("$('meeting').getBoundingClientRect().width>0");
 assert.match(await js("$('meeting-status').textContent"),/записывается весь системный звук/);
 files.push(await shot('petya-meetings-home'));
 // Settings: Petya's own recording card, no meeting app yet.
 await js("view('settings')");
 const card="document.querySelector('[data-service=meetings]')";
 await wait(card+"&&!!document.getElementById('meeting-sources')?.textContent");
 assert.match(await js("document.getElementById('meeting-sources').textContent"),/Приложения встреч не добавлены/);
 assert.equal(await js("document.getElementById('meeting-record-mode').closest('label').hidden"),true,'no source: the start mode does not apply');
 assert.equal(await js("document.getElementById('meeting-record-mic').checked"),true);
 assert.equal(await js("!!document.querySelector('[data-extension=zoom]')"),false,'the Zoom card exists only with the extension');
 await js(card+".scrollIntoView({block:'start'});window.revealSettings?.("+card+")");
 files.push(await shot('petya-meetings-settings'));
 assert.doesNotMatch(await js(card+".textContent"),/zoom/i,'the core card names no meeting app');
 // The catalog lists Zoom under «Встречи и календарь»; adding it brings the meeting source.
 await js("window.openAppCatalog()");await wait("!!document.querySelector('[data-category=meetings]')");
 assert(await js("[...document.querySelectorAll('[data-category=meetings] .app-tile strong')].some(n=>n.textContent==='Zoom')"),'Zoom is an app of the meetings category');
 assert.match(await js("document.querySelector('[data-category=meetings] .app-catalog-group-head')?.textContent||document.querySelector('[data-category=meetings]').textContent"),/приложения встреч/);
 await js("document.querySelector('[data-category=meetings]').scrollIntoView({block:'start'})");
 files.push(await shot('petya-meetings-catalog'));
 await js("document.querySelector('dialog[open]')?.close()");
 await js("window.extensionHost.open('zoom',{stay:true})");
 await wait("!!document.querySelector('[data-extension=zoom]')&&/Zoom/.test(document.getElementById('meeting-sources').textContent)");
 assert.match(await js("document.getElementById('meeting-sources').textContent"),/Приложения встреч: Zoom/);
 assert.equal(await js("document.getElementById('meeting-record-mode').closest('label').hidden"),false);
 assert.deepEqual(await js("[...document.querySelectorAll('#meeting-record-mode option')].map(o=>o.value)"),['auto','ask','off']);
 assert.deepEqual(await js("window.petya.feature('meetingMemory','options').then(o=>o.sources)"),['Zoom']);
 // Ask first; the Zoom card keeps only what Zoom adds (the personal room).
 await js("document.getElementById('meeting-record-mode').value='ask';document.getElementById('meeting-record-mic').checked=false;[...document.querySelectorAll('[data-service=meetings] button')].find(b=>b.textContent==='Сохранить').click()");
 await wait("window.petya.settings().then(s=>s.meetingAutoRecord==='ask'&&s.meetingCaptureMic==='false')");
 const zoom="document.querySelector('[data-extension=zoom]')";
 await wait("!!document.getElementById('zoom-app-status')?.textContent");
 assert.ok(await js("!!document.getElementById('zoom-personal-link')"));
 assert.equal(await js(zoom+".querySelectorAll('select').length"),0,'recording mode is not duplicated in the Zoom card');
 await js("{const i=document.getElementById('zoom-personal-link');i.value='https://evil.example/j/1234567890';document.getElementById('zoom-save').click();}");
 await sleep(300);
 assert.equal((await js("window.petya.settings()")).zoomPersonalLink,'','an invalid room is refused');
 await js("{const i=document.getElementById('zoom-personal-link');i.value='https://us05web.zoom.us/j/9876543210';document.getElementById('zoom-save').click();}");
 await wait("window.petya.settings().then(s=>s.zoomPersonalLink==='https://us05web.zoom.us/j/9876543210')");
 // Extension cards are on the «Сервисы» tab.
 await js("[...document.querySelectorAll('.ux-settings-controls button')].find(b=>b.textContent==='Сервисы')?.click()");
 await js("{const c="+zoom+";c.querySelector('details')&&(c.querySelector('details').open=true);c.scrollIntoView({block:'start'});}");
 files.push(await shot('petya-meetings-zoom-settings'));
 // Team: «Имя на встречах».
 await js("document.querySelector('[data-view=team]').click()");await wait("!document.getElementById('team').hidden");await wait("!document.getElementById('team-add').disabled");
 await js("document.getElementById('team-add').click()");
 await wait("!!document.querySelector('#team-list [data-field=meetingName]')");
 assert.equal(await js("!!document.querySelector('#team-list [data-field=zoomName]')"),false);
 assert.match(await js("document.querySelector('#team-list [data-field=meetingName]').closest('label').textContent"),/Имя на встречах/);
 // The meeting summary card: the letter's sender comes from the meeting source, not from the card.
 await js("view('home')");
 const summary=(mailFrom)=>({role:'assistant',text:'Сводка',by:'сводка встречи',extensionData:{meetingSummary:{sessionId:'s'+mailFrom,title:'Сводка встречи · 9 нояб.',basis:mailFrom?'mail':'transcript',mailFrom,at:Date.now(),discussed:['Перенос релиза'],decisions:['Релиз в четверг'],tasks:[{who:'Я',what:'Посмотреть баг',due:''}],notDiscussed:['Кланы']}}});
 await js(`showDialogueMessages([{role:'user',text:'сводка встречи'},${JSON.stringify(summary('Zoom'))},${JSON.stringify(summary(''))}],'Встречи')`);
 await wait("document.querySelectorAll('.meeting-card').length===2");
 const subtitles=await js("[...document.querySelectorAll('.meeting-card')].map(c=>c.textContent)");
 assert.match(subtitles[0],/с письмом Zoom/);assert.match(subtitles[1],/по записи/);
 files.push(await require('./card-shot.cjs')(win,'.meeting-card','petya-meetings-summary'));
 console.log('Meetings UI: home «Слушать встречу», recording card without and with the Zoom extension, Zoom card and personal room, catalog, team «Имя на встречах», summary card passed — '+files.join(', '));
}};
require('../src/main.cjs');
