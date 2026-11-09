// «Запись экрана → баг»: routing and near-misses (meetings, screenshots, journal, decisions), the source choice
// (permission, previews, nothing recorded before the press), forged choices refused, the recording stubbed while the
// game's Editor.log grows (offset excerpt with context, masked secrets) and a time-stamped Player.log (by time),
// system info, the grounded draft (the model's text kept only with cited error lines, steps never from the model),
// the tracker hand-off and both attachments through screenshot-task's upload, and the upload's media types.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const app=require('../src/extensions/screen-bug/feature.cjs');
const unityLog=require('../src/extensions/screen-bug/unity-log.cjs');
const drafts=require('../src/extensions/screen-bug/draft.cjs');
const recorder=require('../src/extensions/screen-bug/recorder.cjs');
const attach=require('../src/extensions/screenshot-task/attach.cjs');
const shot=require('../src/extensions/screenshot-task/feature.cjs');

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------------
 for(const t of ['запиши баг','Запиши экран: инвентарь не открывается','запиши видео бага','сними экран','запись экрана для бага','баг по видео','запиши мне баг, пожалуйста'])assert.equal(app.intent(t),'start',t);
 assert.equal(app.intent('оформи баг по записи экрана'),'draft');assert.equal(app.intent('баг по последней записи'),'draft');
 assert.equal(app.intent('останови запись экрана'),'stop');
 for(const t of ['запиши встречу','запиши встречу в Zoom','скриншот в задачу','сделай баг из скриншота','заведи баг по этому экрану','запиши в дневник: идея с картой','запиши время в Jira','запиши решение: переходим на Addressables','запиши голосовое','как записать экран','запиши экран встречи','запиши звонок','скрин в задачу','запиши баг по этому экрану'])assert.equal(app.intent(t),null,t);
 // Screenshots stay with «Скриншот → задача», and it does not take «запиши баг».
 assert.ok(shot.wanted('сделай баг из скриншота'));assert.ok(!shot.wanted('запиши баг'));assert.ok(!shot.wanted('запиши экран'));
 assert.equal(app.noteIn('Запиши экран: инвентарь не открывается'),'инвентарь не открывается');
 console.log('Screen bug routing: start, draft, stop, near-misses for meetings, screenshots, journal, decisions and voice passed');

 // --- Logs ---------------------------------------------------------------------------------------------------------------
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'petya-sbug-'));
 const editor=path.join(home,'Library','Logs','Unity','Editor.log');fs.mkdirSync(path.dirname(editor),{recursive:true});
 const player=path.join(home,'Library','Logs','Wombyte','Bunker Wars','Player.log');fs.mkdirSync(path.dirname(player),{recursive:true});
 fs.writeFileSync(player,'старый');fs.utimesSync(player,new Date(Date.now()-86400000),new Date(Date.now()-86400000));
 fs.writeFileSync(editor,'Unity Editor version:    2022.3.21f1 (abc)\n'+Array.from({length:40},(_,i)=>'Loading asset '+i).join('\n')+'\n');
 const found=unityLog.candidates({platform:'darwin',home});
 assert.deepEqual(found.map(f=>[f.label,f.kind]),[['Unity Editor','editor'],['Wombyte / Bunker Wars','player']],'newest first');
 assert.equal(unityLog.candidates({platform:'win32',home:'C:\\Users\\me',env:{LOCALAPPDATA:path.join(home,'nope')}}).length,0);
 assert.equal(unityLog.unityVersion(editor),'2022.3.21f1');
 assert.equal(unityLog.level('NullReferenceException: Object reference not set'),'error');
 assert.equal(unityLog.level('Warning: Shader fallback'),'warning');
 assert.equal(unityLog.level('UnityEngine.Debug:Log (object)'),'trace');
 console.log('Screen bug logs: Editor.log and Player.log found newest first, Unity version, levels passed');

 // --- The choice and the recording ---------------------------------------------------------------------------------------
 const ud=path.join(home,'userData');
 const topic={id:'t',title:'Чат',messages:[]};
 const sent=[];
 const settings={'extension_screen-bug':'true',model:'',jiraUrl:'https://acme.atlassian.net'};
 const s={settings,requestProgress:{report(){}},win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(ch,item)=>sent.push(item)}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c,at:Date.now()},{role:'assistant',text,at:Date.now()});}}};
 const thumb={isEmpty:()=>false,toJPEG:()=>Buffer.from('jpeg')};
 const sources=[{id:'screen:1:0',name:'Entire Screen',thumbnail:thumb},{id:'window:42:0',name:'Bunker Wars',thumbnail:thumb},{id:'window:43:0',name:'Rider — Inventory.cs',thumbnail:{isEmpty:()=>true}}];
 let permission=false,recordings=[];
 Object.assign(app.deps,{userData:()=>ud,home:()=>home,platform:()=>'darwin',env:()=>({}),permission:async()=>permission,sources:async()=>sources,
  system:async unity=>[{label:'Система',value:'macOS 15.1 · arm64'},{label:'Unity',value:unity}],
  record:async options=>{let resolve;const done=new Promise(r=>{resolve=r;});const rec={options,stop:()=>rec.finish('stop'),done,finish:(reason='stop')=>{fs.writeFileSync(options.file,Buffer.alloc(4096,1));resolve({file:options.file,bytes:4096,duration:47000,poster:'data:image/jpeg;base64,AAAA',reason});}};recordings.push(rec);return rec;}});
 assert.equal(await app.turn({...s,settings:{}},'запиши баг'),null,'not added → null');
 let r=await app.turn(s,'запиши баг: инвентарь не открывается после покупки, должно открыться окно сундука');
 assert.equal(r.question,true);assert.match(r.text,/разрешите Пете запись экрана/);
 assert.equal(recordings.length,0,'nothing recorded without the permission');
 permission=true;
 r=await app.turn(s,'запиши баг: инвентарь не открывается после покупки, должно открыться окно сундука');
 const pick=r.extensionData.screenBug;
 assert.equal(pick.stage,'pick');assert.equal(recordings.length,0,'never silent: nothing recorded before «Начать запись»');
 assert.deepEqual(pick.sources.map(x=>[x.kind,x.name]),[['screen','Экран 1'],['window','Bunker Wars'],['window','Rider — Inventory.cs']]);
 assert.equal(pick.sources[0].thumb,'data:image/jpeg;base64,'+Buffer.from('jpeg').toString('base64'));assert.equal(pick.sources[2].thumb,'');
 assert.equal(pick.logs[0].file,editor);assert.equal(pick.max,120000);
 assert.match(r.text,/запись начнётся только после «Начать запись»/);
 const ipc=app.setup(s).ipc;
 await assert.rejects(ipc.start('nope','window:42:0',{}),/устарел/);
 await assert.rejects(ipc.start(pick.pick,'window:99:0',{}),/недоступно/);
 await assert.rejects(ipc.start(pick.pick,'window:42:0',{log:path.join(home,'secret.log')}),/не из списка/);
 // Start: the log grows meanwhile (Unity's own lines, no time), with a token in one of them.
 const token=['gh','p_',crypto.randomBytes(18).toString('hex')].join('');
 const started=await ipc.start(pick.pick,'window:42:0',{log:editor,logLabel:'Unity Editor',system:true});
 assert.equal(started.max,120000);assert.equal(recordings.length,1);assert.equal(recordings[0].options.source.id,'window:42:0');
 assert.ok(sent.some(n=>n.id==='screen-bug-recording'&&n.busy),'recording in the notification center');
 assert.equal((await app.turn(s,'запиши баг')).text,'Уже идёт запись экрана — нажмите «Стоп» в окошке записи.');
 await assert.rejects(ipc.start(pick.pick,'window:42:0',{}),/Уже идёт запись/);
 fs.appendFileSync(editor,['Purchase completed: chest_gold','Opening inventory','NullReferenceException: Object reference not set to an instance of an object','  at InventoryView.Open () [0x00012] in Assets/UI/InventoryView.cs:88','auth header '+token,'Warning: UI atlas rebuilt'].join('\n')+'\n');
 assert.deepEqual(ipc.stop(),{stopped:true});
 for(let i=0;i<100&&!sent.some(n=>n.ready);i++)await new Promise(r=>setTimeout(r,10));
 const ready=sent.find(n=>n.ready);assert.match(ready.text,/^Запись готова \(0:47\)/);assert.equal(ipc.status().active,null);
 const id=ready.recording;
 const meta=JSON.parse(fs.readFileSync(path.join(ud,'screen-bug',id+'.json'),'utf8'));
 assert.equal(meta.log.mode,'offset');
 const during=meta.log.lines.filter(l=>l.during);
 assert.equal(during.length,6);assert.equal(meta.log.lines.filter(l=>!l.during).length,30,'30 lines of context before');
 assert.equal(meta.log.errors,1);assert.equal(meta.log.warnings,1);assert.equal(meta.log.hidden,1);
 assert.ok(!JSON.stringify(meta).includes(token),'the token is masked');
 assert.ok(!fs.readFileSync(path.join(ud,'screen-bug',id+'.log.txt'),'utf8').includes(token));
 assert.match(fs.readFileSync(path.join(ud,'screen-bug',id+'.log.txt'),'utf8'),/NullReferenceException/);
 assert.deepEqual(meta.system,[{label:'Система',value:'macOS 15.1 · arm64'},{label:'Unity',value:'2022.3.21f1'}]);
 console.log('Screen bug recording: permission first, a choice before any recording, forged choices refused, one at a time, log excerpt with context and masked secrets, system info passed');

 // --- The draft ------------------------------------------------------------------------------------------------------------
 // Without a model: the user's note is the title, the first error is «actual», steps empty unless the note has them.
 r=await app.turn(s,'оформи баг по записи экрана');
 let card=r.extensionData.screenBug;
 assert.equal(card.stage,'report');assert.equal(card.duration,47000);assert.equal(card.poster,'data:image/jpeg;base64,AAAA');
 assert.equal(card.draft.title,'Инвентарь не открывается после покупки');assert.equal(card.draft.expected,'открыться окно сундука');
 assert.deepEqual(card.draft.steps,[]);assert.match(card.draft.actual,/^В логе: NullReferenceException/);assert.equal(card.draft.model,false);
 assert.match(card.video.name,/^bug-Bunker-Wars-[0-9a-f]{8}\.webm$/);assert.equal(card.log.name.replace(/\.log\.txt$/,'.webm'),card.video.name);
 // With a model: kept only when it cites existing error/warning lines; steps from the model are never used.
 const errorLine=meta.log.lines.find(l=>l.level==='error').n;
 let answer={title:'Ошибка инвентаря',actual:'В логе NullReferenceException в InventoryView.Open при открытии инвентаря.',lines:[errorLine,999],steps:['придуманный шаг']};
 const ms={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},async request(url,o){const body=JSON.parse(o.body);assert.match(body.messages[0].content,/Не придумывай шаги/);assert.ok(body.messages[1].content.includes('NullReferenceException'));return {message:{content:JSON.stringify(answer)}};}};
 let d=await drafts.draft(ms,{lines:meta.log.lines,note:'',window:'Bunker Wars'});
 assert.equal(d.model,true);assert.deepEqual(d.evidence,[errorLine]);assert.equal(d.title,'Ошибка инвентаря');assert.deepEqual(d.steps,[]);
 answer={title:'Выдумка',actual:'Игрок нажал кнопку магазина и всё упало.',lines:[3]};
 d=await drafts.draft(ms,{lines:meta.log.lines,note:'',window:'Bunker Wars'});
 assert.equal(d.model,false,'no cited error line → the model text is dropped');assert.match(d.title,/^NullReferenceException: Object reference/);
 d=await drafts.draft(ms,{lines:[{n:1,text:'Loading',level:'info',during:true}],note:'шаги: открыть магазин, купить сундук, открыть инвентарь'});
 assert.deepEqual(d.steps,['открыть магазин','купить сундук','открыть инвентарь'],'the user\'s own steps');assert.equal(d.model,false,'no error lines → no model call');
 assert.equal((await drafts.draft({settings:{}},{lines:[],note:'',window:'Bunker Wars'})).title,'Баг: Bunker Wars');
 r=await app.turn(s,'оформи баг по записи экрана');assert.equal(r.extensionData.screenBug.id,id,'the newest recording again');
 console.log('Screen bug draft: the note and the first error without a model, model text only with cited lines, steps only from the user passed');

 // --- Hand-off and attachments ------------------------------------------------------------------------------------------------
 assert.deepEqual(ipc.handoff(id,'jira'),{attachable:true});assert.deepEqual(ipc.handoff(id,'slack'),{attachable:false});
 topic.messages.push({role:'assistant',text:'Задача создана: https://acme.atlassian.net/browse/BW-77',at:Date.now()});
 assert.deepEqual(ipc.recent(id).map(x=>x.key),['BW-77']);
 const uploads=[];const original=attach.upload;
 attach.upload=async(svc,args)=>{uploads.push({...args,bytes:fs.statSync(args.file).size});return {provider:'jira',key:args.key,name:args.name,url:'https://acme.atlassian.net/browse/'+args.key};};
 let done=await ipc.attach(id,'jira','BW-77',{video:true,log:true});
 assert.equal(done.text,'Запись и лог прикреплены к BW-77.');
 assert.deepEqual(uploads.map(u=>[u.type,u.key,u.bytes>0]),[['video/webm','BW-77',true],['text/plain','BW-77',true]]);
 done=await ipc.attach(id,'jira','https://acme.atlassian.net/browse/BW-78',{video:false,log:true});assert.equal(done.text,'Лог прикреплён к BW-78.');
 await assert.rejects(ipc.attach(id,'jira','BW-77',{video:false,log:false}),/Нечего прикреплять/);
 await assert.rejects(ipc.attach(id,'jira','не ключ',{}),/ключ задачи Jira/);
 await assert.rejects(ipc.attach('../../etc','jira','BW-1',{}),/не найдена/);
 attach.upload=original;
 // The shared upload: the media type goes into the form; images keep their 20 MB limit, others 100 MB.
 const form=[];const svc={settings:{jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token'},modules:{enabled:()=>true},async request(url,o){form.push({url,file:o.body.get('file')});return [{id:'1',filename:o.body.get('file').name}];}};
 const video=path.join(ud,'screen-bug',id+'.webm');
 const up=await attach.upload(svc,{provider:'jira',key:'BW-77',file:video,name:'bug.webm',type:'video/webm'});
 assert.equal(up.name,'bug.webm');assert.equal(form[0].file.type,'video/webm');assert.equal(form[0].url,'https://acme.atlassian.net/rest/api/3/issue/BW-77/attachments');
 const empty=path.join(home,'empty.webm');fs.writeFileSync(empty,'');
 await assert.rejects(attach.upload(svc,{provider:'jira',key:'BW-1',file:empty,name:'x.webm',type:'video/webm'}),/Файл пустой или больше 100 МБ/);
 await assert.rejects(attach.upload(svc,{provider:'jira',key:'BW-1',file:empty,name:'x.png'}),/Картинка пустая/);
 console.log('Screen bug attachments: hand-off, the created task found in the chat, video and log uploads with their media types, refusals passed');

 // --- A time-stamped Player.log ---------------------------------------------------------------------------------------------
 const t0=Date.parse('2026-11-09T12:00:00');
 const stamp=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+[d.getHours(),d.getMinutes(),d.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':');};
 fs.writeFileSync(player,[[-120,'Boot'],[-40,'Menu opened'],[-20,'Shop opened'],[5,'Purchase chest_gold'],[12,'Error: inventory view missing'],[30,'Warning: slow frame 120ms'],[90,'after the recording']].map(([s,t])=>stamp(t0+s*1000)+' '+t).join('\n')+'\n');
 const x=unityLog.excerpt(player,{offset:0,started:t0,stopped:t0+47000,seconds:30});
 assert.equal(x.mode,'time');
 assert.deepEqual(x.lines.map(l=>[l.text.slice(20),l.during]),[['Shop opened',false],['Purchase chest_gold',true],['Error: inventory view missing',true],['Warning: slow frame 120ms',true]]);
 assert.equal(x.lines[2].t,t0+12000);
 assert.equal(unityLog.timeOf('[12:00:07] Spawned',t0),t0+7000);
 // A restarted Editor (smaller file than at the start) is read whole as «during».
 fs.writeFileSync(editor,'fresh session\nError: boom\n');
 const restarted=unityLog.excerpt(editor,{offset:10000,started:Date.now(),seconds:30});
 assert.deepEqual(restarted.lines.map(l=>l.during),[true,true]);
 console.log('Screen bug time-stamped logs: lines by time from 30 s before the start, restarted Editor.log passed');

 // --- The control window's labels arrive translated ------------------------------------------------------------------------------
 const h=new URLSearchParams(recorder.hash({t:v=>'['+v+']'}));
 assert.equal(h.get('stop'),'[Стоп]');assert.equal(h.get('title'),'[Запись экрана для бага]');
 assert.equal(recorder.MAX_MS,120000);
 fs.rmSync(home,{recursive:true,force:true});
 console.log('Screen bug recorder: 2-minute cap, translated control labels passed');
})().catch(e=>{console.error(e);process.exit(1);});
