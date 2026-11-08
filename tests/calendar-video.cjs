// «Видеозвонок» of a new calendar event and the providers behind it: known rooms learned from the calendar (distinct
// days, normalization, ranking, manual links, rename/forget, persistence), the Zoom personal room (validation, local
// plain-text discovery, the «paste it once» question), Meet/Teams patches, the event payloads for a link, and the
// local recording: provider fit and the scheduled start with its notifications.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Rooms,normalize,linksOf}=require('../src/extensions/calendar/rooms.cjs');
const app=require('../src/extensions/calendar/feature.cjs');
const {SCOPES}=require('../src/extensions/calendar/client.cjs');
const room=require('../src/extensions/zoom-bot/personal-room.cjs');
const zoomBot=require('../src/extensions/zoom-bot/feature.cjs');
const recording=require('../src/extensions/zoom-bot/meeting-recording.cjs');
const links=require('../src/features/app-links.cjs');
const json=(v,status=200)=>({ok:status<300,status,json:async()=>v});
const NOW=new Date(2026,10,9,9,0);
const at=(d,h,m=0)=>new Date(2026,10,d,h,m).toISOString();
(async()=>{
 // --- Normalization and dedup ---
 const z=normalize('https://us02web.zoom.us/j/1234567890?pwd=AbC.1&utm_source=mail#success');
 assert.deepEqual(z,{kind:'zoom',key:'zoom:1234567890',url:'https://us02web.zoom.us/j/1234567890?pwd=AbC.1'},'tracking dropped, passcode kept');
 assert.equal(normalize('https://zoom.us/j/1234567890').key,z.key,'the same room on another Zoom host');
 assert.equal(normalize('https://meet.google.com/ABC-defg-hij/').url,'https://meet.google.com/abc-defg-hij');
 const teams='https://teams.microsoft.com/l/meetup-join/19%3ameeting_X%40thread.v2/0?context=%7b%22Tid%22%3a%221%22%7d';
 assert.equal(normalize(teams).url,teams,'Teams keeps its context');
 assert.equal(normalize('https://telemost.yandex.ru/j/12345678901234').kind,'telemost');
 assert.equal(normalize('https://example.com/agenda'),null,'not a meeting link: not learned');
 assert.deepEqual(normalize('https://example.com/room?utm_campaign=x&id=7',{any:true}),{kind:'link',key:'example.com/room?id=7',url:'https://example.com/room?id=7'});
 assert.equal(normalize('http://zoom.us/j/1234567890',{any:true}),null,'https only');
 assert.equal(normalize('javascript:alert(1)',{any:true}),null);
 assert.deepEqual(linksOf({link:'https://meet.google.com/abc-defg-hij',location:'Zoom: https://zoom.us/j/1234567890.',description:'или https://us02web.zoom.us/j/1234567890?pwd=x'}).map(l=>l.key),['meet:abc-defg-hij','zoom:1234567890']);

 // --- Learning: different days only ---
 let clock=+NOW;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-rooms-'));const file=path.join(dir,'calendar-rooms.json');
 const rooms=new Rooms({file,now:()=>clock});
 const daily=(id,day,extra={})=>({id,title:'Дейли',start:at(day,10),attendees:['me@corp.ru','anna@corp.ru','oleg@corp.ru'],link:'https://us02web.zoom.us/j/1112223334?pwd=d',...extra});
 rooms.learn([daily('d1',2),daily('d1b',2,{title:'Дейли (перенос)'})],{self:'me@corp.ru'});
 assert.deepEqual(rooms.list(),[],'two events on one day are not a habit');
 rooms.learn([daily('d2',3)],{self:'me@corp.ru'});
 assert.deepEqual(rooms.list().map(r=>[r.name,r.count,r.days]),[['Дейли · Zoom',3,2]]);
 rooms.learn([daily('d2',3)],{self:'me@corp.ru'});
 assert.equal(rooms.list()[0].count,3,'reading the same events again does not count twice');
 rooms.learn([daily('x',4,{declined:true,link:'https://meet.google.com/zzz-zzzz-zzz'}),daily('x2',5,{declined:true,link:'https://meet.google.com/zzz-zzzz-zzz'})]);
 assert.equal(rooms.list().length,1,'declined events teach nothing');
 const sync=(id,day)=>({id,title:'Синк с Олегом',start:at(day,15),attendees:['me@corp.ru','oleg@corp.ru'],location:'https://meet.google.com/syn-cwit-hol'});
 rooms.learn([sync('s1',2),sync('s2',4),sync('s3',6)],{self:'me@corp.ru'});
 // --- Ranking: same people > similar title > frequency ---
 const forOleg=rooms.rank({title:'Синк по релизу',attendees:['oleg@corp.ru']});
 assert.equal(forOleg[0].name,'Синк с Олегом · Meet');assert.match(forOleg[0].reason,/те же участники · похожее название · использовалась 3 раза/);assert.equal(forOleg[0].strong,true);
 const forDaily=rooms.rank({title:'Дейли команды',attendees:['anna@corp.ru','oleg@corp.ru']});
 assert.equal(forDaily[0].key,'zoom:1112223334');assert.equal(forDaily[0].strong,true);
 const stranger=rooms.rank({title:'Интервью',attendees:['new@x.org']});
 assert.equal(stranger[0].strong,false,'no match: no default room');assert.match(stranger[0].reason,/^использовалась \d+ раз/);
 // --- Manual links, rename, forget, persistence ---
 assert.throws(()=>rooms.remember('ftp://x'),/https:\/\//);
 const manual=rooms.remember('https://meet.jit.si/petya-retro?utm_source=x',{title:'Ретро',attendees:['anna@corp.ru']});
 assert.deepEqual([manual.kind,manual.url,manual.name,manual.manual],['jitsi','https://meet.jit.si/petya-retro','Ретро · Jitsi',true]);
 assert.equal(rooms.rename('meet:syn-cwit-hol','Олег').name,'Олег');
 rooms.forget('zoom:1112223334');
 rooms.learn([daily('d9',8),daily('d10',9)]);
 assert.ok(!rooms.list().some(r=>r.key==='zoom:1112223334'),'a forgotten room is not learned again');
 const reloaded=new Rooms({file,now:()=>clock});
 assert.deepEqual(reloaded.list().map(r=>r.name).sort(),['Олег','Ретро · Jitsi']);
 assert.equal((fs.statSync(file).mode&0o777).toString(8),'600','private file');
 assert.equal(reloaded.due(),true);reloaded.refreshed();assert.equal(reloaded.due(),false);clock+=25*3600000;assert.equal(reloaded.due(),true,'refreshed at most once a day');

 // --- Zoom personal room: validation, local discovery, readiness ---
 assert.equal(room.valid('https://us05web.zoom.us/j/9876543210?pwd=Ab12'),'https://us05web.zoom.us/j/9876543210?pwd=Ab12');
 assert.equal(room.valid('https://zoom.us/j/12'),'');assert.equal(room.valid('https://evil.com/j/9876543210'),'');assert.equal(room.valid('https://zoom.us.evil.com/j/9876543210'),'');
 assert.equal(room.installed({platform:'darwin',home:'/Users/a',exists:p=>p==='/Applications/zoom.us.app'}),true);
 assert.equal(room.installed({platform:'win32',env:{APPDATA:'C:\\Users\\a\\AppData\\Roaming'},exists:p=>/Zoom[\\/]bin[\\/]Zoom\.exe$/.test(p)}),true);
 assert.equal(room.installed({platform:'darwin',home:'/Users/a',exists:()=>false}),false);
 const zdir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-zoomdata-'));
 fs.writeFileSync(path.join(zdir,'zoomus.db'),'SQLite format 3\u0000https://zoom.us/j/5555555555 pmi');
 fs.writeFileSync(path.join(zdir,'recent.json'),'{"lastMeeting":"https://zoom.us/j/4444444444"}');
 assert.equal(room.discover({dirs:[zdir]}),'','databases and the last meeting are never taken');
 fs.mkdirSync(path.join(zdir,'conf'));fs.writeFileSync(path.join(zdir,'conf','user.ini'),'[user]\npersonal_link=https://us06web.zoom.us/j/7777777777?pwd=Q1\n');
 assert.equal(room.discover({dirs:[zdir]}),'https://us06web.zoom.us/j/7777777777?pwd=Q1');

 // --- The calendar's confirm-and-create with a video choice ---
 const topic={id:'t',title:'Чат',messages:[]};
 let calls=[],routes=[];
 const fetcher=async(url,o={})=>{calls.push({url,method:o.method||'GET',body:o.body?JSON.parse(o.body):null});for(const [test,answer] of routes)if(test(url,o))return typeof answer==='function'?answer(url,o):answer;throw Error('unexpected '+url);};
 const manager={client:id=>({access:async()=>'tok-'+id}),status:()=>({configured:true}),login:{}};
 const s={settings:{model:'',extension_calendar:'true',teamMembers:JSON.stringify([{name:'Олег Иванов',email:'oleg@corp.ru'}]),
   gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope:SCOPES.google.join(' ')}}]})},
  requestProgress:{report(){}},mailAccounts:{google:manager,microsoft:manager},saveSettings(v){Object.assign(s.settings,v);},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 routes=[[u=>u.includes('/freeBusy'),json({calendars:{primary:{busy:[]},'oleg@corp.ru':{busy:[]}}})],
  [u=>u.includes('/calendars/primary/events?')&&!u.includes('sendUpdates'),json({items:[]})],
  [u=>u.includes('/calendars/primary/events?sendUpdates'),(u,o)=>json({id:'e1',htmlLink:'https://calendar.google.com/event?eid=e1'})]];
 const draft=async text=>(await app.turn(s,text,{fetcher,now:NOW})).extensionData.calendarCard;
 const ui=app.setup(s,{fetcher,now:()=>NOW}).ipc;
 // Zoom is listed only when the app is installed or the link is known; Meet fits a Google calendar, Teams does not.
 const real=links.create(s);
 const realInstalled=room.installed,realDiscover=room.discover;
 room.installed=()=>false;
 assert.deepEqual(real.available('video-meeting',{calendar:'google'}).map(p=>p.id),['google-meet'],'no Zoom app, no saved link: no Zoom');
 room.installed=()=>true;room.discover=()=>'';
 assert.deepEqual(real.available('video-meeting',{calendar:'google'}).map(p=>[p.id,p.label]),[['zoom','Zoom (личная комната)'],['google-meet','Google Meet']]);
 assert.match(real.available('video-meeting',{calendar:'google'})[0].hint,/Одна и та же комната для всех встреч · ссылку нужно вставить/);
 s.settings.zoomPersonalLink='';
 const card1=await draft('найди час с Олегом Ивановым завтра');
 const choices=await ui.videoChoices(card1.draftId);
 assert.ok(choices.providers.some(p=>p.id==='google-meet'));assert.ok(!choices.providers.some(p=>p.id==='teams'));
 assert.equal(calls.filter(c=>c.url.includes('timeMin')).length,1,'the 60-day look-back ran once');
 await ui.videoChoices(card1.draftId);
 assert.equal(calls.filter(c=>c.url.includes('timeMin')).length,1,'and not again the same day');
 // Zoom without a known link: a question, nothing written.
 calls=[];
 const ask=await ui.create({draftId:card1.draftId,slot:0,video:'zoom'}).catch(e=>e);
 assert.equal(ask.needLink,true);assert.match(ask.text,/личную комнату Zoom/);
 assert.equal(calls.filter(c=>c.method==='POST'&&c.url.includes('sendUpdates')).length,0,'no event before the link is known');
 const bad=await ui.create({draftId:card1.draftId,slot:0,video:'zoom',zoomLink:'https://zoom.us/my/abc'}).catch(e=>e);
 assert.equal(bad.needLink,true);assert.match(bad.text,/Это не ссылка/);assert.equal(s.settings.zoomPersonalLink,'','an invalid link is not saved');
 // The pasted link is validated, saved and used; afterwards Zoom is ready without the app.
 const made=await ui.create({draftId:card1.draftId,slot:0,video:'zoom',zoomLink:' https://us05web.zoom.us/j/9876543210?pwd=Ab12 '});
 assert.equal(s.settings.zoomPersonalLink,'https://us05web.zoom.us/j/9876543210?pwd=Ab12','remembered for the next meetings');room.installed=()=>false;
 const post=calls.find(c=>c.method==='POST'&&c.url.includes('sendUpdates'));
 assert.equal(post.body.location,'https://us05web.zoom.us/j/9876543210?pwd=Ab12');assert.match(post.body.description,/Ссылка на видеозвонок: https:\/\/us05web\.zoom\.us\/j\/9876543210/);
 assert.equal(post.body.conferenceData,undefined);assert.equal(new URL(post.url).searchParams.get('conferenceDataVersion'),null,'no Meet next to Zoom');
 assert.equal(made.created.link,'https://us05web.zoom.us/j/9876543210?pwd=Ab12');assert.equal(made.created.video,'zoom');
 // A typed link becomes a known room; «без звонка» adds nothing.
 calls=[];
 const card2=await draft('найди час с Олегом Ивановым завтра');
 await assert.rejects(ui.create({draftId:card2.draftId,slot:0,video:{url:'нет ссылки'}}),/https:\/\//);
 await ui.create({draftId:card2.draftId,slot:0,video:{url:'https://telemost.yandex.ru/j/12345678901234?utm_source=x'}});
 assert.equal(calls.find(c=>c.method==='POST'&&c.url.includes('sendUpdates')).body.location,'https://telemost.yandex.ru/j/12345678901234');
 const listed=ui.rooms();assert.ok(listed.some(r=>r.kind==='telemost'&&r.manual),'typed links are remembered');
 calls=[];
 const card3=await draft('найди час с Олегом Ивановым завтра');
 await ui.create({draftId:card3.draftId,slot:0,video:'none'});
 const plain=calls.find(c=>c.method==='POST'&&c.url.includes('sendUpdates'));assert.equal(plain.body.location,undefined);assert.equal(plain.body.conferenceData,undefined);
 // A known room by key; rename and forget from settings.
 const key=listed.find(r=>r.kind==='telemost').key;
 assert.equal(ui.renameRoom(key,'Телемост команды').find(r=>r.key===key).name,'Телемост команды');
 calls=[];const card4=await draft('найди час с Олегом Ивановым завтра');
 await ui.create({draftId:card4.draftId,slot:0,video:{room:key}});
 assert.equal(calls.find(c=>c.method==='POST'&&c.url.includes('sendUpdates')).body.location,'https://telemost.yandex.ru/j/12345678901234');
 assert.ok(!ui.forgetRoom(key).some(r=>r.key===key));
 await assert.rejects(ui.create({draftId:(await draft('найди час с Олегом Ивановым завтра')).draftId,slot:0,video:{room:key}}),/больше не в списке/);
 // Outlook: a link goes to location and body, never isOnlineMeeting; Teams is the native patch.
 s.settings.gmailCredential='';
 s.settings.microsoftCredential=JSON.stringify({accounts:[{id:'m1',email:'me@corp.com',tokens:{scope:'https://graph.microsoft.com/Calendars.ReadWrite'}}]});
 routes=[[u=>u.endsWith('/getSchedule'),(u,o)=>json({value:JSON.parse(o.body).schedules.map(id=>({scheduleId:id,scheduleItems:[]}))})],[u=>u.includes('/calendarView?'),json({value:[]})],[u=>u==='https://graph.microsoft.com/v1.0/me/events',json({id:'ev',webLink:'https://outlook.office365.com/owa/?itemid=ev',onlineMeeting:{joinUrl:'https://teams.microsoft.com/l/meetup-join/ev'}})]];
 calls=[];const ms=await draft('найди час с Олегом Ивановым завтра');
 await ui.create({draftId:ms.draftId,slot:0,video:'zoom'});
 const graph=calls.find(c=>c.method==='POST'&&c.url.endsWith('/me/events')).body;
 assert.equal(graph.location.displayName,'https://us05web.zoom.us/j/9876543210?pwd=Ab12');assert.equal(graph.body.contentType,'text');assert.equal(graph.isOnlineMeeting,undefined);
 calls=[];const ms2=await draft('найди час с Олегом Ивановым завтра');
 const teamsMade=await ui.create({draftId:ms2.draftId,slot:0,video:'teams'});
 const graph2=calls.find(c=>c.method==='POST'&&c.url.endsWith('/me/events')).body;
 assert.equal(graph2.isOnlineMeeting,true);assert.equal(graph2.onlineMeetingProvider,'teamsForBusiness');assert.equal(teamsMade.created.link,'https://teams.microsoft.com/l/meetup-join/ev');
 await assert.rejects(ui.create({draftId:(await draft('найди час с Олегом Ивановым завтра')).draftId,slot:0,video:'google-meet'}),/не добавлено или не подключено/,'Meet is not offered for an Outlook calendar');
 const meet=require('../src/extensions/calendar/video-meet.cjs');
 const patch=await meet.run({},{calendar:'google'});assert.equal(patch.patch.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');assert.equal(patch.query.conferenceDataVersion,'1');
 await assert.rejects(meet.run({},{calendar:'microsoft'}),/Google Календаря/);

 room.installed=realInstalled;room.discover=realDiscover;
 // --- Local recording: fit, readiness and the scheduled start ---
 assert.equal(recording.fits({url:'https://us02web.zoom.us/j/1112223334'}),true);
 assert.equal(recording.fits({url:'https://meet.google.com/abc-defg-hij'}),false,'browser meetings are not captured');
 assert.equal(recording.ready({zoomBotMode:'off'}),false);assert.equal(recording.ready({zoomBotMode:'ask'}),true);
 let t=Date.parse(at(10,9,50));const notes=[];let started=0,meetingOpen=false;
 const rs={settings:{zoomBotMode:'ask',meetingRecordingSchedule:'[]'},saveSettings(v){const next={...rs.settings,...v};zoomBot.validate(next);rs.settings=next;},meetingRecording:async m=>{assert.equal(m,'startCapture');if(!meetingOpen)throw Error('Активная встреча Zoom не найдена.');started++;return {phase:'recording'};}};
 const plan=zoomBot.scheduler(rs,{now:()=>t,publish:n=>notes.push(n)});
 rs.meetingSchedule=plan;
 const out=await recording.run(rs,{when:'schedule',title:'Синк по релизу',start:at(10,10),end:at(10,11)},()=>{});
 assert.match(out.text,/Петя запишет встречу «Синк по релизу»/);
 assert.equal(plan.add({title:'Синк по релизу',start:at(10,10),end:at(10,11)}).id,out.scheduled.id,'a second press does not schedule twice');
 assert.equal(plan.list().length,1);assert.match(notes[0].text,/в 10:00/);assert.equal(notes[0].cancellable,out.scheduled.id);
 await plan.tick();assert.equal(started,0,'not before the start');
 t=Date.parse(at(10,10,0));await plan.tick();assert.equal(started,0);assert.match(notes.at(-1).text,/Жду встречу/);assert.equal(notes.at(-1).busy,true);
 const waiting=notes.length;await plan.tick();assert.equal(notes.length,waiting,'waiting is told once');
 meetingOpen=true;t+=60000;await plan.tick();assert.equal(started,1);assert.match(notes.at(-1).text,/записывает/);
 t+=60000;await plan.tick();assert.equal(started,1,'started once');
 t=Date.parse(at(10,11,1));await plan.tick();assert.equal(plan.list().length,0,'finished meetings leave the schedule');
 // Cancelled before the start; a meeting that never appeared is reported.
 const a=plan.add({title:'Ретро',start:at(11,10),end:at(11,11)});plan.cancel(a.id);assert.equal(plan.list().length,0);assert.match(notes.at(-1).text,/отменена/);
 assert.throws(()=>plan.cancel(a.id),/уже отменена/);
 meetingOpen=false;plan.add({title:'Демо',start:at(12,10),end:at(12,11)});t=Date.parse(at(12,10,5));await plan.tick();t=Date.parse(at(12,11,0));await plan.tick();
 assert.equal(notes.at(-1).kind,'error');assert.match(notes.at(-1).text,/не записана/);
 assert.throws(()=>plan.add({title:'Old',start:at(1,10),end:at(1,11)}),/закончилась/);
 assert.throws(()=>zoomBot.validate({zoomBotMode:'auto',zoomPersonalLink:'https://evil.com/j/1234567890'}),/личную комнату/);
 console.log('Calendar video: known rooms (distinct days, normalization, ranking, manual, rename/forget, private file), Zoom personal room (validation, discovery, question), Meet/Teams patches, Google/Graph link payloads, local recording fit and scheduled start passed');
})().catch(e=>{console.error(e);process.exit(1);});
