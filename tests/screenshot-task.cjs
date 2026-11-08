// «Скриншот → задача»: phrases and near-misses, the note, shortcut validation and conflicts, the shortcut's global
// registration with a fake globalShortcut, the chat turn with a stubbed region capture (cancel, permission, the
// shot the shortcut already took), the vision draft (model choice, image in the request, no model → download
// offer), the editor's save, the hand-off and attaching the picture to the created Jira/Asana task through their
// REST APIs (stubbed), region math, the front window, and the offer gate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const app=require('../src/extensions/screenshot-task/feature.cjs');
const vision=require('../src/extensions/screenshot-task/vision.cjs');
const attach=require('../src/extensions/screenshot-task/attach.cjs');
const capture=require('../src/extensions/screenshot-task/capture.cjs');
const {activeWindow,label}=require('../src/extensions/screenshot-task/active-window.cjs');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-shot-'));
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(200,7)]);
(async()=>{
 // Phrases.
 for(const p of ['сделай баг из скриншота','скрин в задачу','заведи баг по этому экрану','создай задачу по скрину','сделай баг из скриншота: кнопка «Купить» не нажимается','скриншот в джиру','оформи тикет из скриншота'])assert.equal(app.wanted(p),true,p);
 for(const p of ['сделай скриншот','сделай скриншот слака','скриншоты стора','обнови скриншоты в App Store','баг в коде','почини баг в коде','заведи баг','создай задачу в Jira: падает логин','как сделать баг из скриншота?','привет'])assert.equal(app.wanted(p),false,p);
 assert.equal(app.noteIn('сделай баг из скриншота: кнопка не нажимается'),'кнопка не нажимается');assert.equal(app.noteIn('скрин в задачу'),'');
 // Shortcut values.
 assert.equal(app.normalize('cmdorctrl+shift+2'),'CommandOrControl+Shift+2');assert.equal(app.normalize('Shift+Alt+s'),'Alt+Shift+S');assert.equal(app.normalize(''),'');
 assert.throws(()=>app.normalize('Shift+2'),/кроме Shift/);assert.throws(()=>app.normalize('Ctrl+Shift+Enter'),/модификатор/);
 assert.match(app.conflict('CommandOrControl+Shift+F12'),/управление компьютером/);assert.match(app.conflict('CommandOrControl+Shift+4'),/macOS/);assert.equal(app.conflict(app.DEFAULT_SHORTCUT),'','the default is free');
 const next={screenshotTaskShortcut:'Ctrl+Shift+F12'.replace('Ctrl','CommandOrControl')};app.validate(next);assert.equal(next.screenshotTaskShortcut,app.DEFAULT_SHORTCUT,'a reserved combination falls back to the default');
 const bad={screenshotTaskShortcut:'nonsense'};app.validate(bad);assert.equal(bad.screenshotTaskShortcut,app.DEFAULT_SHORTCUT);

 // Services.
 const topic={id:'t',title:'Чат',messages:[]};
 const requests=[];let modelAnswer=null,uploads=[];
 const s={settings:{model:'qwen3.5:9b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},win:null,modules:{enabled:()=>true},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c,at:Date.now()},{role:'assistant',text,at:Date.now()});},state:{topics:[topic]}},
  optionalModels:{catalog:[{name:'gemma3:4b',size:3.3e9,vision:true}],installed:async()=>installed,download:name=>{requests.push(['download',name]);return {started:true,model:name};}},
  saveSettings(patch){Object.assign(s.settings,patch);},
  async request(url,options){
   if(String(url).includes('11434')){const body=JSON.parse(options.body);requests.push(['model',body]);return {message:{content:JSON.stringify(modelAnswer)}};}
   uploads.push([url,options]);
   if(url.includes('atlassian')||url.includes('/rest/api/3/'))return [{id:'10001',filename:options.body.get('file').name}];
   if(url.startsWith('https://app.asana.com/'))return {data:{gid:'99',name:options.body.get('file').name,parent:{permalink_url:'https://app.asana.com/0/1/555'}}};
   throw Error('unexpected '+url);}};
 let installed=['qwen3.5:9b'];
 app.deps.userData=()=>root;app.deps.smoke=()=>true;app.deps.forModel=file=>{assert.ok(fs.existsSync(file));return 'QkFTRTY0';};
 let captures=0,next0=null;
 app.deps.capture=async opts=>{captures++;assert.equal(typeof opts.context,'function','the front window is read after Petya steps aside');const r=next0;next0=null;return r||{png:PNG,width:1280,height:720,window:{app:'Safari',title:'Оформление заказа'}};};

 assert.equal(await app.turn(s,'сделай баг из скриншота'),null,'not added: the offer handles it');
 s.settings['extension_screenshot-task']='true';
 assert.equal(await app.turn(s,'сделай скриншот'),null,'a plain screenshot stays with computer control');
 // No vision model: the card offers the download, the fields stay empty, nothing is guessed.
 let r=await app.turn(s,'сделай баг из скриншота');
 let card=r.extensionData.screenshotTask;
 assert.equal(card.draft,null);assert.equal(card.vision.model,null);assert.equal(card.vision.name,'gemma3:4b');assert.equal(card.window,'Safari — Оформление заказа');
 assert.match(r.text,/нужна модель для скриншотов \(gemma3:4b\)/);assert.equal(captures,1);assert.equal(topic.messages.at(-1).by,'Скриншот → задача');
 assert.ok(fs.existsSync(path.join(root,'screenshot-task',card.id+'.png')),'the shot is stored');
 // With gemma3:4b: the draft from the image, the window and the note.
 installed=['qwen3.5:9b','gemma3:4b'];
 modelAnswer={title:'Кнопка «Купить» не реагирует на нажатие',steps:['1. Открыть корзину','Нажать «Купить»',''],expected:'Открывается оплата',actual:'Ничего не происходит'};
 r=await app.turn(s,'заведи баг по этому экрану: кнопка Купить не нажимается');
 card=r.extensionData.screenshotTask;
 const body=requests.filter(x=>x[0]==='model').at(-1)[1];
 assert.equal(body.model,'gemma3:4b');assert.deepEqual(body.messages[1].images,['QkFTRTY0']);assert.deepEqual(JSON.parse(body.messages[1].content),{window:'Safari — Оформление заказа',note:'кнопка Купить не нажимается'});
 assert.deepEqual(card.draft,{title:'Кнопка «Купить» не реагирует на нажатие',steps:['Открыть корзину','Нажать «Купить»'],expected:'Открывается оплата',actual:'Ничего не происходит'});
 assert.match(r.text,/^Набросал баг по скриншоту \(«Safari — Оформление заказа»\): «Кнопка «Купить» не реагирует на нажатие»\. .*без вашего нажатия ничего не создам/);
 // A useless model answer: the card is still there, fields to fill by hand.
 modelAnswer={title:'',steps:[],expected:'',actual:''};
 r=await app.turn(s,'скрин в задачу');assert.equal(r.extensionData.screenshotTask.draft,null);assert.match(r.text,/описание не получилось/);
 // Cancelled picker and missing permission.
 next0={cancelled:true};r=await app.turn(s,'скрин в задачу');assert.match(r.text,/Снимок отменён/);assert.equal(r.extensionData,undefined);
 next0={permission:false,text:capture.PERMISSION_TEXT};r=await app.turn(s,'скрин в задачу');assert.equal(r.question,true);assert.match(r.text,/Запись экрана/);
 // The shortcut's shot is used by the next request instead of a new capture.
 const before=captures;
 const shortcut=app.makeShortcut(s);await shortcut.pressed();
 const taken=app.state.pending?.id;assert.ok(taken);r=await app.turn(s,'скрин в задачу');assert.equal(captures,before+1,'one capture: the shortcut\'s');assert.equal(r.extensionData.screenshotTask.id,taken);assert.equal(app.state.pending,null);

 // Global registration with a fake globalShortcut.
 const registered=new Map();let refuse=false;
 const electron={globalShortcut:{register(acc,fn){if(refuse)return false;registered.set(acc,fn);return true;},unregister(acc){registered.delete(acc);}}};
 app.deps.electron=()=>electron;app.deps.smoke=()=>false;
 const sc=app.makeShortcut(s);sc.sync();assert.deepEqual([...registered.keys()],['CommandOrControl+Shift+2']);
 s.settings.screenshotTaskShortcut='Alt+Shift+B';sc.sync();assert.deepEqual([...registered.keys()],['Alt+Shift+B'],'the old one is released');
 s.settings['extension_screenshot-task']='false';sc.sync();assert.equal(registered.size,0,'removed app: no shortcut');
 s.settings['extension_screenshot-task']='true';refuse=true;sc.sync();assert.match(app.state.shortcutError,/уже занято другой программой/);refuse=false;
 s.settings.screenshotTaskShortcut=app.DEFAULT_SHORTCUT;sc.sync();assert.deepEqual([...registered.keys()],[app.DEFAULT_SHORTCUT]);
 app.deps.smoke=()=>true;

 // Card calls.
 const ipc=app.setup(s).ipc;
 const id=card.id;
 const img=ipc.image(id);assert.match(img.url,/^data:image\/png;base64,/);assert.deepEqual(img.shapes,[]);
 assert.throws(()=>ipc.save(id,'data:image/jpeg;base64,AAAA',[]),/не сохранилась/);assert.throws(()=>ipc.save('../../etc/passwd','x',[]),/не найден/);
 const shapes=[{type:'rect',x:10,y:10,w:100,h:40},{type:'blur',x:200,y:20,w:80,h:20}];
 ipc.save(id,'data:image/png;base64,'+PNG.toString('base64'),shapes);
 assert.deepEqual(ipc.image(id).shapes,shapes,'shapes kept for later edits');assert.ok(fs.existsSync(path.join(root,'screenshot-task',id+'-annotated.png')));
 modelAnswer={title:'Пустая корзина после оплаты',steps:['Оплатить'],expected:'Чек',actual:'Пусто'};
 assert.equal((await ipc.draft(id,'после оплаты')).draft.title,'Пустая корзина после оплаты');
 installed=['qwen3.5:9b'];assert.equal((await ipc.draft(id,'')).needsModel,true);installed=['gemma3:4b'];
 assert.deepEqual(ipc.downloadModel(),{started:true,model:'gemma3:4b'});
 // Hand-off, then the created task shows up in the chat and the user attaches the picture.
 assert.deepEqual(ipc.recent(id),[],'nothing before a hand-off');
 assert.deepEqual(ipc.handoff(id,'jira'),{attachable:true});
 s.settings.jiraUrl='https://acme.atlassian.net';s.settings.jiraEmail='me@acme.io';s.settings.jiraToken='tok';
 topic.messages.push({role:'assistant',at:Date.now(),text:'Создал задачу MOB-321: «Кнопка Купить…»',sources:[{url:'https://acme.atlassian.net/browse/MOB-321'}]});
 assert.deepEqual(ipc.recent(id).map(x=>x.key),['MOB-321']);
 const done=await ipc.attach(id,'jira','https://acme.atlassian.net/browse/MOB-321');
 const [url,opts]=uploads.at(-1);
 assert.equal(url,'https://acme.atlassian.net/rest/api/3/issue/MOB-321/attachments');assert.equal(opts.method,'POST');
 assert.equal(opts.headers['X-Atlassian-Token'],'no-check');assert.equal(opts.headers.Authorization,'Basic '+Buffer.from('me@acme.io:tok').toString('base64'));assert.equal(opts.headers['Content-Type'],undefined,'multipart boundary is set by fetch');
 const sent=opts.body.get('file');assert.equal(sent.type,'image/png');assert.match(sent.name,/^screenshot-Safari-Оформление-заказа-[0-9a-f]{8}\.png$/);assert.equal(sent.size,PNG.length,'the annotated picture is sent');
 assert.equal(done.text,'Скриншот прикреплён к MOB-321.');
 await assert.rejects(ipc.attach(id,'jira','купить'),/ключ задачи Jira/);
 s.settings.atlassianCredential='oauth';s.settings.jiraEmail='';await ipc.attach(id,'jira','MOB-321');assert.equal(uploads.at(-1)[1].headers.Authorization,undefined,'OAuth adds its own bearer in the shared request');
 s.settings.asanaCredential='cred';
 const a=await ipc.attach(id,'asana','https://app.asana.com/0/1/555');
 assert.equal(uploads.at(-1)[0],'https://app.asana.com/api/1.0/attachments');assert.equal(uploads.at(-1)[1].body.get('parent'),'555');assert.equal(a.url,'https://app.asana.com/0/1/555');
 s.settings.asanaCredential='';await assert.rejects(ipc.attach(id,'asana','555'),/Подключите Asana/);
 assert.deepEqual(ipc.handoff(id,'trello'),{attachable:false});
 // Shortcut settings through the card's settings page.
 const set=ipc.setShortcut('cmdorctrl+alt+9');assert.equal(set.accelerator,'CommandOrControl+Alt+9');assert.equal(set.error,'');assert.equal(s.settings.screenshotTaskShortcut,'CommandOrControl+Alt+9');
 assert.throws(()=>ipc.setShortcut('CommandOrControl+Shift+3'),/снимок экрана macOS/);

 // Attach helpers.
 assert.deepEqual(attach.recent([{role:'assistant',at:5,text:'https://other.atlassian.net/browse/X-1 и https://acme.atlassian.net/browse/MOB-7'},{role:'assistant',at:1,text:'https://acme.atlassian.net/browse/OLD-1'}],2,{jiraUrl:'https://acme.atlassian.net'}).map(x=>x.key),['MOB-7'],'only this site, only after the hand-off');
 assert.equal(attach.parseTarget('asana','1234567'),'1234567');assert.throws(()=>attach.parseTarget('github','1'),/Jira или Asana/);
 // Vision helpers.
 assert.equal(vision.pickModel(['llava:7b','gemma3:4b'],[{name:'gemma3:4b',vision:true}]),'gemma3:4b');assert.equal(vision.pickModel(['qwen2.5vl:3b','qwen3:4b']),'qwen2.5vl:3b');
 assert.equal(vision.pickModel(['gemma3:1b','qwen3:4b']),null,'a text-only model is not a vision model');
 assert.equal(vision.tidy({title:'',steps:[]}),null);
 assert.equal(vision.body({steps:['a','b'],expected:'x',actual:'y',window:'App'}),'Шаги: 1) a 2) b. Ожидалось: x. Фактически: y. Окно: App');
 // Region math and the picker's answers.
 assert.deepEqual(capture.cropRect({x:10,y:20,w:100,h:50},{scaleX:2,scaleY:2,width:300,height:200}),{x:20,y:40,width:200,height:100});
 assert.deepEqual(capture.cropRect({x:140,y:90,w:100,h:50},{scaleX:2,scaleY:2,width:300,height:200}),{x:280,y:180,width:20,height:20},'clamped to the image');
 assert.deepEqual(capture.parseAnswer('petya-region:{"x":1,"y":2,"w":3,"h":4}'),{kind:'rect',rect:{x:1,y:2,w:3,h:4}});
 assert.deepEqual(capture.parseAnswer('petya-region:full'),{kind:'full'});assert.equal(capture.parseAnswer('Some title'),null);assert.deepEqual(capture.parseAnswer('petya-region:{bad'),{kind:'cancel'});
 // A refused permission opens the macOS pane and says what to do.
 const opened=[];const fakeElectron={systemPreferences:{getMediaAccessStatus:()=>'denied'},desktopCapturer:{getSources:async()=>[]},shell:{openExternal:async u=>opened.push(u)}};
 const denied=await capture.captureRegion({electron:fakeElectron,platform:'darwin'});
 assert.equal(denied.permission,false);assert.match(opened[0],/Privacy_ScreenCapture/);
 // Front window.
 assert.deepEqual(await activeWindow({platform:'darwin',exec:async()=>'Safari\nОформление заказа'}),{app:'Safari',title:'Оформление заказа'});
 assert.deepEqual(await activeWindow({platform:'darwin',exec:async()=>'Petya\nЧат'}),{app:'',title:''},'Petya itself is not the context');
 assert.deepEqual(await activeWindow({platform:'linux'}),{app:'',title:''});
 assert.equal(label({app:'Figma',title:'Checkout – Figma'}),'Checkout – Figma');
 // The offer.
 const offer=require('../src/extensions/screenshot-task/offer.cjs');
 const subject=t=>!offer.avoid.some(x=>x.test(t))&&offer.topics.some(x=>x.test(t));
 for(const p of ['сделай баг из скриншота','скрин в задачу','заведи баг по этому экрану'])assert.equal(subject(p),true,p);
 for(const p of ['сделай скриншот','скриншоты стора','баг в коде'])assert.equal(subject(p),false,p);
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Screenshot → task: phrases and near-misses, shortcut validation/conflicts/registration, turn with capture/cancel/permission/shortcut shot, vision draft and download offer, editor save, hand-off and Jira/Asana attachment upload, region math, front window, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
