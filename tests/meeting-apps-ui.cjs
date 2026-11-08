// Google Meet and Microsoft Teams as their own apps in the real window: both listed in the catalog's «Встречи и
// календарь» next to Zoom and «Календарь»; added from the catalog, each gets its own settings card (how calls are
// seen, which calendar account creates links, personal Microsoft accounts explained); the calendar's confirm step
// shows «Видеозвонок» choices that come from the three apps' providers — Zoom + Meet for a Google calendar, Zoom +
// Teams for an Outlook calendar of a work account. The provider lists are the real app-links registry's answer for
// stub accounts (credentials cannot be saved from the page); screenshots for a visual check.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async(code,label)=>{for(let i=0;i<150;i++){if(await js(code))return;await sleep(60);}throw Error('Timeout '+(label||code));};
 const shot=async name=>{win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(250);const file=path.join(os.tmpdir(),name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());return file;};
 await js('window.chatNavigationReady');win.setContentSize(1100,860);win.showInactive();

 // --- Catalog: both apps in «Встречи и календарь», not added yet ---
 await js('window.openAppCatalog()');await wait("document.querySelectorAll('.app-catalog-group').length>3");
 const meetings="document.querySelector('[data-category=meetings]')";
 const names=await js(`[...${meetings}.querySelectorAll('.app-tile strong')].map(n=>n.textContent)`);
 for(const n of ['Google Meet','Microsoft Teams','Zoom','Календарь'])assert.ok(names.includes(n),n+' in «Встречи»: '+names.join(', '));
 assert.match(await js(`${meetings}.querySelector('.app-tile[data-app="google-meet"]').textContent`),/браузер/);
 await js(`${meetings}.scrollIntoView({block:'start'})`);
 const catalogShot=await shot('petya-meeting-apps-catalog');
 // Add both from the catalog («Выбрать несколько», both tiles, then «Добавить выбранные»).
 await js("document.querySelector('.app-catalog-select').click()");await wait("document.querySelector('.app-catalog').classList.contains('selecting')");
 for(const id of ['google-meet','teams'])await js(`${meetings}.querySelector('.app-tile[data-app="${id}"] .app-tile-main').click()`);
 await wait("document.querySelector('.app-catalog-bar-note')?.textContent.startsWith('Выбрано: 2')");
 await js("document.querySelector('.app-catalog-bar .primary').click()");
 await wait("(async()=>{const c=await window.petya.feature('extensionUI','catalog');return c.find(e=>e.id==='google-meet').installed&&c.find(e=>e.id==='teams').installed;})()",'both added');
 await js("document.querySelector('dialog.app-catalog')?.close()");
 const settings=await js('window.petya.settings()');
 assert.equal(settings['extension_google-meet'],'true');assert.equal(settings.extension_teams,'true');

 // --- Their settings cards (owned by the extensions) ---
 await js("view('settings')");
 await wait("!!document.querySelector('[data-extension=\"google-meet\"] p.small')?.textContent&&!!document.querySelector('[data-extension=\"teams\"] p.small')?.textContent",'settings cards');
 const meetCard=await js("document.querySelector('[data-extension=\"google-meet\"]').textContent");
 assert.match(meetCard,/Google Meet/);assert.match(meetCard,/добавьте расширение «Календарь»|Подключите аккаунт Google/,'no calendar yet: says what to connect');
 const teamsCard=await js("document.querySelector('[data-extension=\"teams\"]').textContent");
 assert.match(teamsCard,/рабочий аккаунт Microsoft/);
 await js("for(const id of ['google-meet','teams'])document.querySelector('[data-extension=\"'+id+'\"] .settings-disclosure').open=true");
 const cardsShot=await require('./card-shot.cjs')(win,'[data-extension="google-meet"],[data-extension="teams"]','petya-meeting-apps-settings');
 await js("document.getElementById('card-shot').remove()");

 // --- The calendar's confirm step: choices from the three apps' providers ---
 const links=require('../src/features/app-links.cjs');
 const stub={extension_calendar:'true',extension_zoom:'true','extension_google-meet':'true',extension_teams:'true',zoomPersonalLink:'https://us05web.zoom.us/j/9876543210',
  gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope:'https://www.googleapis.com/auth/calendar'}}]}),
  microsoftCredential:JSON.stringify({accounts:[{id:'m1',email:'me@corp.com',tokens:{scope:'Calendars.ReadWrite'}},{id:'m2',email:'me@outlook.com',tokens:{scope:'Calendars.ReadWrite'}}]})};
 const registry=links.create({settings:stub});
 const google=registry.available('video-meeting',{calendar:'google',account:{kind:''}});
 const outlook=registry.available('video-meeting',{calendar:'microsoft',account:{kind:'work'}});
 const personal=registry.available('video-meeting',{calendar:'microsoft',account:{kind:'personal'}});
 assert.deepEqual(google.map(p=>p.id),['zoom','google-meet']);assert.deepEqual(outlook.map(p=>p.id),['zoom','teams']);assert.deepEqual(personal.map(p=>p.id),['zoom'],'no Teams for a personal account');
 const providers=Object.fromEntries(registry.providers().filter(p=>p.kind==='video-meeting').map(p=>[p.id,p.extension]));
 assert.deepEqual(providers,{zoom:'zoom','google-meet':'google-meet',teams:'teams'},'three providers, three extensions');
 const n=new Date(),t=(d,h)=>new Date(n.getFullYear(),n.getMonth(),n.getDate()+d,h).toISOString();
 const slots=(draftId,provider,email)=>({mode:'slots',draftId,account:provider+':x',accountEmail:email,provider,title:'Синк по релизу',duration:60,label:'на этой неделе',workStart:'10:00',workEnd:'19:00',chosen:0,
  people:[{name:'Вы',email,self:true,busy:[{start:t(1,10),end:t(1,11)}]},{name:'Мария Петрова',email:'maria@corp.ru',busy:[{start:t(1,13),end:t(1,14)}]}],attendees:[{name:'Мария Петрова',email:'maria@corp.ru'}],
  slots:[{start:t(1,11),end:t(1,12),busy:[],note:'свободны все'},{start:t(1,15),end:t(1,16),busy:[],note:'свободны все'}]});
 await js(`window.petyaCalendar={...window.petyaCalendar,videoChoices:async id=>({providers:id==='g'?${JSON.stringify(google)}:${JSON.stringify(outlook)},rooms:[],strong:''})};0`);
 await js("view('home')");
 await js(`showDialogueMessages([{role:'assistant',text:'Google',by:'Календарь',extensionData:{calendarCard:${JSON.stringify(slots('g','google','me@corp.ru'))}}},{role:'assistant',text:'Outlook',by:'Календарь',extensionData:{calendarCard:${JSON.stringify(slots('o','microsoft','me@corp.com'))}}}],'Календарь')`);
 await wait("document.querySelectorAll('.cal-card').length===2");
 for(const i of [0,1])await js(`document.querySelectorAll('.cal-card')[${i}].querySelector('.kit-actions button.primary').click()`);
 await wait("[...document.querySelectorAll('.cal-card')].every(c=>c.querySelectorAll('.cal-video-option').length===4)",'video choices');
 const values=i=>js(`[...document.querySelectorAll('.cal-card')[${i}].querySelectorAll('.cal-video-option')].map(o=>o.dataset.value)`);
 assert.deepEqual(await values(0),['p:zoom','p:google-meet','custom','none']);
 assert.deepEqual(await values(1),['p:zoom','p:teams','custom','none']);
 assert.match(await js("document.querySelectorAll('.cal-card')[0].querySelector('.cal-video-option[data-value=\"p:google-meet\"]').textContent"),/Ссылку создаст Google вместе со встречей/);
 assert.match(await js("document.querySelectorAll('.cal-card')[1].querySelector('.cal-video-option[data-value=\"p:teams\"]').textContent"),/Ссылку создаст Microsoft вместе со встречей/);
 // Pick Meet / Teams explicitly for the picture.
 await js("document.querySelectorAll('.cal-card')[0].querySelector('.cal-video-option[data-value=\"p:google-meet\"] input').click()");
 await js("document.querySelectorAll('.cal-card')[1].querySelector('.cal-video-option[data-value=\"p:teams\"] input').click()");
 const confirmShot=await require('./card-shot.cjs')(win,'.cal-card','petya-meeting-apps-confirm');
 await js("(()=>{const box=document.getElementById('card-shot'),n=box.querySelector('.cal-confirm');box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()");
 const confirmVideo=await shot('petya-meeting-apps-confirm-video');
 await js("(()=>{const box=document.getElementById('card-shot'),n=box.querySelectorAll('.cal-confirm')[1];box.scrollTop+=n.getBoundingClientRect().top-box.getBoundingClientRect().top-12;})()");
 const confirmTeams=await shot('petya-meeting-apps-confirm-teams');
 console.log('Meeting apps UI: Google Meet and Teams in the catalog\'s meetings group, added with their own settings cards, confirm-step choices from Zoom/Meet/Teams providers passed · '+[catalogShot,cardsShot,confirmShot,confirmVideo,confirmTeams].join(', '));
}};
require('../src/main.cjs');
