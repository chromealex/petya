// «История буфера»: routing and near-misses, off by default with the consent question, what is never kept
// (password managers by pasteboard marker or front app, the user's own list, passwords, tokens, keys, credentials),
// the encrypted store with its 200 / 7 days limits, search, «вставь третье скопированное» with Petya's own write not
// recorded, the link → Jira comment confirmation and the provider that writes it, pause and «стереть всё», and the
// watcher (no copy at start, changes, settled writes). Test secrets are generated at run time, never written here.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const app=require('../src/extensions/clipboard/feature.cjs');
const secrets=require('../src/extensions/clipboard/secrets.cjs');
const storage=require('../src/extensions/clipboard/store.cjs');
const watcher=require('../src/extensions/clipboard/watcher.cjs');
const jira=require('../src/extensions/jira/task-tracker.cjs');
const asana=require('../src/extensions/asana/task-tracker.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const DAY=86400000;

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------------
 const intents={
  'что я копировал про API ключ…':{action:'search',query:'API ключ',kind:''},
  'вставь третье скопированное':{action:'paste',n:3,kind:''},
  'скопируй последнюю ссылку из буфера в Jira задачу BW-12':{action:'link',issue:'BW-12',n:1},
  'добавь вторую ссылку из буфера к bw-7':{action:'link',issue:'BW-7',n:2},
  'история буфера':{action:'list',kind:''},
  'найди в буфере про оплату':{action:'search',query:'оплату',kind:''},
  'верни в буфер вторую картинку':{action:'paste',n:2,kind:'image'},
  'поставь историю буфера на паузу на час':{action:'pause',minutes:60},
  'возобнови историю буфера':{action:'resume'},
  'сотри историю буфера':{action:'wipe'},
  'включи историю буфера':{action:'on'},
  'выключи историю буфера':{action:'off'}
 };
 for(const [t,want] of Object.entries(intents)){assert.ok(app.wanted(t),t);assert.deepEqual(app.intent(t),want,t);}
 for(const t of ['буфер кадра в Unity','что такое буфер обмена','как скопировать в буфер обмена','размер буфера сокета','скопируй файл','вставь картинку в слайд','буферная зона','запиши встречу','очисти буфер обмена','скрин в задачу','сделай баг из скриншота'])assert.ok(!app.wanted(t),t);
 console.log('Clipboard routing: search, paste, link to an issue, pause, wipe, on/off, near-misses passed');

 // --- What is never kept ------------------------------------------------------------------------------------------------
 const random=crypto.randomBytes(24).toString('base64url');
 const token=['gh','p_',crypto.randomBytes(27).toString('hex').slice(0,36)].join('');
 const keyBlock=['-----BEGIN ','RSA PRIVATE',' KEY-----\n',random,'\n-----END ','RSA PRIVATE',' KEY-----'].join('');
 for(const t of [token,random,'Bearer '+random,keyBlock,'password: '+random.slice(0,10),'postgres://admin:'+random.slice(0,8)+'@db.local/app','https://example.com/reset?token='+random.slice(0,12),'Xk9mP2qL7','Tr0ub4dor&3'])assert.ok(secrets.looksSecret(t),'secret: '+t.slice(0,12));
 for(const t of ['int32Array','user_id_123','https://acme.atlassian.net/browse/BW-12','Где взять API ключ для AppMetrica: в настройках приложения','npm install --save-dev electron@39','const apiKey = process.env.API_KEY','550e8400-e29b-41d4-a716-446655440000','3f2a9c1d7e4b5a6c8d9e0f1a2b3c4d5e6f7a8b9c','v1.2.3','+7 999 123-45-67','SELECT * FROM users WHERE id = 42'])assert.equal(secrets.looksSecret(t),'',t);
 assert.equal(secrets.marked(['text/plain','org.nspasteboard.ConcealedType']),'org.nspasteboard.ConcealedType');
 assert.equal(secrets.marked(['text/plain','ExcludeClipboardContentFromMonitorProcessing']),'ExcludeClipboardContentFromMonitorProcessing');
 assert.equal(secrets.marked(['text/plain','text/html']),'');
 assert.ok(secrets.privateApp('1Password'));assert.ok(secrets.privateApp('Bitwarden'));assert.ok(secrets.privateApp('KeePassXC'));
 assert.ok(secrets.privateApp('Telegram Desktop','Telegram'));assert.ok(!secrets.privateApp('Safari'));
 console.log('Clipboard secrets: tokens, keys, passwords, credentials, password-manager markers and apps skipped; code, links and ids kept passed');

 // --- The app ------------------------------------------------------------------------------------------------------------
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'petya-clip-'));
 let now=Date.parse('2026-11-09T12:00:00Z');
 const topic={id:'t',title:'Чат',messages:[]};
 const settings={extension_clipboard:'true',clipboardHistory:'false',clipboardPausedUntil:'',clipboardPrivateApps:'Telegram'};
 const s={settings,dataRoot:path.join(home,'company'),saveSettings(p){Object.assign(settings,p);},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const writes=[];
 const clip={text:'',formats:['text/plain'],image:null,readText(){return this.text;},availableFormats(){return this.formats;},readImage(){return this.image;},
  writeText(t){writes.push(t);this.text=t;},writeImage(img){writes.push('image:'+img.size);this.image=img;this.text='';}};
 const xor=b=>Buffer.from(b).map(x=>x^0x5a);
 let front={app:'Safari',title:'Docs'};
 Object.assign(app.deps,{clipboard:()=>clip,nativeImage:()=>({createFromBuffer:b=>({size:b.length})}),crypt:()=>({encrypt:t=>xor(Buffer.from(t)),decrypt:b=>xor(b).toString()}),
  foreground:async()=>front,now:()=>now,smoke:()=>true});
 const run=async text=>{try{return await app.turn(s,text);}catch(e){if(e instanceof InputRequired)return {question:e.spec,resume:e.resume};throw e;}};
 assert.equal(await app.turn({...s,settings:{...settings,extension_clipboard:'false'}},'история буфера'),null,'not added → null');
 assert.equal(await app.turn(s,'буфер кадра в Unity'),null);
 // Off by default: the question, then nothing changes on «Не сейчас».
 let q=await run('что я копировал про API ключ');
 assert.match(q.question.text,/История буфера выключена\. Включить\?/);assert.deepEqual(q.question.options,['Включить историю','Не сейчас']);
 let r=await q.resume('Не сейчас');assert.match(r.text,/остаётся выключенной/);assert.equal(settings.clipboardHistory,'false');
 // Nothing is recorded while off.
 await app.copied(s,{formats:['text/plain'],text:'до согласия',image:null});
 assert.equal(app.setup(s).ipc.status().count,0);
 q=await run('история буфера');r=await q.resume('Включить историю');
 assert.equal(settings.clipboardHistory,'true');assert.match(r.text,/История буфера включена/);
 const ipc=app.setup(s).ipc;
 const copy=async(text,{formats=['text/plain'],at}={})=>{if(at)now=at;await app.copied(s,{formats,text,image:null});now+=60000;};
 await copy('Где взять API ключ для AppMetrica: в настройках приложения',{at:now-3*DAY});
 await copy('https://acme.atlassian.net/wiki/spaces/BW/pages/42/Release');
 await copy(token);
 await copy('Bearer '+random);
 await copy('вставлено из менеджера',{formats:['text/plain','org.nspasteboard.ConcealedType']});
 front={app:'1Password',title:''};await copy('логин из менеджера паролей');
 front={app:'Telegram',title:'Чат'};await copy('сообщение из телеграма');
 front={app:'Safari',title:'Docs'};
 await copy('Отчёт по API: ключи ротируются раз в месяц');
 await copy('https://github.com/acme/bw/pull/381 и https://ci.acme.dev/job/7');
 await app.copied(s,{formats:['image/png'],text:'',image:{getSize:()=>({width:2400,height:1200}),resize:o=>({getSize:()=>({width:o.width||Math.round(o.height*2),height:o.height||Math.round(o.width/2)}),toPNG:()=>Buffer.from('png-small'),toJPEG:()=>Buffer.from('jpeg'),resize:o2=>({toJPEG:()=>Buffer.from('jpeg')})}),toPNG:()=>Buffer.from('png-big')}});
 now+=60000;
 await copy('последний текст');
 let st=ipc.status();
 assert.equal(st.count,6,'six kept');assert.equal(st.images,1);
 assert.deepEqual(st.skipped,{manager:3,secret:2},'markers, password manager and the user list; token and bearer');
 assert.equal(st.encrypted,true);
 const raw=fs.readFileSync(path.join(s.dataRoot,'extensions','clipboard','history.json'),'utf8');
 assert.ok(!raw.includes('AppMetrica')&&!raw.includes('Release'),'encrypted on disk');
 assert.ok(!raw.includes(token.slice(4)),'the token is nowhere');
 const imageFile=fs.readdirSync(path.join(s.dataRoot,'extensions','clipboard','images'));assert.equal(imageFile.length,1);
 assert.ok(!fs.readFileSync(path.join(s.dataRoot,'extensions','clipboard','images',imageFile[0])).includes('png-small'),'pictures encrypted too');
 // The same text again moves to the top instead of a second row.
 await copy('Отчёт по API: ключи ротируются раз в месяц');assert.equal(ipc.status().count,6);
 // Search.
 r=await app.turn(s,'что я копировал про API ключ…');
 const found=r.extensionData.clipboardHistory;
 assert.equal(found.mode,'search');assert.equal(found.query,'API ключ');
 assert.deepEqual(found.items.map(i=>i.text.slice(0,12)),['Отчёт по API','Где взять AP'],'both words, newest first');
 assert.match(r.text,/^Нашёл в истории буфера про «API ключ»: 2 записи\./);
 assert.equal(found.days.length,7);assert.equal(found.days.reduce((a,d)=>a+d.texts+d.images,0),6);
 r=await app.turn(s,'что я копировал про пароль от почты');assert.match(r.text,/ничего нет\. Пароли и токены Петя не сохраняет/);
 // Paste back: #3 of all, then the second link; the watcher would not record Petya's own write.
 const list=ipc.list().items;assert.deepEqual(list.map(i=>i.n),[1,2,3,4,5,6]);
 r=await app.turn(s,'вставь третье скопированное');
 assert.equal(list[2].kind,'image');assert.equal(writes.at(-1),'image:9','#3 is the picture');
 assert.match(r.text,/^Положил в буфер №3: /);
 assert.equal(r.extensionData.clipboardHistory.pasted.n,3);assert.equal(r.extensionData.clipboardHistory.pasted.previous,list[0].id);
 assert.equal(await app.turn(s,'вставь вторую ссылку'),null,'«ссылку» without the clipboard is not ours');
 r=await app.turn(s,'вставь вторую скопированную ссылку');assert.equal(writes.at(-1),'https://acme.atlassian.net/wiki/spaces/BW/pages/42/Release');assert.match(r.text,/\(ссылку\)/);
 r=await app.turn(s,'вставь десятое скопированное');assert.equal(r.question,true);assert.match(r.text,/В истории только 6 записей/);
 r=await app.turn(s,'верни в буфер первую картинку');assert.equal(writes.at(-1),'image:9');
 // A link into a Jira issue: a confirmation card, nothing sent.
 r=await app.turn(s,'скопируй последнюю ссылку из буфера в Jira задачу BW-12');
 const link=r.extensionData.clipboardHistory.link;
 assert.deepEqual({issue:link.issue,url:link.url},{issue:'BW-12',url:'https://github.com/acme/bw/pull/381'});
 assert.match(r.text,/без нажатия ничего не отправлю/);
 r=await app.turn(s,'скопируй пятую ссылку из буфера в задачу BW-12');assert.equal(r.question,true);assert.match(r.text,/В истории только 3 ссылки/);
 // The provider: Jira writes the comment on the press, Asana does not offer comments.
 assert.equal(asana.fits({comment:true}),false);assert.equal(asana.fits({}),true);
 const sent=[];let checked=0;
 const services={settings:{jiraUrl:'https://acme.atlassian.net/',jiraEmail:'qa@acme.dev',jiraToken:'jira-token'},async request(url,options){sent.push({url,options});return {id:'10042'};}};
 const done=await jira.run(services,{issue:'bw-12',comment:link.url},()=>{checked++;});
 assert.deepEqual(done,{done:true,key:'BW-12',url:'https://acme.atlassian.net/browse/BW-12',text:'Комментарий добавлен в BW-12.'});
 assert.equal(checked,1,'re-checked right before the write');
 assert.equal(sent[0].url,'https://acme.atlassian.net/rest/api/3/issue/BW-12/comment');
 assert.equal(sent[0].options.method,'POST');assert.match(sent[0].options.headers.Authorization,/^Basic /);
 assert.equal(JSON.parse(sent[0].options.body).body.content[0].content[0].text,link.url);
 await assert.rejects(jira.run(services,{issue:'not a key',comment:'x'},()=>{}),/ключ задачи Jira/);
 await assert.rejects(jira.run({...services,request:async()=>({})},{issue:'BW-1',comment:'x'},()=>{}),/не подтвердила/);
 await assert.rejects(jira.run(services,{issue:'BW-1',comment:'x'},()=>{throw Error('Подключение «Jira» изменилось.');}),/изменилось/);
 assert.equal(sent.length,1,'nothing sent after a failed check');
 // Creating tasks is unchanged.
 assert.deepEqual(await jira.run(services,{title:'Кнопка не работает',type:'bug'}),{ask:'Создай задачу в Jira: Баг. Кнопка не работает',send:true});
 // Pause, resume, off.
 r=await app.turn(s,'поставь историю буфера на паузу на час');assert.match(settings.clipboardPausedUntil,/^\d+$/);
 await copy('на паузе');assert.equal(ipc.status().count,6,'nothing kept while paused');
 r=await app.turn(s,'возобнови историю буфера');assert.equal(settings.clipboardPausedUntil,'');
 // Limits: 200 copies, 7 days.
 for(let i=0;i<205;i++)await copy('строка номер '+i+' про сборку');
 assert.equal(ipc.status().count,200);
 now+=8*DAY;assert.equal(ipc.status().count,0,'nothing older than 7 days');
 assert.equal(fs.readdirSync(path.join(s.dataRoot,'extensions','clipboard','images')).length,0,'pictures go with their rows');
 await copy('после недели');
 // «Стереть всё» asks first.
 q=await run('сотри историю буфера');assert.deepEqual(q.question.options,['Стереть всё','Отмена']);
 r=await q.resume('Отмена');assert.match(r.text,/осталась/);assert.equal(ipc.status().count,1);
 q=await run('сотри историю буфера');r=await q.resume('Стереть всё');assert.match(r.text,/стёрта/);assert.equal(ipc.status().count,0);
 assert.ok(!fs.existsSync(path.join(s.dataRoot,'extensions','clipboard','history.json')));
 r=await app.turn(s,'выключи историю буфера');assert.equal(settings.clipboardHistory,'false');
 // Without the OS keychain the file is plain but private (0600).
 const plain=storage.create(path.join(home,'plain'));plain.add({kind:'text',text:'видно'});
 assert.equal(plain.encrypted,false);if(process.platform!=='win32')assert.equal(fs.statSync(plain.file).mode&0o777,0o600);
 console.log('Clipboard app: consent, skipped secrets, encrypted store, search, paste back, link confirmation and Jira comment, pause, 200 / 7 days, wipe passed');

 // --- The watcher -------------------------------------------------------------------------------------------------------
 const seen=[];const fake={text:'было до включения',formats:['text/plain'],readText(){return this.text;},availableFormats(){return this.formats;},readImage(){return null;}};
 let tick=null;const w=watcher.create({clipboard:fake,onCopy:c=>seen.push(c.text||'image'),setTimer:fn=>{tick=fn;return {unref(){}};},clearTimer:()=>{tick=null;}});
 w.start();await w.tick();assert.deepEqual(seen,[],'what was there before is not a copy');
 fake.text='первое';await tick();assert.deepEqual(seen,['первое']);
 await tick();assert.deepEqual(seen,['первое'],'no change, no copy');
 fake.text='от Пети';w.settle();await tick();assert.deepEqual(seen,['первое'],'Petya\'s own write is not recorded');
 fake.text='';fake.formats=['image/png'];fake.readImage=()=>({isEmpty:()=>false,getSize:()=>({width:10,height:10}),resize:()=>({toBitmap:()=>Buffer.from('px')})});
 await tick();assert.deepEqual(seen,['первое','image']);
 w.stop();assert.equal(w.running,false);
 // The real sync starts and stops one watcher with the switch (not in smoke tests).
 app.deps.smoke=()=>false;settings.clipboardHistory='true';app.sync(s);assert.ok(app.state.watch?.running);
 settings.clipboardPausedUntil='forever';app.sync(s);assert.equal(app.state.watch,null);
 app.teardown();
 fs.rmSync(home,{recursive:true,force:true});
 console.log('Clipboard watcher: no copy at start, changes recorded, own writes settled, pictures, start and stop with the switch passed');
})().catch(e=>{console.error(e);process.exit(1);});
