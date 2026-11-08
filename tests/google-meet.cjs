// «Google Meet» extension: join links, a call's browser tab recognised from window titles of every browser (and Meet's
// own pages, a new tab and other apps not counted), the meeting name from the tab or the calendar's known room, the
// neutral window listing (Windows process list, macOS only with screen access, nothing elsewhere), the video-meeting
// provider (readiness by Google calendar account, run, prepareEvent), scheduled recording through its own source,
// the settings card data and the offer. No network, no real windows.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const meet=require('../src/extensions/google-meet/meet.cjs');
const source=require('../src/extensions/google-meet/meeting-source.cjs');
const video=require('../src/extensions/google-meet/video-meeting.cjs');
const recording=require('../src/extensions/google-meet/meeting-recording.cjs');
const feature=require('../src/extensions/google-meet/feature.cjs');
const offer=require('../src/extensions/google-meet/offer.cjs');
const desktopWindows=require('../src/desktop-windows.cjs');
const {Rooms}=require('../src/extensions/calendar/rooms.cjs');
(async()=>{
 // --- Join links ---
 assert.deepEqual(meet.recognizeLink('https://meet.google.com/ABC-defg-hij/?authuser=1&utm_source=x'),{kind:'meet',key:'meet:abc-defg-hij',url:'https://meet.google.com/abc-defg-hij',name:'Google Meet'});
 assert.equal(meet.recognizeLink('https://meet.google.com/abc-defg-hij).').key,'meet:abc-defg-hij','trailing punctuation');
 for(const bad of ['https://meet.google.com/new','https://meet.google.com/','http://meet.google.com/abc-defg-hij','https://meet.google.com.evil.com/abc-defg-hij','https://evil.com/abc-defg-hij','https://user@meet.google.com/abc-defg-hij','https://meet.google.com/abc-defg-hijk','https://meet.jit.si/abc-defg-hij','не ссылка'])
  assert.equal(meet.recognizeLink(bad),null,bad);
 assert.ok(meet.joinLinks[0].test('https://meet.google.com/abc-defg-hij'));assert.ok(!meet.joinLinks[0].test('https://meet.google.com/landing'));

 // --- A call's tab by window title, in every browser (Windows titles carry the browser name; macOS ones do not) ---
 const calls=[
  ['Meet – abc-defg-hij','','abc-defg-hij',''],                                  // Safari, Arc, Chrome on macOS
  ['Meet - abc-defg-hij - Google Chrome','chrome','abc-defg-hij',''],
  ['Meet – abc-defg-hij and 3 more pages - Work - Microsoft​ Edge','msedge','abc-defg-hij',''],
  ['Meet – abc-defg-hij - Microsoft Edge','msedge.exe','abc-defg-hij',''],
  ['Meet – abc-defg-hij — Mozilla Firefox','firefox','abc-defg-hij',''],
  ['Meet – abc-defg-hij — Mozilla Firefox Private Browsing','firefox','abc-defg-hij',''],
  ['Meet – abc-defg-hij - Yandex','browser','abc-defg-hij',''],
  ['Meet – abc-defg-hij — Яндекс Браузер','browser','abc-defg-hij',''],
  ['Meet – abc-defg-hij - Arc','Arc','abc-defg-hij',''],
  ['Meet: Синк по релизу — Mozilla Firefox','firefox','','Синк по релизу'],
  ['Meet – Дейли команды - Google Chrome','chrome','','Дейли команды'],
  ['Google Meet - abc-defg-hij - Google Chrome','chrome','abc-defg-hij','']
 ];
 for(const [title,app,code,name] of calls){
  assert.deepEqual(meet.callOf(title),{code,title:name},title);
  assert.equal(source.fromWindows({windows:[{title,app}]}).active,true,title+' / '+app);
 }
 // Not calls: Meet's own pages, a new tab, the left-call page, Google's product page, other «meet» words, other apps.
 for(const title of ['Google Meet – новая вкладка','Google Meet','Meet','Meet – Google Meet','Google Meet - Google Chrome','Meet – Новая вкладка - Google Chrome','Meet – Вы покинули видеовстречу',
  'Google Meet: Online Web and Video Conferencing Calls | Google Workspace - Google Chrome','Meetup - Google Chrome','Meeting notes - Google Docs - Google Chrome','Митинг протеста — Яндекс Браузер','Meet the team | Acme - Google Chrome','Zoom Meeting','Teams – Чат','Weekly sync | Microsoft Teams'])
  assert.deepEqual(source.fromWindows({windows:[{title,app:''}]}),{active:false},title);
 assert.deepEqual(source.fromWindows({windows:[{title:'Meet – abc-defg-hij',app:'Notepad'}]}),{active:false},'a document named like a call in another app');
 assert.deepEqual(source.fromWindows({windows:[]}),{active:false});
 assert.equal(source.fromWindows(null),null,'no window listing: nothing to say');
 const seen=source.fromWindows({permission:true,windows:[{title:'Slack | general',app:'slack'},{title:'Meet – Синк по релизу - Google Chrome',app:'chrome'}]});
 assert.deepEqual(seen,{active:true,app:'Google Meet',windowTitle:'Meet – Синк по релизу - Google Chrome',title:'Синк по релизу'});

 // --- The meeting name from the calendar's known room when the tab shows only the code ---
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-meet-'));
 const rooms=new Rooms({file:path.join(dir,'calendar-rooms.json'),recognize:meet.recognizeLink});
 const ev=(id,day)=>({id,title:'Дейли команды',start:new Date(2026,10,day,10).toISOString(),attendees:['anna@corp.ru'],link:'https://meet.google.com/abc-defg-hij'});
 rooms.learn([ev('a',2),ev('b',3)]);
 assert.equal(source.fromWindows({windows:[{title:'Meet – abc-defg-hij',app:''}]},{dataRoot:dir}).title,'Дейли команды');
 rooms.rename('meet:abc-defg-hij','Дейли');
 assert.equal(source.fromWindows({windows:[{title:'Meet – abc-defg-hij',app:''}]},{dataRoot:dir}).title,'Дейли','the name the user gave the room');
 assert.equal(source.fromWindows({windows:[{title:'Meet – zzz-zzzz-zzz',app:''}]},{dataRoot:dir}).title,undefined,'an unknown code: no made-up title');
 assert.equal(source.speakers,undefined,'Meet shows no speaker names Petya could read: none are made up');

 // --- The neutral window listing: Windows process list, macOS only with screen access, elsewhere null ---
 desktopWindows._reset();
 let runs=0;const run=async()=>{runs++;return {windows:[{title:'Meet – abc-defg-hij - Google Chrome',app:'chrome'},{title:'',app:'x'},{title:'  ',app:'y'}]};};
 let t=1000;const now=()=>t;
 assert.deepEqual(await desktopWindows.list({platform:'win32',run,now}),{permission:true,windows:[{title:'Meet – abc-defg-hij - Google Chrome',app:'chrome'}]});
 await desktopWindows.list({platform:'win32',run,now});assert.equal(runs,1,'sources polled together share one listing');
 t+=5000;await desktopWindows.list({platform:'win32',run,now});assert.equal(runs,2,'and look again later');
 desktopWindows._reset();
 let asked=0;const electron=status=>()=>({systemPreferences:{getMediaAccessStatus:k=>{assert.equal(k,'screen');return status;},askForMediaAccess:()=>{throw Error('never asks');}},desktopCapturer:{getSources:async o=>{asked++;assert.deepEqual(o.types,['window']);assert.equal(o.thumbnailSize.width,0);return [{id:'window:1:0',name:'Meet – abc-defg-hij'}];}}});
 assert.deepEqual(await desktopWindows.list({platform:'darwin',electron:electron('denied'),now}),{permission:false,windows:[]});assert.equal(asked,0,'no screen access: windows are not read and nothing is requested');
 desktopWindows._reset();
 assert.deepEqual(await desktopWindows.list({platform:'darwin',electron:electron('granted'),now}),{permission:true,windows:[{title:'Meet – abc-defg-hij',app:''}]});
 desktopWindows._reset();
 assert.equal(await desktopWindows.list({platform:'linux',now}),null);
 desktopWindows._reset();
 await assert.rejects(desktopWindows.list({platform:'win32',run:async()=>{throw Error('powershell failed');},now}),/powershell/);
 assert.deepEqual(await desktopWindows.list({platform:'win32',run,now}),{permission:true,windows:[{title:'Meet – abc-defg-hij - Google Chrome',app:'chrome'}]},'a failed look is not cached');
 assert.match(desktopWindows.SCRIPT,/EnumWindows/);assert.ok(!/zoom|meet|teams/i.test(desktopWindows.SCRIPT),'the window script names no service');
 assert.equal(desktopWindows.isBrowser('msedge.exe'),true);assert.equal(desktopWindows.isBrowser('Zoom'),false);
 // detect() goes through the shared listing.
 desktopWindows._reset();const realList=desktopWindows.list;
 desktopWindows.list=async()=>({permission:true,windows:[{title:'Meet – abc-defg-hij - Google Chrome',app:'chrome'}]});
 assert.equal((await source.detect({dataRoot:dir})).active,true);
 desktopWindows.list=async()=>null;assert.equal(await source.detect({}),null);
 desktopWindows.list=realList;

 // --- video-meeting: ready only with a Google calendar account (and «Календарь»), Google calendars only ---
 const CAL='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';
 const g=scope=>JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope}}]});
 assert.equal(video.ready({extension_calendar:'true',gmailCredential:g(CAL)}),true);
 assert.equal(video.ready({extension_calendar:'false',gmailCredential:g(CAL)}),false,'the calendar creates the event: it must be added');
 assert.equal(video.ready({extension_calendar:'true',gmailCredential:g('https://www.googleapis.com/auth/gmail.readonly')}),false,'mail only');
 assert.equal(video.ready({extension_calendar:'true',microsoftCredential:JSON.stringify({accounts:[{id:'m',email:'me@corp.com',tokens:{scope:'Calendars.ReadWrite'}}]})}),false,'an Outlook calendar has no Meet');
 assert.equal(video.fits({calendar:'google'}),true);assert.equal(video.fits({calendar:'microsoft'}),false);
 let checked=0;assert.deepEqual(await video.run({},{calendar:'google'},()=>checked++),{provider:'google-meet',native:true});assert.equal(checked,1);
 await assert.rejects(video.run({},{calendar:'microsoft'},()=>{}),/только во встрече Google Календаря/);
 const before={calendar:'google',body:{summary:'Синк',attendees:[{email:'a@corp.ru'}]},query:{sendUpdates:'all'}};
 const a=video.prepareEvent(before),b=video.prepareEvent(before);
 assert.deepEqual(a.body.conferenceData.createRequest.conferenceSolutionKey,{type:'hangoutsMeet'});
 assert.notEqual(a.body.conferenceData.createRequest.requestId,b.body.conferenceData.createRequest.requestId,'a new request id per event');
 assert.deepEqual(a.query,{sendUpdates:'all',conferenceDataVersion:'1'});assert.equal(a.body.summary,'Синк');assert.equal(before.body.conferenceData,undefined,'the input is not changed');
 assert.throws(()=>video.prepareEvent({calendar:'microsoft',body:{},query:{}}),/Google Календаря/);

 // --- Recording: fit, readiness, scheduled start by the Meet source ---
 assert.equal(recording.fits({url:'https://meet.google.com/abc-defg-hij'}),true);
 assert.equal(recording.fits({url:'https://us02web.zoom.us/j/1234567890'}),false);assert.equal(recording.fits({}),false,'no link: not a Meet event');
 assert.equal(recording.ready({meetingAutoRecord:'off'}),false);assert.equal(recording.ready({}),true);
 const at=(d,h,m=0)=>new Date(2026,10,d,h,m).toISOString();
 let clock=Date.parse(at(10,9,50)),open=false,started=0;const notes=[];
 const s={settings:{'extension_google-meet':'true',meetingAutoRecord:'auto',googleMeetRecordingSchedule:'[]'},saveSettings(v){const next={...s.settings,...v};feature.validate(next);s.settings=next;},meetingRecording:async()=>{started++;return {phase:'recording'};}};
 const plan=feature.scheduler(s,{now:()=>clock,publish:n=>notes.push(n),detect:async()=>({active:open})});
 s.googleMeetSchedule=plan;
 const out=await recording.run(s,{when:'schedule',title:'Синк',start:at(10,10),end:at(10,11)},()=>{});
 assert.match(out.text,/вкладка встречи Google Meet/);assert.match(notes[0].id,/^meeting-schedule:google-meet:/);assert.equal(notes[0].cancellable,out.scheduled.id);
 clock=Date.parse(at(10,10,1));await plan.tick();assert.equal(started,0);assert.match(notes.at(-1).text,/начнётся в Google Meet/);
 open=true;await plan.tick();assert.equal(started,1,'starts once the Meet tab is seen');
 s.settings['extension_google-meet']='false';plan.add({title:'Позже',start:at(11,10),end:at(11,11)});clock=Date.parse(at(11,10,1));await plan.tick();assert.equal(started,1,'removed: scheduled items wait');
 assert.throws(()=>feature.validate({googleMeetRecordingSchedule:JSON.stringify(Array.from({length:9},(_,i)=>({id:'x'+i})))}),/Слишком много/);
 assert.ok(plan.restore().length===2&&plan.restore().every(x=>x.id.startsWith('meeting-schedule:google-meet:')),'restored after a reload with its own ids');

 // --- Settings card data ---
 assert.deepEqual(feature.status({extension_calendar:'true',gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope:CAL}},{id:'g2',email:'mail@corp.ru',tokens:{scope:''}}]}),calendarAccount:'google:g1'},{platform:'darwin'}),
  {calendar:true,googleAccounts:2,calendarAccounts:['me@corp.ru'],linksAccount:'me@corp.ru',windows:true,platform:'darwin'});
 assert.equal(feature.status({},{platform:'linux'}).windows,false);
 assert.equal(feature.defaults['extension_google-meet'],'false');

 // --- Offer: Meet named, «meeting»/«митинг»/«митап» not ---
 const named=t=>offer.names.some(r=>r.test(t))&&!offer.avoid.some(r=>r.test(t));
 for(const t of ['созвон в Meet','запиши созвон в мите','гугл мит','Google Meet','позвони через meet','https://meet.google.com/abc-defg-hij'])assert.ok(named(t),t);
 for(const t of ['митинг протеста','митап по Unity','meeting notes','let us meet tomorrow','Meetup','сводка встречи','Zoom','мите́нки','smite'])assert.ok(!named(t),t);
 assert.equal(offer.ready({'extension_google-meet':'true'}),true);
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('Google Meet: join links, call tabs in Chrome/Edge/Firefox/Safari/Arc/Yandex and non-call titles, known-room titles, neutral window listing, video provider readiness/run/prepareEvent, scheduled recording, settings data, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
