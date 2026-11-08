// Cross-app links registry: declarations in extension.json, readiness and context filtering, stable order,
// run with a re-check, unknown kinds/providers, and that listing never writes. Then the real providers.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const links=require('../src/features/app-links.cjs');
(async()=>{
 // A fake extensions folder.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-links-'));
 const ext=(id,json,files)=>{fs.mkdirSync(path.join(dir,id));fs.writeFileSync(path.join(dir,id,'extension.json'),JSON.stringify({id,name:id.toUpperCase(),...json}));for(const [f,src] of Object.entries(files))fs.writeFileSync(path.join(dir,id,f),src);};
 ext('asana',{provides:{'task-tracker':'t.cjs'}},{'t.cjs':"let n=0;module.exports={label:'В задачу Asana',ready:s=>s.asana==='1',async run(s,p){n++;s.calls.push(['asana',p]);return {ask:'A '+p.title,send:true};},get runs(){return n;}};"});
 ext('jira',{setting:'module_jira',provides:{'task-tracker':'t.cjs'}},{'t.cjs':"module.exports={label:'В задачу Jira',ready:s=>s.jira==='1',async run(s,p,check){check();s.calls.push(['jira',p]);return {ask:'J '+p.title,send:true};}};"});
 ext('aaa',{provides:{'task-tracker':'t.cjs'}},{'t.cjs':"module.exports={label:'В задачу AAA',ready:()=>true,run:async()=>({})};"});
 ext('cal',{provides:{'video-meeting':['meet.cjs','teams.cjs']}},{'meet.cjs':"module.exports={id:'google-meet',name:'Google Meet',label:'Google Meet',ready:()=>true,fits:c=>c.calendar==='google',run:async()=>({patch:{x:1}})};",'teams.cjs':"module.exports={id:'teams',label:'Teams',ready:()=>true,fits:c=>c.calendar==='microsoft',run:async()=>({})};"});
 ext('broken',{},{});
 const providers=links.load(dir);
 assert.deepEqual(providers.map(p=>p.kind+'/'+p.id),['video-meeting/google-meet','video-meeting/teams','task-tracker/jira','task-tracker/asana','task-tracker/aaa'],'known order first, others alphabetically');
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
 assert.deepEqual(ids('share-message'),['slack']);
 assert.deepEqual(ids('code-fix'),['coder']);
 const live={settings:{}};const reg=links.create(live,{providers:real});
 for(const kind of links.KINDS)assert.deepEqual(reg.available(kind),[],'nothing connected → nothing listed: '+kind);
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
