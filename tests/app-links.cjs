// Cross-app links registry: declarations in extension.json, readiness and context filtering, stable order,
// run with a re-check, unknown kinds/providers, and that listing never writes. Then the real providers.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const links=require('../src/features/app-links.cjs');
(async()=>{
 // A fake extensions folder.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-links-'));
 const ext=(id,json,files)=>{fs.mkdirSync(path.join(dir,id));fs.writeFileSync(path.join(dir,id,'extension.json'),JSON.stringify({id,name:id.toUpperCase(),...json}));for(const [f,src] of Object.entries(files))fs.writeFileSync(path.join(dir,id,f),src);};
 ext('asana',{provides:{'task-tracker':'t.cjs'}},{'t.cjs':"let n=0;module.exports={label:'В задачу Asana',order:20,ready:s=>s.asana==='1',async run(s,p){n++;s.calls.push(['asana',p]);return {ask:'A '+p.title,send:true};},get runs(){return n;}};"});
 ext('jira',{setting:'module_jira',provides:{'task-tracker':'t.cjs'}},{'t.cjs':"module.exports={label:'В задачу Jira',order:10,ready:s=>s.jira==='1',async run(s,p,check){check();s.calls.push(['jira',p]);return {ask:'J '+p.title,send:true};}};"});
 ext('aaa',{provides:{'task-tracker':'t.cjs'}},{'t.cjs':"module.exports={label:'В задачу AAA',ready:()=>true,run:async()=>({})};"});
 ext('cal',{provides:{'video-meeting':['meet.cjs','teams.cjs']}},{'meet.cjs':"module.exports={id:'google-meet',name:'Google Meet',label:'Google Meet',order:20,ready:()=>true,fits:c=>c.calendar==='google',run:async()=>({patch:{x:1}})};",'teams.cjs':"module.exports={id:'teams',label:'Teams',order:30,ready:()=>true,fits:c=>c.calendar==='microsoft',run:async()=>({})};"});
 ext('broken',{},{});
 const providers=links.load(dir);
 assert.deepEqual(providers.map(p=>p.kind+'/'+p.id),['video-meeting/google-meet','video-meeting/teams','task-tracker/jira','task-tracker/asana','task-tracker/aaa'],'providers\' own order first, others alphabetically');
 // A meeting source is declared the same way but served by its own registry, never as a card button.
 ext('meet-app',{setting:'extension_meet_app',provides:{'meeting-source':'source.cjs','video-meeting':'room.cjs'}},{'source.cjs':"module.exports={detect:()=>({active:false})};",'room.cjs':"module.exports={id:'meet-app',label:'Комната',order:5,ready:()=>true,run:async()=>({}),recognizeLink:u=>u.startsWith('https://meetapp.example/r/')?{key:'meet-app:'+u.split('/r/')[1],url:u}:null};"});
 assert.deepEqual(links.load(dir).filter(p=>p.kind==='video-meeting').map(p=>p.id),['meet-app','google-meet','teams']);
 assert.deepEqual(links.scan(dir).filter(x=>x.kind==='meeting-source').map(x=>x.extension),['meet-app']);
 {const st={settings:{}},reg=links.create(st,{providers:links.load(dir)});
  // Which service a link belongs to: only providers of added apps are asked.
  assert.equal(reg.recognize('https://meetapp.example/r/42'),null,'app not added');
  st.settings.extension_meet_app='true';
  assert.deepEqual(reg.recognize('https://meetapp.example/r/42'),{kind:'meet-app',key:'meet-app:42',url:'https://meetapp.example/r/42',name:'MEET-APP'});
  assert.equal(reg.recognize('https://other.example/r/42'),null);}
 fs.rmSync(path.join(dir,'meet-app'),{recursive:true});
 const settings={asana:'1',jira:'1',module_jira:'false'},calls=[];
 const s={settings,calls};
 const r=links.create(s,{providers});
 // Jira is connected but its app switch is off: never listed.
 assert.deepEqual(r.available('task-tracker').map(p=>p.id),['asana','aaa']);
 settings.module_jira='true';
 assert.deepEqual(r.available('task-tracker').map(p=>[p.id,p.label]),[['jira','В задачу Jira'],['asana','В задачу Asana'],['aaa','В задачу AAA']]);
 settings.asana='0';assert.deepEqual(r.available('task-tracker').map(p=>p.id),['jira','aaa'],'not connected → not listed');
 assert.equal(calls.length,0,'listing never runs a provider');
 assert.deepEqual(r.available('video-meeting',{calendar:'google'}).map(p=>p.id),['google-meet']);
 assert.deepEqual(r.available('video-meeting',{calendar:'microsoft'}).map(p=>p.id),['teams']);
 assert.deepEqual(r.available('video-meeting').map(p=>p.id),[],'calendar-bound providers need their calendar');
 assert.deepEqual(r.available('share-message'),[]);
 // Run: only a listed, ready provider; unknown kinds and ids are errors.
 assert.deepEqual(await r.run('task-tracker','jira',{title:'Крэш'}),{ask:'J Крэш',send:true});
 assert.deepEqual(calls,[['jira',{title:'Крэш'}]]);
 await assert.rejects(r.run('task-tracker','asana',{title:'x'}),/не добавлено или не подключено/);
 await assert.rejects(r.run('task-tracker','trello',{}),/Такого приложения/);
 await assert.rejects(r.run('teleport','jira',{}),/Неизвестный вид/);
 assert.throws(()=>r.available('teleport'),/Неизвестный вид/);
 assert.equal(calls.length,1,'failed runs write nothing');
 // A provider re-checks before writing: a connection lost meanwhile stops it.
 const late=links.create({settings:{jira:'1',module_jira:'true'},calls:[]},{providers});
 const p=providers.find(x=>x.id==='jira');const original=p.provider.run;
 p.provider.run=async(svc,payload,check)=>{svc.settings.jira='0';check();return {};};
 await assert.rejects(late.run('task-tracker','jira',{title:'x'}),/изменилось/);p.provider.run=original;
 // prepare(): only providers with prepareEvent, the event's calendar kept.
 {const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'petya-links-prep-'));fs.mkdirSync(path.join(dir2,'v'));
  fs.writeFileSync(path.join(dir2,'v','extension.json'),JSON.stringify({id:'v',setting:'extension_v',provides:{'video-meeting':['a.cjs','b.cjs']}}));
  fs.writeFileSync(path.join(dir2,'v','a.cjs'),"module.exports={id:'a',label:'A',ready:()=>true,run:async()=>({native:true}),prepareEvent:e=>({...e,body:{...e.body,a:1}})};");
  fs.writeFileSync(path.join(dir2,'v','b.cjs'),"module.exports={id:'b',label:'B',ready:()=>true,run:async()=>({native:true}),prepareEvent:e=>({...e,calendar:'other'})};");
  const st={settings:{extension_v:'true'}},rr=links.create(st,{providers:links.load(dir2)});
  const before={calendar:'google',body:{x:1},query:{q:'1'}};
  assert.deepEqual(await rr.prepare('video-meeting','a',before),{calendar:'google',body:{x:1,a:1},query:{q:'1'}});
  assert.deepEqual(before.body,{x:1},'the caller\'s event is not changed in place');
  await assert.rejects(rr.prepare('video-meeting','b',before),/не подготовило/);
  st.settings.extension_v='false';await assert.rejects(rr.prepare('video-meeting','a',before),/не добавлено/);
  fs.writeFileSync(path.join(dir2,'v','b.cjs'),"module.exports={id:'b',label:'B',ready:()=>true,run:async()=>({}),prepareEvent:'x'};");
  delete require.cache[path.join(dir2,'v','b.cjs')];
  assert.throws(()=>links.load(dir2),/Invalid capability provider/,'prepareEvent must be a function');
  fs.rmSync(dir2,{recursive:true,force:true});}
 // Invalid declarations are refused.
 const bad=fs.mkdtempSync(path.join(os.tmpdir(),'petya-links-bad-'));fs.mkdirSync(path.join(bad,'x'));
 fs.writeFileSync(path.join(bad,'x','extension.json'),JSON.stringify({id:'x',provides:{'teleport':'a.cjs'}}));
 assert.throws(()=>links.load(bad),/Unknown capability/);
 fs.writeFileSync(path.join(bad,'x','extension.json'),JSON.stringify({id:'x',provides:{'code-fix':'missing.cjs'}}));
 assert.throws(()=>links.load(bad),/Invalid capability provider/);

 // The real declarations.
 const real=links.load();
 const ids=kind=>real.filter(p=>p.kind===kind).map(p=>p.id);
 assert.deepEqual(ids('task-tracker'),['jira','asana']);
 assert.deepEqual(ids('share-message'),['discord','slack']);
 assert.deepEqual(ids('code-fix'),['coder']);
 const live={settings:{}};const reg=links.create(live,{providers:real});
 for(const kind of ['task-tracker','share-message','code-fix'])assert.deepEqual(reg.available(kind),[],'nothing connected → nothing listed: '+kind);
 // Scheduled recording of Zoom events comes with the Zoom extension: nothing until it is added, then listed while
 // recording is not switched to manual, for Zoom links only.
 assert.deepEqual(reg.available('meeting-recording'),[],'Zoom not added');
 live.settings.extension_zoom='true';
 assert.deepEqual(reg.available('meeting-recording').map(p=>[p.id,p.label]),[['zoom','Записать Петей']]);
 assert.deepEqual(reg.available('meeting-recording',{url:'https://meet.google.com/abc-defg-hij'}),[]);
 live.settings.meetingAutoRecord='off';assert.deepEqual(reg.available('meeting-recording'),[]);delete live.settings.meetingAutoRecord;
 assert.deepEqual(reg.recognize('https://us02web.zoom.us/j/1234567890?pwd=x'),{kind:'zoom',key:'zoom:1234567890',url:'https://us02web.zoom.us/j/1234567890?pwd=x',name:'Zoom'});
 live.settings.extension_zoom='false';assert.equal(reg.recognize('https://us02web.zoom.us/j/1234567890'),null,'nobody else knows Zoom links');
 assert.deepEqual(ids('video-meeting'),['zoom','google-meet','teams']);
 assert.deepEqual(ids('meeting-recording'),['zoom','google-meet','teams']);
 // Meet and Teams are their own extensions: their links, recordings and video calls only while each is added.
 assert.equal(reg.recognize('https://meet.google.com/abc-defg-hij'),null,'nobody knows Meet links without «Google Meet»');
 live.settings['extension_google-meet']='true';
 assert.deepEqual(reg.recognize('https://meet.google.com/ABC-defg-hij/?authuser=0'),{kind:'meet',key:'meet:abc-defg-hij',url:'https://meet.google.com/abc-defg-hij',name:'Google Meet'});
 assert.deepEqual(reg.available('meeting-recording',{url:'https://meet.google.com/abc-defg-hij'}).map(p=>p.id),['google-meet']);
 assert.deepEqual(reg.available('meeting-recording',{url:'https://teams.microsoft.com/l/meetup-join/19%3ameeting_X%40thread.v2/0'}),[],'Teams not added');
 live.settings.extension_teams='true';
 assert.deepEqual(reg.available('meeting-recording',{url:'https://teams.microsoft.com/l/meetup-join/19%3ameeting_X%40thread.v2/0'}).map(p=>p.id),['teams']);
 assert.deepEqual(reg.available('meeting-recording',{url:'https://us02web.zoom.us/j/1234567890'}),[],'Zoom not added: nobody records Zoom links');
 assert.equal(reg.recognize('https://teams.live.com/meet/9387162534?p=abcd').name,'Microsoft Teams');
 // Their video calls need a calendar account of the right kind, and the calendar extension.
 assert.deepEqual(reg.available('video-meeting',{calendar:'google'}),[],'no Google calendar account');
 live.settings.extension_calendar='true';
 live.settings.gmailCredential=JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope:'https://www.googleapis.com/auth/calendar'}}]});
 live.settings.microsoftCredential=JSON.stringify({accounts:[{id:'m1',email:'me@outlook.com',tokens:{scope:'Calendars.ReadWrite'}}]});
 assert.deepEqual(reg.available('video-meeting',{calendar:'google'}).map(p=>p.id),['google-meet']);
 assert.deepEqual(reg.available('video-meeting',{calendar:'microsoft'}),[],'a personal Microsoft account: no Teams');
 live.settings.microsoftCredential=JSON.stringify({accounts:[{id:'m1',email:'me@outlook.com',tokens:{scope:'Calendars.ReadWrite'}},{id:'m2',email:'me@corp.com',tokens:{scope:'Calendars.ReadWrite'}}]});
 assert.deepEqual(reg.available('video-meeting',{calendar:'microsoft',account:{kind:'work'}}).map(p=>p.id),['teams']);
 assert.deepEqual(reg.available('video-meeting',{calendar:'microsoft',account:{kind:'personal'}}),[],'not for the personal account\'s events');
 live.settings.extension_calendar='false';assert.deepEqual(reg.available('video-meeting',{calendar:'google'}),[],'the calendar removed: no Meet');live.settings.extension_calendar='true';
 // prepareEvent: the provider adds its fields to the calendar's request; the calendar names no service.
 const g=await reg.prepare('video-meeting','google-meet',{calendar:'google',body:{summary:'Синк'},query:{sendUpdates:'all'}},{account:{provider:'google'}});
 assert.equal(g.body.summary,'Синк');assert.equal(g.body.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');assert.match(g.body.conferenceData.createRequest.requestId,/^[0-9a-f-]{36}$/);
 assert.deepEqual(g.query,{sendUpdates:'all',conferenceDataVersion:'1'});
 const m=await reg.prepare('video-meeting','teams',{calendar:'microsoft',body:{subject:'Синк'},query:{}},{account:{provider:'microsoft',kind:'work'}});
 assert.deepEqual(m.body,{subject:'Синк',isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness'});
 await assert.rejects(reg.prepare('video-meeting','teams',{calendar:'microsoft',body:{},query:{}},{account:{kind:'personal'}}),/рабочем или учебном/);
 await assert.rejects(reg.prepare('video-meeting','google-meet',{calendar:'microsoft',body:{},query:{}}),/Google Календаря/);
 await assert.rejects(reg.prepare('video-meeting','zoom',{calendar:'google',body:{},query:{}}),/Такого приложения/,'Zoom has no prepareEvent');
 assert.deepEqual(await reg.run('video-meeting','google-meet',{calendar:'google'}),{provider:'google-meet',native:true});
 await assert.rejects(reg.run('video-meeting','teams',{calendar:'microsoft',account:{kind:'personal'}}),/рабочем или учебном/);
 live.settings['extension_google-meet']='false';
 await assert.rejects(reg.prepare('video-meeting','google-meet',{calendar:'google',body:{},query:{}}),/не добавлено/,'removed meanwhile: nothing is added to the event');
 for(const k of ['extension_teams','extension_calendar','gmailCredential','microsoftCredential'])delete live.settings[k];
 Object.assign(live.settings,{module_jira:'true',jiraUrl:'https://acme.atlassian.net',atlassianCredential:'c',module_asana:'true',asanaCredential:'a',asanaWorkspace:'123',module_slack:'true',slackCredential:'s',extension_coder:'true'});
 assert.deepEqual(reg.available('task-tracker').map(p=>p.id),['jira','asana']);
 const task={title:'Крэш PROJ-1 — NullReferenceException',description:'120 событий за неделю',link:'https://sentry.io/i/1',type:'bug'};
 assert.deepEqual(await reg.run('task-tracker','jira',task),{ask:'Создай задачу в Jira: Баг. Крэш PROJ-1 — NullReferenceException. 120 событий за неделю. Ссылка: https://sentry.io/i/1',send:true});
 assert.match((await reg.run('task-tracker','asana',{...task,link:'javascript:alert(1)'})).ask,/^Создай задачу в Asana: Баг\. Крэш PROJ-1 — NullReferenceException\. 120 событий за неделю$/);
 await assert.rejects(reg.run('task-tracker','jira',{title:'  '}),/Нет названия/);
 assert.deepEqual(await reg.run('share-message','slack',{text:'посмотреть упавшую сборку main #12'}),{ask:'Попроси команду посмотреть упавшую сборку main #12',send:true});
 assert.equal((await reg.run('code-fix','coder',{text:'Исправь баг в коде — крэш в Player.cs'})).ask,'Исправь баг в коде — крэш в Player.cs');
 assert.match((await reg.run('code-fix','coder',{text:'Падает вход после обновления'})).ask,/^Как программист, исправь в коде проекта: /);
 live.settings.module_jira='false';assert.deepEqual(reg.available('task-tracker').map(p=>p.id),['asana']);
 // The Slack request is understood by the team request flow and never names a channel by itself.
 assert.deepEqual(require('../src/slack-request.cjs').parse('Попроси команду посмотреть упавшую сборку main #12'),{target:'',literal:false,recipientRole:'',text:'Коллеги, просьба: посмотреть упавшую сборку main #12'});
 assert.equal(require('../src/extensions/coder/intent.cjs').isCoding('Как программист, исправь в коде проекта: Падает вход после обновления'),true);
 console.log('App links: declarations, readiness and context filters, stable order, run with re-check, unknown kinds/providers, no write on listing, Jira/Asana/Slack/Programmer requests passed');
})().catch(e=>{console.error(e);process.exit(1);});
