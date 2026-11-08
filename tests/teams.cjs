// «Microsoft Teams» extension: join links (meetup-join with its context, short /meet links, Teams free), a call window
// of the desktop app (new and classic Teams) or Teams on the web recognised from window titles, the main window's
// sections («Чат | …», «Calendar | …») and chats not counted, the video-meeting provider (work accounts only:
// readiness, fit for the card's account, run, prepareEvent), scheduled recording through its own source, the
// settings card data and the offer. No network, no real windows.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const teams=require('../src/extensions/teams/teams.cjs');
const source=require('../src/extensions/teams/meeting-source.cjs');
const video=require('../src/extensions/teams/video-meeting.cjs');
const recording=require('../src/extensions/teams/meeting-recording.cjs');
const feature=require('../src/extensions/teams/feature.cjs');
const offer=require('../src/extensions/teams/offer.cjs');
const desktopWindows=require('../src/desktop-windows.cjs');
const {accounts,microsoftKind}=require('../src/extensions/calendar/accounts.cjs');
(async()=>{
 // --- Join links ---
 const join='https://teams.microsoft.com/l/meetup-join/19%3ameeting_X%40thread.v2/0?context=%7b%22Tid%22%3a%221%22%7d';
 assert.deepEqual(teams.recognizeLink(join),{kind:'teams',key:'teams:/l/meetup-join/19:meeting_x@thread.v2/0',url:join,name:'Microsoft Teams'},'the tenant context is kept as is');
 assert.equal(teams.recognizeLink(join+'&utm_source=mail').url.includes('utm_source'),false,'tracking dropped');
 assert.equal(teams.recognizeLink('https://teams.live.com/meet/9387162534?p=abcd').key,'teams:/meet/9387162534','Teams (free)');
 assert.equal(teams.recognizeLink('https://teams.microsoft.com/meet/2345678901?p=xyz').key,'teams:/meet/2345678901','short work link');
 for(const bad of ['https://teams.microsoft.com/_#/calendar','https://teams.microsoft.com/l/chat/0/0?users=a','https://teams.microsoft.com.evil.com/l/meetup-join/x','http://teams.microsoft.com/l/meetup-join/x','https://teams.live.com/meet/','https://meet.google.com/abc-defg-hij'])
  assert.equal(teams.recognizeLink(bad),null,bad);
 assert.ok(teams.joinLinks[0].test(join));

 // --- Call windows: the desktop app (new «ms-teams», classic «Teams»; macOS has no owner) and Teams on the web ---
 const calls=[
  ['Weekly sync | Microsoft Teams','ms-teams','Weekly sync'],
  ['Синк по релизу | Microsoft Teams','ms-teams.exe','Синк по релизу'],
  ['Meeting with Anna Petrova | Microsoft Teams','Teams','Meeting with Anna Petrova'],
  ['Встреча в канале «Общий» | Microsoft Teams classic','Teams','Встреча в канале «Общий»'],
  ['Ретро | Microsoft Teams','','Ретро'],
  ['Ретро | Microsoft Teams - Google Chrome','chrome','Ретро'],
  ['Ретро | Microsoft Teams (work or school) - Microsoft​ Edge','msedge','Ретро'],
  ['Ретро | Microsoft Teams (free) — Mozilla Firefox','firefox','Ретро'],
  ['Sharing control bar | Microsoft Teams','ms-teams','']
 ];
 for(const [title,app,name] of calls){
  assert.deepEqual(teams.callOf(title,app),{title:name},title);
  const seen=source.fromWindows({windows:[{title,app}]});
  assert.deepEqual(seen,{active:true,app:'Microsoft Teams',windowTitle:title,...name?{title:name}:{}},title);
 }
 // Not calls: the main window's sections (English and Russian), chats, Teams itself, notifications, other apps.
 for(const [title,app] of [['Чат | Анна Петрова | Microsoft Teams','ms-teams'],['Chat | Microsoft Teams','ms-teams'],['Calendar | Microsoft Teams','ms-teams'],['Календарь | Microsoft Teams',''],['Действия | Microsoft Teams',''],
  ['Активность | Microsoft Teams',''],['Команды | Общий | Microsoft Teams',''],['Microsoft Teams','ms-teams'],['Microsoft Teams Notification','ms-teams'],['Teams – Чат',''],['Teams – Чат - Google Chrome','chrome'],
  ['Чат | Microsoft Teams - Google Chrome','chrome'],['Weekly sync | Microsoft Teams','notepad'],['Weekly sync','ms-teams'],['Meet – abc-defg-hij',''],['Zoom Meeting','Zoom'],['Тимлид — заметки',''],['Sign in to your account | Microsoft Teams','']])
  assert.deepEqual(source.fromWindows({windows:[{title,app}]}),{active:false},title+' / '+app);
 assert.equal(source.fromWindows(null),null);
 assert.equal(source.speakers,undefined,'no speaker names from a window title: none are made up');
 const realList=desktopWindows.list;
 desktopWindows.list=async()=>({permission:true,windows:[{title:'Чат | Анна | Microsoft Teams',app:'ms-teams'},{title:'Weekly sync | Microsoft Teams',app:'ms-teams'}]});
 assert.equal((await source.detect()).title,'Weekly sync','the call window among the main window and others');
 desktopWindows.list=realList;

 // --- Work and personal Microsoft accounts ---
 const jwt=tid=>'h.'+Buffer.from(JSON.stringify({tid})).toString('base64url')+'.s';
 assert.equal(microsoftKind({email:'me@corp.com'}),'work');
 assert.equal(microsoftKind({email:'me@outlook.com'}),'personal');assert.equal(microsoftKind({email:'me@hotmail.co.uk'}),'personal');assert.equal(microsoftKind({email:'me@live.ru'}),'personal');
 assert.equal(microsoftKind({email:'me@outlook.com',tokens:{access_token:jwt('72f988bf-86f1-41af-91ab-2d7cd011db47')}}),'work','the token\'s tenant wins over the address');
 assert.equal(microsoftKind({email:'me@corp.com',tokens:{access_token:jwt('9188040d-6c67-4c5b-b112-36a304b66dad')}}),'personal','the consumer tenant');
 assert.equal(microsoftKind({email:'me@corp.com',tokens:{access_token:'EwBwA8l6BAAUopaque'}}),'personal','personal accounts get opaque tokens');
 const ms=(...list)=>JSON.stringify({accounts:list.map(([id,email,scope='https://graph.microsoft.com/Calendars.ReadWrite'])=>({id,email,tokens:{scope}}))});
 assert.deepEqual(accounts({microsoftCredential:ms(['m1','me@corp.com'],['m2','me@outlook.com'])}).map(a=>a.kind),['work','personal']);

 // --- video-meeting: work accounts with calendar access only ---
 assert.equal(video.ready({extension_calendar:'true',microsoftCredential:ms(['m1','me@corp.com'])}),true);
 assert.equal(video.ready({extension_calendar:'true',microsoftCredential:ms(['m1','me@outlook.com'])}),false,'personal accounts: not offered');
 assert.equal(video.ready({extension_calendar:'true',microsoftCredential:ms(['m1','me@corp.com','https://graph.microsoft.com/Mail.Read'])}),false,'mail only');
 assert.equal(video.ready({extension_calendar:'false',microsoftCredential:ms(['m1','me@corp.com'])}),false);
 assert.equal(video.fits({calendar:'microsoft',account:{kind:'work'}}),true);assert.equal(video.fits({calendar:'microsoft',account:{kind:'personal'}}),false);assert.equal(video.fits({calendar:'google'}),false);
 assert.deepEqual(await video.run({},{calendar:'microsoft',account:{kind:'work'}},()=>{}),{provider:'teams',native:true});
 await assert.rejects(video.run({},{calendar:'google'},()=>{}),/календаре Outlook/);
 await assert.rejects(video.run({},{calendar:'microsoft',account:{kind:'personal'}},()=>{}),/рабочем или учебном/);
 const before={calendar:'microsoft',body:{subject:'Синк',attendees:[]},query:{}};
 assert.deepEqual(video.prepareEvent(before,{account:{kind:'work'}}),{calendar:'microsoft',body:{subject:'Синк',attendees:[],isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness'},query:{}});
 assert.equal(before.body.isOnlineMeeting,undefined);
 assert.throws(()=>video.prepareEvent(before,{account:{kind:'personal'}}),/рабочем или учебном/);
 assert.throws(()=>video.prepareEvent({calendar:'google',body:{},query:{}}),/Outlook/);

 // --- Recording: fit, scheduled start by the Teams source ---
 assert.equal(recording.fits({url:join}),true);assert.equal(recording.fits({url:'https://meet.google.com/abc-defg-hij'}),false);assert.equal(recording.fits({}),false);
 const at=(d,h,m=0)=>new Date(2026,10,d,h,m).toISOString();
 let clock=Date.parse(at(10,9,50)),open=false,started=0;const notes=[];
 const s={settings:{extension_teams:'true',meetingAutoRecord:'ask',teamsRecordingSchedule:'[]'},saveSettings(v){const next={...s.settings,...v};feature.validate(next);s.settings=next;},meetingRecording:async()=>{started++;return {};}};
 s.teamsSchedule=feature.scheduler(s,{now:()=>clock,publish:n=>notes.push(n),detect:async()=>({active:open})});
 const out=await recording.run(s,{when:'schedule',title:'Ретро',start:at(10,10),end:at(10,11)},()=>{});
 assert.match(out.text,/окно встречи Teams/);assert.match(notes[0].id,/^meeting-schedule:teams:/);
 clock=Date.parse(at(10,10,0));await s.teamsSchedule.tick();assert.equal(started,0);
 open=true;await s.teamsSchedule.tick();assert.equal(started,1);
 s.teamsSchedule.add({title:'Демо',start:at(12,10),end:at(12,11)});open=false;clock=Date.parse(at(12,10,5));await s.teamsSchedule.tick();clock=Date.parse(at(12,11,0));await s.teamsSchedule.tick();
 assert.match(notes.at(-1).text,/не записана: Teams не показал её/);
 await assert.rejects(recording.run({},{when:'schedule'},()=>{}),/ещё загружается/);

 // --- Settings card data: which accounts create Teams meetings, which cannot ---
 assert.deepEqual(feature.status({extension_calendar:'true',microsoftCredential:ms(['m1','me@corp.com'],['m2','me@outlook.com'],['m3','mail@corp.com','https://graph.microsoft.com/Mail.Read'])},{platform:'win32'}),
  {calendar:true,microsoftAccounts:3,work:['me@corp.com'],personal:['me@outlook.com'],noCalendar:['mail@corp.com'],windows:true,platform:'win32'});
 assert.equal(feature.defaults.extension_teams,'false');

 // --- Offer: Teams named; «тимлид», «тимбилдинг», a Slack team are not ---
 const named=t=>offer.names.some(r=>r.test(t))&&!offer.avoid.some(r=>r.test(t));
 for(const t of ['встреча в Teams','запиши встречу в тимсе','тимс','Microsoft Teams','звонок в тимзе',join])assert.ok(named(t),t);
 for(const t of ['тимлид','тимбилдинг','митинг протеста','команда в Slack','teams в слаке','Zoom','сводка встречи','steams'])assert.ok(!named(t),t);
 console.log('Teams: join links, call windows of the desktop app and the web (sections, chats, other apps not counted), work/personal accounts, video provider readiness/fit/run/prepareEvent, scheduled recording, settings data, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
