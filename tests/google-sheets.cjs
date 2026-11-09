// «Google Таблицы»: routing and near-misses, not added / not connected, a pasted link with gid, known spreadsheets
// by name and tab, header detection and number columns, search across tabs, a prepared row and its append only on
// the card action (once), export from another card through `spreadsheet-export` (new tab, existing tab with a cell
// diff, a new spreadsheet), cell updates with the stale check, the service-account path and service errors.
// Everything runs against a local fake Sheets API (tests/fake-sheets.cjs); no network.
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const fake=require('./fake-sheets.cjs');
const app=require('../src/extensions/google-sheets/feature.cjs');
const client=require('../src/extensions/google-sheets/client.cjs');
const table=require('../src/extensions/google-sheets/table.cjs');
const provider=require('../src/extensions/google-sheets/spreadsheet-export.cjs');
const offer=require('../src/extensions/google-sheets/offer.cjs');
const links=require('../src/features/app-links.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const BAL='BalanceBook'+'a'.repeat(20),ECO='EconomyBook'+'b'.repeat(20);
const units={id:0,title:'Юниты',frozen:1,rows:[['Юнит','ID','Урон','Здоровье','Цена'],['Лучник','archer',12,80,100],['Рыцарь','knight',18,160,250],['Маг','mage',25,60,300.5]]};
const waves={id:1717,title:'Волны',rows:[['Волна','Враги'],[1,'Гоблин, Лучник'],[2,'Орк']]};
(async()=>{
 const api=await fake.create({spreadsheets:[{id:BAL,title:'Баланс',sheets:[units,waves]},{id:ECO,title:'Экономика',sheets:[{id:0,title:'Лист1',rows:[['Товар','Цена'],['Сундук',99]]}]}]});
 try{
  // --- Pure helpers ---
  assert.deepEqual(client.parseUrl('глянь https://docs.google.com/spreadsheets/d/'+BAL+'/edit#gid=1717 пожалуйста'),{id:BAL,gid:1717,url:'https://docs.google.com/spreadsheets/d/'+BAL+'/edit#gid=1717'});
  assert.equal(client.parseUrl('https://docs.google.com/spreadsheets/u/1/d/'+BAL+'/edit?usp=sharing').gid,null);
  assert.equal(client.parseUrl('https://docs.google.com/document/d/'+BAL),null,'Google Docs is not a spreadsheet');
  assert.equal(client.range("Bob's",0,0,9,25),"'Bob''s'!A1:Z10");assert.equal(client.letters(26),'AA');assert.equal(client.columnIndex('AB'),27);
  assert.deepEqual(client.parseCell("'Юниты'!C3"),{sheet:'Юниты',col:2,row:2});
  const g=table.grid([['Юнит','Урон'],['Лучник','12'],['','']],[['Юнит','Урон'],['Лучник',12],['','']]);
  assert.equal(g.text.length,2,'trailing empty rows dropped');assert.equal(table.header(g.text,g.numbers),0);assert.deepEqual(table.numericColumns(g.text,g.numbers,0),[false,true]);
  assert.equal(table.header([['1','2'],['3','4']],[[1,2],[3,4]]),-1,'numbers only: no header');
  assert.ok(table.matches('Лучник','лучника'));assert.ok(!table.matches('Рыцарь','лучника'));

  // --- Routing ---
  const yes={'что в таблице баланса':'open','покажи лист Юниты':'open','найди в таблице лучника':'find','найди лучника в гугл таблице баланса':'find','добавь строку в таблицу Юниты: Маг; 15; 80':'append',
   ['https://docs.google.com/spreadsheets/d/'+BAL+'/edit#gid=0']:'open','открой Google Sheets':'open','Выгрузи в Google Таблицы «Метрики» · 3 строки · #0a1b2c3d':'export'};
  for(const [t,k] of Object.entries(yes))assert.equal(app.intent(t),k,t);
  for(const t of ['сверь баланс с конфигами','почему урон лучника в игре не как в таблице','таблица умножения на 7','составь таблицу сравнения тарифов','открой csv с продажами','проверь локализацию в таблице','что поменялось в балансе с прошлой версии','покажи лист ожидания','какой у меня баланс на карте'])assert.equal(app.intent(t),null,t);
  // Offer: by name or link only; «таблица» alone and neighbours' subjects are not it.
  const offered=t=>!offer.avoid.some(r=>r.test(t))&&(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)));
  assert.ok(offered('что в гугл таблице баланса'));assert.ok(offered('https://docs.google.com/spreadsheets/d/'+BAL));assert.ok(!offered('сверь баланс в гугл таблице с конфигами'));assert.ok(!offered('что в таблице'));

  // --- Services: a Google account with the read scope only; the mail sign-in is stubbed ---
  const topic={id:'t',title:'Чат',messages:[]};
  const started=[];
  const gmail=(scope)=>JSON.stringify({accounts:[{id:'g1',email:'me@studio.dev',label:'',tokens:{scope:'https://www.googleapis.com/auth/gmail.readonly '+scope}}]});
  const s={settings:{},requestProgress:{report(){}},request:api.request,
   dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}},
   saveSettings(v){Object.assign(s.settings,v);for(const k of Object.keys(v))if(k.startsWith('clear_'))s.settings[k.slice(6)]='';},
   mailAccounts:{google:{client:id=>({access:async()=>'acct-'+id}),start:async o=>{started.push(o);},status:()=>({configured:true}),login:{pending:false}}}};
  Object.assign(s.settings,app.defaults);
  const say=t=>app.turn(s,t);
  assert.equal(await say('что в таблице баланса'),null,'not added: nothing here');
  s.settings['extension_google-sheets']='true';
  const ask=await say('что в таблице баланса');
  assert.equal(ask.question,true);assert.match(ask.text,/Настройки → Google Таблицы/);
  assert.equal(api.state.requests.length,0,'not connected: no request');
  s.settings.gmailCredential=gmail(client.READ);

  // No spreadsheet known yet: ask for the link.
  const link=await say('что в таблице баланса');assert.equal(link.question,true);assert.match(link.text,/ссылку/);

  // A pasted link with gid opens that tab; the spreadsheet is remembered.
  const opened=await say('глянь https://docs.google.com/spreadsheets/d/'+BAL+'/edit#gid=1717');
  assert.match(opened.text,/^Таблица «Баланс», лист «Волны»: 2 строки, столбцы: Волна, Враги\./);
  assert.equal(topic.messages.at(-1).by,'Google Таблицы');
  assert.equal(api.state.requests.at(-1).auth,'Bearer acct-g1');
  assert.ok(api.state.requests.some(r=>r.query.valueRenderOption==='UNFORMATTED_VALUE')&&api.state.requests.some(r=>r.query.valueRenderOption==='FORMATTED_VALUE'));
  assert.equal(JSON.parse(s.settings.googleSheetsKnown)[0].title,'Баланс');

  // By name and by tab: «таблица баланса» → first tab, header found from the frozen row, number columns.
  const balance=await say('что в таблице баланса');const card=balance.extensionData.sheetsCard;
  assert.equal(card.mode,'sheet');assert.equal(card.sheet.title,'Юниты');assert.equal(card.header,0);
  assert.deepEqual(card.numeric,[false,false,true,true,true]);assert.equal(card.text[3][4],'300,5');assert.equal(card.numbers[3][4],300.5);
  assert.deepEqual(card.tabs.map(t=>t.title),['Юниты','Волны']);assert.equal(card.writable,false);
  assert.equal((await say('покажи лист Волны')).extensionData.sheetsCard.sheet.title,'Волны');

  // Two known spreadsheets: a name that fits neither is asked about with the titles as choices.
  await say('https://docs.google.com/spreadsheets/d/'+ECO+'/edit');
  const which=await say('что в таблице продаж').catch(e=>e);
  assert.ok(which instanceof InputRequired);assert.deepEqual(which.spec.options.sort(),['Баланс','Экономика']);
  assert.equal((await which.resume('Баланс')).extensionData.sheetsCard.title,'Баланс');

  // Search across tabs: «лучника» finds «Лучник» on «Юниты» and in «Гоблин, Лучник» on «Волны».
  const found=(await say('найди в таблице баланса лучника')).extensionData.sheetsCard;
  assert.equal(found.mode,'find');assert.equal(found.query,'лучника');
  assert.deepEqual(found.matches.map(m=>m.sheet+'!'+m.cell),['Юниты!A2','Волны!B2']);
  assert.deepEqual(found.matches[0].fields.slice(0,3),[{label:'Юнит',value:'Лучник'},{label:'ID',value:'archer'},{label:'Урон',value:'12'}]);
  assert.equal(api.state.requests.filter(r=>r.path.endsWith('values:batchGet')).at(-1).ranges.length,2,'one batchGet for all tabs');

  // Append: writing is off → a question where to enable it; nothing is requested.
  const before=api.state.requests.length;
  const off=await say('добавь строку в таблицу Юниты: Маг; 15; 80');assert.equal(off.question,true);assert.match(off.text,/Разрешить запись/);
  assert.equal(api.state.requests.length,before);
  // Writing on, but only the read scope granted: still a question; consent asks for the write scope.
  s.settings.googleSheetsWrite='true';
  assert.equal((await say('добавь строку в таблицу Юниты: Маг; 15; 80')).question,true);
  const ipc=app.setup(s,{poll:5}).ipc;
  await ipc.connect('google:g1',true);assert.deepEqual(started.at(-1),{scopes:[client.WRITE],email:'me@studio.dev'});
  ipc.cancel();
  s.settings.gmailCredential=gmail(client.WRITE);
  const row=await say('добавь строку в таблицу Юниты: Друид; druid; 14; 90; 180');
  const draft=row.extensionData.sheetsCard;
  assert.equal(draft.mode,'append');assert.equal(draft.sheet.title,'Юниты');assert.deepEqual(draft.row,['Друид','druid',14,90,180],'numbers typed by the column');
  assert.match(row.text,/Юнит — Друид, ID — druid, Урон — 14/);
  assert.equal(api.book(BAL).sheets[0].rows.length,4,'nothing written by the chat turn');
  // Pairs by column name.
  assert.deepEqual(app.parseValues('добавь строку: Урон=15, Юнит=Маг',['Юнит','ID','Урон']),['Маг','','15']);
  // The card button appends once; a second press says it is already done.
  const done=await ipc.append(draft.draftId);assert.match(done.done.range,/Юниты!A5/);
  assert.deepEqual(api.book(BAL).sheets[0].rows[4],['Друид','druid',14,90,180]);
  const append=api.state.requests.find(r=>r.path.endsWith(':append'));assert.equal(append.query.valueInputOption,'RAW');assert.equal(append.auth,'Bearer acct-g1');
  assert.equal((await ipc.append(draft.draftId)).already,true);assert.equal(api.book(BAL).sheets[0].rows.length,5);
  await assert.rejects(ipc.append('nope'),/устарела/);

  // Export from another card through the registry: the provider hands over a chat request, the turn makes the card.
  const reg=links.create(s);
  assert.deepEqual(reg.available('spreadsheet-export').map(p=>p.id),['google-sheets']);
  const handed=await reg.run('spreadsheet-export','google-sheets',{title:'Метрики игры · 7 дней',app:'Метрики игры',header:['Дата','DAU'],rows:[['2026-11-02',1200],['2026-11-03',1310],['2026-11-04','=HYPERLINK("x")']]});
  assert.equal(handed.send,true);assert.match(handed.ask,/^Выгрузи в Google Таблицы «Метрики игры · 7 дней» · 3 строки · #[a-f0-9]{8}$/);
  const exp=await say(handed.ask);const ex=exp.extensionData.sheetsCard;
  assert.equal(ex.mode,'export');assert.deepEqual(ex.header,['Дата','DAU']);assert.equal(ex.rows.length,3);assert.equal(ex.canCreate,true);
  assert.deepEqual(ex.known.map(k=>k.title).sort(),['Баланс','Экономика']);
  assert.equal((await say(handed.ask)).error,true,'an export request is used once');
  // Existing tab: the preview lists the exact cells that change; a new tab changes nothing.
  const pre=await ipc.exportPreview(ex.draftId,{kind:'existing',spreadsheetId:ECO,sheet:'Лист1'});
  assert.equal(pre.changed,8);assert.deepEqual(pre.changes[0],{cell:'A1',old:'Товар',new:'Дата'});
  assert.deepEqual((await ipc.exportPreview(ex.draftId,{kind:'tab',spreadsheetId:BAL,sheet:'Метрики'})),{kind:'tab',cells:8,changes:[],changed:0});
  // Someone edits the tab after the preview: the write is refused.
  api.book(ECO).sheets[0].rows[1][1]=120;
  await assert.rejects(ipc.exportRun(ex.draftId,{kind:'existing',spreadsheetId:ECO,sheet:'Лист1'}),/изменился после предпросмотра/);
  const wrote=await ipc.exportRun(ex.draftId,{kind:'tab',link:'https://docs.google.com/spreadsheets/d/'+BAL+'/edit',sheet:'Метрики'});
  assert.equal(wrote.done.sheet,'Метрики');assert.match(wrote.done.url,/#gid=500$/);
  assert.deepEqual(api.book(BAL).sheets.at(-1).rows,[['Дата','DAU'],['2026-11-02',1200],['2026-11-03',1310],['2026-11-04','=HYPERLINK("x")']]);
  assert.equal(api.state.requests.filter(r=>r.path.endsWith('values:batchUpdate')).at(-1).body.valueInputOption,'RAW','formula-looking text stays text');
  // A new spreadsheet (own account).
  const handed2=await reg.run('spreadsheet-export','google-sheets',{title:'План спринта',header:['Задача'],rows:[['GAME-1']]});
  const ex2=(await say(handed2.ask)).extensionData.sheetsCard;
  const made=await ipc.exportRun(ex2.draftId,{kind:'new'});assert.match(made.done.spreadsheetId,/^NewBook1/);assert.equal(api.book(made.done.spreadsheetId).sheets[0].rows[0][0],'Задача');

  // Cell updates for other apps: the stale check refuses cells that changed since the preview.
  const svc=app.setup(s).googleSheets;
  assert.equal(svc.ready(),true);assert.equal(svc.writable(),true);
  const read=await svc.read(BAL,'Юниты');assert.equal(read.header,0);assert.equal(read.numbers[1][2],12);
  await assert.rejects(svc.applyUpdate({spreadsheetId:BAL,changes:[{sheet:'Юниты',row:1,col:2,old:10,new:11}]}),/изменились после проверки: Юниты!C2/);
  const upd=await svc.applyUpdate({spreadsheetId:BAL,changes:[{sheet:'Юниты',row:1,col:2,old:12,new:10},{sheet:'Юниты',row:2,col:3,old:'160',new:170}]});
  assert.equal(upd.cells,2);assert.equal(api.book(BAL).sheets[0].rows[1][2],10);assert.equal(api.book(BAL).sheets[0].rows[2][3],170);

  // Service errors are told in the user's words.
  api.state.fail={status:403,message:'The caller does not have permission',once:true};
  const denied=await say('что в таблице баланса');assert.equal(denied.error,true);assert.match(denied.text,/Нет доступа к этой таблице/);
  api.state.fail={status:403,message:'Google Sheets API has not been used in project 1 before or it is disabled. SERVICE_DISABLED',once:true};
  assert.match((await say('что в таблице баланса')).text,/не включён Google Sheets API/);

  // Service account: its own token from the token endpoint, its address in the status, no account needed.
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={type:'service_account',client_email:'petya-sheets@game-123.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),project_id:'game-123'};
  s.settings.gmailCredential='';
  assert.equal((await ipc.saveKey(JSON.stringify(key))).serviceEmail,'petya-sheets@game-123.iam.gserviceaccount.com','the address to share with is shown at once');
  s.saveSettings({googleSheetsAuth:'service'});
  const st=ipc.status();assert.equal(st.serviceEmail,'petya-sheets@game-123.iam.gserviceaccount.com');assert.equal(st.connected,true);assert.equal(st.mode,'service');
  const viaSa=await say('покажи лист Юниты');assert.equal(viaSa.extensionData.sheetsCard.sheet.title,'Юниты');
  assert.equal(api.state.requests.at(-1).auth,'Bearer sa-token');assert.ok(api.state.requests.some(r=>r.path==='/token'));
  // A service account cannot create a spreadsheet the user would see.
  const handed3=await reg.run('spreadsheet-export','google-sheets',{title:'X',header:['a'],rows:[[1]]});
  const ex3=(await say(handed3.ask)).extensionData.sheetsCard;assert.equal(ex3.canCreate,false);
  await assert.rejects(ipc.exportRun(ex3.draftId,{kind:'new'}),/Сервисный аккаунт создаёт таблицы/);
  assert.throws(()=>ipc.saveKey('{"type":"user"}'),/JSON ключ сервисного аккаунта/);
  // Writing off: the provider sends the user to settings instead of a request.
  s.settings.googleSheetsWrite='false';
  assert.deepEqual(await provider.run(s,{title:'X',header:[],rows:[[1]]}),{settings:'google-sheets',text:'Чтобы выгружать, разрешите запись в настройках «Google Таблицы».'});
  assert.throws(()=>app.validate({googleSheetsAuth:'oauth'}),/Способ входа/);
  console.log('Google Sheets: links, names and tabs, header and numbers, search, append and export only on the card action, cell diff with the stale check, service account, errors passed');
 }finally{await api.close();}
})().catch(e=>{console.error(e);process.exit(1);});
