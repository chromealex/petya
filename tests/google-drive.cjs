// «Google Диск» and the Drive/Docs part of the shared Google connection: links, kinds and the Docs outline; routing
// and near-misses (spreadsheet links stay with «Google Таблицы»), not added / not connected, recent files and search
// (the `q` sent, fullText never sorted, files found by meaning merged), a document's outline, answers with quotes
// checked word for word (with a model, with an invented quote, without a model), follow-ups about the open document,
// documents by title with a clarification, Slides links, saving an answer as a new Google Doc only on the card action
// (once, writing off → settings, unknown outcome never repeated), `document-export` through the registry, the index
// collection, consent per product, the service account and service errors. A local fake Drive/Docs API, no network.
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const fake=require('./fake-google-drive.cjs');
const ws=require('../src/google-workspace.cjs');
const app=require('../src/extensions/google-drive/feature.cjs');
const client=require('../src/extensions/google-drive/client.cjs');
const P=require('../src/extensions/google-drive/passages.cjs');
const md=require('../src/extensions/google-drive/markdown.cjs');
const collection=require('../src/extensions/google-drive/collection.cjs');
const provider=require('../src/extensions/google-drive/document-export.cjs');
const offer=require('../src/extensions/google-drive/offer.cjs');
const links=require('../src/features/app-links.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const DOC='PlanDoc'+'a'.repeat(30),NOTES='NotesDoc'+'b'.repeat(30),DECK='ChinaDeck'+'c'.repeat(30),SHEET='Balance'+'d'.repeat(30),PDF='Report'+'e'.repeat(30),OLD='OldPlan'+'f'.repeat(30);
const S=ws.SCOPES;
const plan=fake.doc(DOC,'План релиза 2.3',[
 ['title','План релиза 2.3'],
 ['h1','Цели'],['p','Выпустить лиги и новый магазин до Нового года.'],
 ['h1','Сроки'],['h2','Бета-тест'],['p','Бета-тест начинается 1 декабря и длится две недели.'],['li','Сборка для бета-теста — 28 ноября'],['li','Релиз в сторах — 18 декабря'],
 ['h2','Заморозка'],['p','Код замораживаем за три дня до релиза.'],
 ['h1','Ответственные'],['table',[['Роль','Кто'],['Релиз-менеджер','Маша'],['QA','Олег']]]
],{tabs:true});
(async()=>{
 const api=await fake.create({files:[
  {id:DOC,name:'План релиза 2.3',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-11-08T10:00:00.000Z',owners:[{displayName:'Маша Котова',emailAddress:'masha@studio.dev'}],lastModifyingUser:{displayName:'Олег'},text:'лиги магазин бета-тест сроки',doc:plan,webViewLink:'https://docs.google.com/document/d/'+DOC+'/edit?usp=drivesdk'},
  {id:NOTES,name:'Заметки по онбордингу',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-11-07T09:00:00.000Z',owners:[{displayName:'Я',me:true}],text:'туториал первые 5 минут',doc:fake.doc(NOTES,'Заметки по онбордингу',[['p','Туториал длится 5 минут.']])},
  {id:DECK,name:'Китай: запуск и LTV',mimeType:'application/vnd.google-apps.presentation',modifiedTime:'2026-11-06T12:00:00.000Z',owners:[{displayName:'Олег'}],text:'китай ltv издатель'},
  {id:SHEET,name:'Баланс юнитов',mimeType:'application/vnd.google-apps.spreadsheet',modifiedTime:'2026-11-05T12:00:00.000Z',owners:[{displayName:'Я',me:true}],text:'лучник урон'},
  {id:PDF,name:'Отчёт по Китаю.pdf',mimeType:'application/pdf',modifiedTime:'2026-11-01T12:00:00.000Z',driveId:'shared1',text:'китай выручка',size:120000},
  {id:OLD,name:'План релиза 2.2',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-09-01T12:00:00.000Z',owners:[{displayName:'Я',me:true}],text:'старый план',doc:fake.doc(OLD,'План релиза 2.2',[['p','Старый план.']])},
  {id:'Trashed'+'g'.repeat(30),name:'План релиза черновик',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-11-09T12:00:00.000Z',trashed:true,text:'план'}
 ]});
 try{
  // --- Shared connection: links, kinds, the Docs outline, scopes of several products ---
  assert.deepEqual(ws.parseLink('глянь https://docs.google.com/document/d/'+DOC+'/edit?tab=t.0 пожалуйста'),{kind:'document',id:DOC,url:'https://docs.google.com/document/d/'+DOC+'/edit?tab=t.0'});
  assert.equal(ws.parseLink('https://docs.google.com/spreadsheets/u/1/d/'+SHEET+'/edit#gid=0').kind,'spreadsheet');
  assert.equal(ws.parseLink('https://docs.google.com/presentation/d/'+DECK+'/edit').kind,'presentation');
  assert.deepEqual(ws.parseLink('https://drive.google.com/file/d/'+PDF+'/view?usp=sharing'),{kind:'file',id:PDF,url:'https://drive.google.com/file/d/'+PDF+'/view?usp=sharing'});
  assert.equal(ws.parseLink('https://drive.google.com/open?id='+PDF).id,PDF);
  assert.equal(ws.parseLink('https://drive.google.com/drive/folders/'+DECK).kind,'folder');
  assert.equal(ws.parseLink('https://example.com/document/d/'+DOC),null);
  assert.equal(ws.kindOf('application/vnd.google-apps.presentation'),'presentation');assert.equal(ws.kindOf('image/png'),'image');assert.equal(ws.kindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),'document');
  assert.equal(ws.fileUrl('spreadsheet',SHEET),'https://docs.google.com/spreadsheets/d/'+SHEET+'/edit');assert.equal(ws.fileUrl('pdf',PDF),'https://drive.google.com/file/d/'+PDF+'/view');assert.equal(ws.fileUrl('document','../x'),'');
  const text=ws.docText(plan);
  assert.equal(text.title,'План релиза 2.3');
  assert.deepEqual(text.blocks.filter(b=>b.type==='heading').map(b=>[b.level,b.text]),[[0,'План релиза 2.3'],[1,'Цели'],[1,'Сроки'],[2,'Бета-тест'],[2,'Заморозка'],[1,'Ответственные']]);
  assert.equal(text.blocks.find(b=>b.type==='li').path,'Сроки › Бета-тест');
  assert.deepEqual(text.blocks.find(b=>b.type==='table').rows[1],['Релиз-менеджер','Маша']);
  assert.match(text.text,/^План релиза 2\.3\n\n# Цели\n\nВыпустить/);assert.match(text.text,/## Бета-тест/);assert.match(text.text,/- Релиз в сторах — 18 декабря/);
  assert.equal(ws.docText(fake.doc('x','Без вкладок',[['h1','A'],['p','b']])).blocks.length,2,'body without tabs');
  const both=JSON.stringify({accounts:[{id:'g1',email:'me@studio.dev',tokens:{scope:[S.drive.read,S.drive.write].join(' ')}}]});
  assert.deepEqual(ws.accounts({gmailCredential:both},['drive','docs']).map(a=>a.read),[false],'a list needs every product');
  assert.deepEqual(ws.accounts({gmailCredential:both},'drive').map(a=>[a.read,a.write]),[[true,true]]);

  // --- Passages and quotes ---
  const list=P.passages(text);
  assert.deepEqual(list.find(p=>p.kind==='table').text,'Роль: Релиз-менеджер; Кто: Маша');
  const rel=P.relevant(list,'когда начинается бета-тест?');assert.equal(list[[...rel.score.entries()].sort((a,b)=>b[1]-a[1])[0][0]-1].text,'Бета-тест начинается 1 декабря и длится две недели.');
  assert.deepEqual(P.verify(list,[{n:1,text:'бета-тест начинается 1 декабря'},{n:2,text:'бета начнётся в январе'},{n:3,text:'Бета-тест … две недели'}]).map(q=>q.text),['Бета-тест начинается 1 декабря и длится две недели.'],'a quote may name the wrong passage; an invented one is dropped; one passage once');
  // Markdown for the new document: headings, lists, tables, escaped text, only http(s) links.
  const html=md.html('Итоги',md.blocks('# Итоги\n\nВсё **готово** <script>x</script>\n\n- раз\n- два\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[ссылка](https://example.com) [плохая](javascript:alert(1))'));
  assert.match(html,/<h1>Итоги<\/h1>/);assert.match(html,/<b>готово<\/b> &lt;script&gt;/);assert.match(html,/<ul>\n<li>раз<\/li>\n<li>два<\/li>\n<\/ul>/);assert.match(html,/<th>A<\/th><th>B<\/th>/);
  assert.match(html,/<a href="https:\/\/example.com">ссылка<\/a>/);assert.ok(!/href="javascript/.test(html));
  assert.equal(md.title('Короче, план такой. Дальше подробности.'),'Короче, план такой');assert.equal(md.title('## Итоги встречи\n\nтекст'),'Итоги встречи');

  // --- Routing ---
  const yes={'найди в гугл диске план релиза':'find','последние файлы в Google Drive':'recent','что нового в гугл диске':'recent','открой гугл диск':'recent','найди презентацию про Китай в гугл диске':'find','гугл доки про онбординг':'find',
   ['https://docs.google.com/document/d/'+DOC+'/edit']:'read',['о чём этот документ https://docs.google.com/document/d/'+DOC+'/edit']:'read',['https://docs.google.com/document/d/'+DOC+'/edit когда бета-тест?']:'ask',
   ['https://docs.google.com/presentation/d/'+DECK+'/edit']:'file','прочитай гугл док «План релиза 2.3»':'read-title','что в гугл доке «План релиза 2.3» про заморозку?':'ask-title',
   'Сохрани это в Google Docs':'save','сохрани ответ в гугл документ':'save','запиши это в гугл доки':'save','По документу: кто релиз-менеджер?':'about','Сохрани в Google Документы «Итоги» · #0a1b2c3d':'export'};
  for(const [t,k] of Object.entries(yes))assert.equal(app.intent(t),k,t);
  for(const t of ['https://docs.google.com/spreadsheets/d/'+SHEET+'/edit#gid=0','что в гугл таблице баланса','чем забит диск','сколько места на диске','найди скрипт сохранения','документы про монетизацию','найди везде про релиз','что в гугл календаре на завтра','сохрани в гугл таблицы','открой Google Sheets','крэши в Google Play','найди документ про онбординг','сохрани файл на диск','что такое гугл диск','как работает Google Drive?'])assert.equal(app.intent(t),null,t);
  assert.deepEqual(app.spoken('найди презентацию про Китай в гугл диске'),{words:['Китай'],kind:'presentation',quoted:false});
  assert.deepEqual(app.spoken('найди в гугл диске «План релиза»'),{words:['План','релиза'],kind:'',quoted:true});
  assert.equal(app.questionOf('По документу: кто релиз-менеджер?'),'кто релиз-менеджер?');
  // Offer: by name or a Docs/Slides/Drive link; spreadsheets, the computer's disk and other Google products are not it.
  const offered=t=>!offer.avoid.some(r=>r.test(t))&&(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)));
  for(const t of ['найди в гугл диске план релиза','открой Google Docs','https://docs.google.com/document/d/'+DOC+'/edit'])assert.ok(offered(t),t);
  for(const t of ['что в гугл таблице','чем забит диск','https://docs.google.com/spreadsheets/d/'+SHEET,'что в гугл календаре','документы про монетизацию'])assert.ok(!offered(t),t);

  // --- Services: a Google account with Drive and Docs reading; the mail sign-in and the model are stubbed ---
  const topic={id:'t',title:'Чат',messages:[]};
  const started=[],model=[];let answer=null;
  const gmail=scopes=>JSON.stringify({accounts:[{id:'g1',email:'me@studio.dev',label:'',tokens:{scope:['https://www.googleapis.com/auth/gmail.readonly',...scopes].join(' ')}}]});
  const s={settings:{ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},
   request:async(url,o)=>{if(String(url).startsWith('http://127.0.0.1:11434')){model.push(JSON.parse(o.body));return {message:{content:JSON.stringify(answer)}};}return api.request(url,o);},
   dialogue:{active:()=>topic,persist(){},rememberAction(c,t){s.dialogue.active().messages.push({role:'user',text:c},{role:'assistant',text:t});},state:{topics:[topic]}},
   saveSettings(v){Object.assign(s.settings,v);for(const k of Object.keys(v))if(k.startsWith('clear_'))s.settings[k.slice(6)]='';},
   mailAccounts:{google:{client:id=>({access:async()=>'acct-'+id}),start:async o=>{started.push(o);},status:()=>({configured:true}),login:{pending:false}}}};
  Object.assign(s.settings,app.defaults);
  const say=t=>app.turn(s,t);
  assert.equal(await say('найди в гугл диске план релиза'),null,'not added: nothing here');
  s.settings['extension_google-drive']='true';
  s.settings.gmailCredential=gmail([S.drive.read]);
  const ask=await say('найди в гугл диске план релиза');
  assert.equal(ask.question,true);assert.match(ask.text,/подключён только для почты.*Разрешить чтение Диска/);
  assert.equal(api.state.requests.length,0,'not connected: no request');
  // Consent asks for both read scopes at once; creating documents asks for drive.file only.
  const ipc=app.setup(s,{poll:5}).ipc;
  await ipc.connect('google:g1',false);assert.deepEqual(started.at(-1),{scopes:[S.drive.read,S.docs.read],email:'me@studio.dev'});ipc.cancel();
  s.settings.gmailCredential=gmail([S.drive.read,S.docs.read]);

  // Recent files: newest first, folders and trashed files left out, no full-text search.
  const recent=(await say('последние файлы в гугл диске')).extensionData.driveCard;
  assert.equal(recent.mode,'files');assert.equal(recent.recent,true);
  assert.deepEqual(recent.files.map(f=>f.name),['План релиза 2.3','Заметки по онбордингу','Китай: запуск и LTV','Баланс юнитов','Отчёт по Китаю.pdf','План релиза 2.2']);
  const listed=api.state.requests.at(-1);
  assert.equal(listed.query.orderBy,'modifiedTime desc');assert.equal(listed.query.supportsAllDrives,'true');assert.equal(listed.auth,'Bearer acct-g1');
  assert.ok(!/fullText/.test(listed.query.q)&&/trashed = false/.test(listed.query.q));
  assert.deepEqual(recent.files[0],{id:DOC,name:'План релиза 2.3',kind:'document',mime:'application/vnd.google-apps.document',modified:'2026-11-08T10:00:00.000Z',url:'https://docs.google.com/document/d/'+DOC+'/edit?usp=drivesdk',owner:'Маша Котова',mine:false,shared:false,editor:'Олег',size:0});
  assert.equal(recent.files[1].mine,true);assert.equal(recent.files[4].shared,true);assert.equal(recent.files[4].kind,'pdf');
  assert.equal(topic.messages.at(-1).by,'Google Диск');
  // Search: name prefixes or full text, a kind filter; Drive cannot sort full-text results, so no orderBy.
  const china=(await say('найди презентацию про Китае в гугл диске')).extensionData.driveCard;
  assert.deepEqual(china.files.map(f=>f.name),['Китай: запуск и LTV']);assert.equal(china.kind,'presentation');
  const q=api.state.requests.at(-1).query;
  assert.equal(q.q,"trashed = false and ((name contains 'кита') or fullText contains 'Китае') and mimeType = 'application/vnd.google-apps.presentation'");assert.equal(q.orderBy,undefined);
  const found=await say('найди в гугл диске план релиза');
  assert.deepEqual(found.extensionData.driveCard.files.map(f=>f.name),['План релиза 2.3','План релиза 2.2']);assert.match(found.text,/^Нашёл в Google Диске по «план релиза»: 2 файла\./);
  assert.match((await say('найди в гугл диске квантовый двигатель')).text,/ничего не нашёл/);
  assert.equal(client.literal("it's \\ ok"),"'it\\'s \\\\ ok'",'quotes and backslashes escaped in q');
  // Found by meaning when the Drive collection is on: merged after the word matches, marked.
  s.semanticIndex={enabled:id=>id==='google-drive',search:async(id,query,o)=>{assert.equal(id,'google-drive');assert.equal(o.k,5);return {hits:[{id:NOTES,meta:{title:'Заметки по онбордингу',owner:'Я',modified:'2026-11-07T09:00:00.000Z'},text:'Туториал длится 5 минут.'},{id:DOC,meta:{title:'План релиза 2.3'}}]};}};
  const meaning=(await say('найди в гугл диске план релиза')).extensionData.driveCard;
  assert.deepEqual(meaning.files.map(f=>[f.name,!!f.meaning]),[['План релиза 2.3',false],['План релиза 2.2',false],['Заметки по онбордингу',true]]);
  delete s.semanticIndex;

  // A Docs link: the outline with section lengths, the opening lines, owner and time from Drive.
  const read=await say('https://docs.google.com/document/d/'+DOC+'/edit');
  const docCard=read.extensionData.driveCard;
  assert.equal(docCard.mode,'doc');assert.equal(docCard.doc.title,'План релиза 2.3');assert.equal(docCard.doc.owner,'Маша Котова');assert.equal(docCard.doc.modified,'2026-11-08T10:00:00.000Z');
  assert.deepEqual(docCard.outline.map(s=>[s.level,s.text,s.words]),[[1,'Цели',8],[1,'Сроки',0],[2,'Бета-тест',20],[2,'Заморозка',7],[1,'Ответственные',7]]);
  assert.match(read.text,/^Документ «План релиза 2\.3»: 5 разделов, около \d+ слов\. Разделы: Цели, Сроки, Бета-тест, Заморозка, Ответственные\./);
  assert.match(docCard.intro,/^Выпустить лиги/);
  assert.equal(api.state.requests.find(r=>r.path==='/v1/documents/'+DOC).query.includeTabsContent,'true');

  // A question about the open document, with a model: the answer keeps only quotes that are in the text.
  s.settings.model='qwen3:8b';
  answer={found:true,answer:'Бета-тест начинается 1 декабря и длится две недели.',quotes:[{n:3,text:'Бета-тест начинается 1 декабря  и длится две недели'},{n:4,text:'бета-тест стартует в январе'}]};
  const beta=await say('По документу: когда начинается бета-тест?');
  const b=beta.extensionData.driveCard;
  assert.equal(b.mode,'answer');assert.equal(b.state,'answer');assert.equal(b.question,'когда начинается бета-тест?');
  assert.deepEqual(b.quotes.map(x=>[x.text,x.path]),[['Бета-тест начинается 1 декабря и длится две недели.','Сроки › Бета-тест']]);
  assert.match(beta.text,/^Бета-тест начинается 1 декабря[\s\S]*\n> Бета-тест начинается 1 декабря и длится две недели\.$/);
  const sent=JSON.parse(model.at(-1).messages[1].content);assert.equal(sent.question,'когда начинается бета-тест?');assert.ok(sent.fragments.some(f=>f.section==='Сроки › Бета-тест'));
  // An answer whose quotes are invented is not shown as an answer: the closest places instead.
  answer={found:true,answer:'Бета-тест в январе.',quotes:[{n:3,text:'бета-тест стартует в январе'}]};
  const made=(await say('по документу: когда бета-тест?')).extensionData.driveCard;
  assert.equal(made.state,'places');assert.equal(made.answer,'');assert.equal(made.quotes[0].text,'Бета-тест начинается 1 декабря и длится две недели.');
  // Nothing about it in the document.
  answer={found:false,answer:'',quotes:[]};
  const none=await say('по документу: какой бюджет на маркетинг?');assert.equal(none.extensionData.driveCard.state,'none');assert.match(none.text,/не нашёл ничего про это/);
  // A table row answers «кто»; without a model the matching places are shown.
  s.settings.model='';
  const who=(await say('https://docs.google.com/document/d/'+DOC+'/edit кто релиз-менеджер?')).extensionData.driveCard;
  assert.equal(who.state,'places');assert.equal(who.quotes[0].text,'Роль: Релиз-менеджер; Кто: Маша');assert.equal(who.quotes[0].path,'Ответственные');
  // A follow-up needs an open document in this chat.
  const other={id:'t2',title:'Другой',messages:[]};const was=s.dialogue.active;s.dialogue.active=()=>other;
  assert.equal(await say('по документу: кто релиз-менеджер?'),null);s.dialogue.active=was;

  // By title: one exact match is read; two candidates are asked about.
  assert.equal((await say('прочитай гугл док «План релиза 2.3»')).extensionData.driveCard.doc.id,DOC);
  const which=await say('прочитай гугл док «План релиза»').catch(e=>e);
  assert.ok(which instanceof InputRequired);assert.deepEqual(which.spec.options,['План релиза 2.3','План релиза 2.2']);
  assert.equal((await which.resume('План релиза 2.2')).extensionData.driveCard.doc.id,OLD);
  assert.equal((await say('прочитай гугл док «Бюджет 2027»')).question,true);
  // Slides and Drive links show the file; a Drive link to a Google Doc reads it; spreadsheet links are not ours.
  const deck=(await say('https://docs.google.com/presentation/d/'+DECK+'/edit#slide=id.p')).extensionData.driveCard;
  assert.equal(deck.single,true);assert.equal(deck.files[0].kind,'presentation');assert.equal(deck.files[0].url,'https://docs.google.com/presentation/d/'+DECK+'/edit');
  assert.equal((await say('https://drive.google.com/file/d/'+DOC+'/view')).extensionData.driveCard.mode,'doc');
  assert.equal(await say('https://docs.google.com/spreadsheets/d/'+SHEET+'/edit#gid=0'),null);

  // --- Save Petya's answer as a new Google Doc: a card first, the document only on «Создать документ» ---
  topic.messages.push({role:'user',text:'итоги планёрки'},{role:'assistant',text:'## Итоги планёрки\n\n- Маша готовит сборку <b>к пятнице</b>\n- Олег проверяет **лиги**',by:''});
  const before=api.state.created.length;
  const draft=await say('сохрани это в Google Docs');
  const d=draft.extensionData.driveCard;
  assert.equal(d.mode,'save');assert.equal(d.title,'Итоги планёрки');assert.equal(d.canCreate,true);assert.equal(d.writable,false);
  assert.deepEqual(d.preview.map(x=>x.type),['heading','li','li']);
  assert.match(draft.text,/Сначала включите «Разрешить создавать документы»/);
  assert.equal(api.state.created.length,before,'nothing written by the chat turn');
  // Writing off: the button sends to settings; on but without drive.file: still settings; then created once.
  assert.deepEqual(await ipc.save(d.draftId,'Итоги'),{settings:'google-drive',text:'Включите «Разрешить создавать документы» в настройках «Google Диск» и нажмите «Создать документ» ещё раз.'});
  s.settings.googleDriveWrite='true';
  assert.equal((await ipc.save(d.draftId,'Итоги')).settings,'google-drive');
  await ipc.connect('google:g1',true);assert.deepEqual(started.at(-1),{scopes:[S.drive.write],email:'me@studio.dev'});ipc.cancel();
  s.settings.gmailCredential=gmail([S.drive.read,S.docs.read,S.drive.write]);
  const done=await ipc.save(d.draftId,'  Итоги   планёрки 9 ноября ');
  assert.equal(done.done.title,'Итоги планёрки 9 ноября');assert.match(done.done.url,/^https:\/\/docs\.google\.com\/document\/d\/NewDoc1x+\/edit/);
  const up=api.state.created.at(-1);
  assert.deepEqual(up.meta,{name:'Итоги планёрки 9 ноября',mimeType:'application/vnd.google-apps.document'});assert.equal(up.query.uploadType,'multipart');
  assert.match(up.html,/<h2>Итоги планёрки<\/h2>/);assert.match(up.html,/&lt;b&gt;к пятнице&lt;\/b&gt;/);assert.match(up.html,/<b>лиги<\/b>/);
  assert.equal(api.state.requests.at(-1).auth,'Bearer acct-g1');
  assert.equal((await ipc.save(d.draftId,'Итоги')).already,true);assert.equal(api.state.created.length,before+1,'created once');
  await assert.rejects(ipc.save('nope'),/устарела/);
  // A write whose outcome is unknown is not repeated.
  const second=(await say('запиши это в гугл доки')).extensionData.driveCard;
  assert.equal(second.title,'Итоги планёрки','the last answer, not the save card');
  const real=s.request;s.request=async(url,o)=>{if(/upload/.test(url))throw Object.assign(Error('socket hang up'),{code:'ECONNRESET'});return real(url,o);};
  await assert.rejects(ipc.save(second.draftId,'X'));s.request=real;
  await assert.rejects(ipc.save(second.draftId,'X'),/Не знаю, создался ли документ/);
  // Nothing to save in an empty chat.
  s.dialogue.active=()=>other;assert.equal((await say('сохрани это в Google Docs')).question,true);s.dialogue.active=was;

  // document-export through the registry: the provider hands over a chat request, the turn makes the card.
  const reg=links.create(s);
  assert.deepEqual(reg.available('document-export').map(p=>p.id),['google-drive']);
  const handed=await reg.run('document-export','google-drive',{title:'Ответ по найденному: #лиги',app:'Поиск по всему',text:'Лиги запускаем в декабре.'});
  assert.equal(handed.send,true);assert.match(handed.ask,/^Сохрани в Google Документы «Ответ по найденному: лиги» · #[a-f0-9]{8}$/);
  const exp=(await say(handed.ask)).extensionData.driveCard;
  assert.equal(exp.mode,'save');assert.equal(exp.title,'Ответ по найденному: #лиги');assert.equal(exp.app,'Поиск по всему');assert.equal(exp.text,'Лиги запускаем в декабре.');
  assert.equal((await say(handed.ask)).error,true,'an export request is used once');
  s.settings.googleDriveWrite='false';
  assert.deepEqual(await provider.run(s,{title:'X',text:'y'}),{settings:'google-drive',text:'Чтобы сохранять, разрешите создавать документы в настройках «Google Диск».'});

  // --- Index collection: Google Docs only, Markdown with headings; the switch goes to the semantic index ---
  const entries=await collection.list(s,{gate:async()=>{}});
  assert.deepEqual(entries.map(e=>e.meta.title),['Итоги планёрки 9 ноября','План релиза 2.3','Заметки по онбордингу','План релиза 2.2']);
  assert.equal(entries[1].version,'2026-11-08T10:00:00.000Z');
  const item=await collection.read(s,entries[1]);assert.equal(item.type,'markdown');assert.match(item.text,/# Сроки\n\n## Бета-тест/);assert.equal(item.meta.title,'План релиза 2.3');
  assert.equal(collection.ready(s.settings),true);assert.equal(collection.ready({}),false);
  require('../src/features/semantic-index.cjs').check({...collection},'google-drive/collection.cjs');
  const enabled=[];s.semanticIndex={enable:async(id,on)=>{enabled.push([id,on]);},enabled:()=>enabled.at(-1)?.[1]===true,collections:()=>[{id:'google-drive',items:4}]};
  assert.deepEqual((await ipc.setIndex(true)).index,{available:true,enabled:true,items:4,error:'',collects:collection.collects});
  assert.deepEqual(enabled,[['google-drive',true]]);
  s.semanticIndex.wipe=async id=>{enabled.push([id,'wiped']);};await ipc.wipeIndex();assert.deepEqual(enabled.at(-1),['google-drive','wiped']);delete s.semanticIndex;
  assert.equal(app.dashboard.accepts('последние файлы в гугл диске'),true);assert.equal(app.dashboard.accepts('сохрани это в Google Docs'),false);

  // --- Errors in the user's words ---
  api.state.fail={status:403,message:'Google Docs API has not been used in project 1 before or it is disabled. SERVICE_DISABLED docs.googleapis.com',once:true,match:r=>r.path.startsWith('/v1/')};
  const off=await say('https://docs.google.com/document/d/'+NOTES+'/edit');assert.equal(off.error,true);assert.match(off.text,/не включён Google Docs API/);
  api.state.fail={status:404,message:'File not found',once:true};
  assert.match((await say('https://docs.google.com/presentation/d/'+DECK+'/edit')).text,/не нашёл этот файл/);
  api.state.fail={status:403,message:'The user does not have sufficient permissions for this file.',once:true};
  assert.match((await say('последние файлы в гугл диске')).text,/Нет доступа к этому файлу/);

  // --- Service account: its own token for both read scopes; it cannot create documents the user would see ---
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={type:'service_account',client_email:'petya-drive@game-123.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),project_id:'game-123'};
  s.settings.gmailCredential='';
  assert.equal((await ipc.saveKey(JSON.stringify(key))).serviceEmail,'petya-drive@game-123.iam.gserviceaccount.com');
  s.saveSettings({googleDriveAuth:'service',googleDriveWrite:'true'});
  const st=ipc.status();assert.equal(st.connected,true);assert.equal(st.mode,'service');assert.equal(st.writable,false);
  assert.equal((await say('последние файлы в гугл диске')).extensionData.driveCard.who,'petya-drive@game-123.iam.gserviceaccount.com');
  assert.equal(api.state.requests.at(-1).auth,'Bearer sa-token');
  const grant=api.state.requests.filter(r=>r.path==='/token').at(-1);
  assert.equal(JSON.parse(Buffer.from(new URLSearchParams(grant.body).get('assertion').split('.')[1],'base64url')).scope,S.drive.read+' '+S.docs.read);
  const sa=(await say('сохрани это в Google Docs')).extensionData.driveCard;assert.equal(sa.canCreate,false);
  await assert.rejects(ipc.save(sa.draftId,'X'),/Сервисный аккаунт создаёт документы/);
  assert.throws(()=>ipc.saveKey('{"type":"user"}'),/JSON ключ сервисного аккаунта/);
  assert.throws(()=>app.validate({googleDriveAuth:'oauth'}),/Способ входа/);
  app.teardown();
  console.log('Google Drive: links and Docs outline, routing and near-misses, recent and search, quotes checked against the text, follow-ups, titles, saving a document only on the card action, document-export, index collection, consent, service account, errors passed');
 }finally{await api.close();}
})().catch(e=>{console.error(e);process.exit(1);});
