// «Конфиги и баланс»: Unity YAML / JSON / CSV / XLSX parsing on fixtures, routing with near-misses, not added → null,
// no project → question, a CSV balance table and a Google Sheet (local fake Sheets API) against ScriptableObjects:
// proposed mapping, differences with file and line, validation (type, range, enum typo, dangling guid and id refs,
// duplicates), the exact change list for the Programmer, remap/confirm saved per project, overrides, the sheet write
// with a cell preview, git version diffs, and that no project file is ever written.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const fake=require('./fake-sheets.cjs');
const yaml=require('../src/extensions/config-balance/unity-yaml.cjs');
const files=require('../src/extensions/config-balance/files.cjs');
const match=require('../src/extensions/config-balance/match.cjs');
const app=require('../src/extensions/config-balance/feature.cjs');
const sheetsApp=require('../src/extensions/google-sheets/feature.cjs');
const {isCoding}=require('../src/extensions/coder/intent.cjs');
const FIX=path.join(__dirname,'fixtures/config-balance/project');

function snapshot(dir){const out={};const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.name==='.git')continue;if(e.isDirectory())walk(f);else out[path.relative(dir,f)]=fs.readFileSync(f,'utf8');}};walk(dir);return out;}
(async()=>{
 // --- Parsers ---
 const archer=yaml.scriptables(fs.readFileSync(path.join(FIX,'Assets/Configs/Units/Archer.asset'),'utf8'))[0];
 assert.equal(archer.name,'Archer');assert.equal(archer.script,'5c1f2a3b4d5e6f708192a3b4c5d6e7f8');
 assert.equal(archer.fields.displayName,'Лучник','escaped unicode');assert.equal(archer.fields.description,"Shoots arrows from a long distance, it's fine",'wrapped quoted string');
 assert.deepEqual(archer.fields.projectile,{fileID:11400000,guid:'0123456789abcdef0123456789abcdef',type:2});
 assert.deepEqual(archer.fields.levels,[{level:1,bonus:0},{level:2,bonus:5}]);assert.equal(archer.lines.damage,20);assert.equal(archer.lines['levels[1].bonus'],33);
 assert.ok(!('m_Script' in archer.fields)&&!('m_ObjectHideFlags' in archer.fields),'service fields dropped');
 assert.deepEqual(yaml.flow('{a: 1, b: [x, "y, z"], c: {d: \'q\'\'s\'}}'),{a:1,b:['x','y, z'],c:{d:"q's"}});
 assert.equal(yaml.scalar('007'),'007','leading zeros stay text');assert.equal(yaml.scalar('-1.5e3'),-1500);
 assert.deepEqual(yaml.parse('--- !u!1 &1\nGameObject:\n  m_Name: !!binary abc\n')[0].data,{m_Name:'!!binary abc'},'tags are never resolved');
 const j=files.jsonWithLines('{\n "items": [\n  {"id": "a", "price": 5}\n ]\n}');assert.equal(j.lines['items[0].price'],3);
 assert.deepEqual(files.csv('a;b\n"x;1";2\n'),[['a','b'],['x;1','2']]);
 const scan=await files.scan([FIX]);
 const units=scan.sets.find(x=>x.kind==='asset');
 assert.equal(units.label,'UnitConfig · Assets/Configs/Units','class name from the .cs.meta');assert.equal(units.objects.length,5);
 assert.deepEqual(scan.sets.find(x=>x.kind==='json').objects.map(o=>o.id),['sword','shield','sword','bow','helmet']);
 assert.ok(scan.tables.some(t=>t.id==='file:Balance/economy.xlsx#Предметы'&&t.numbers[3][1]===140),'xlsx sheet with numbers');
 assert.equal(scan.tables.find(t=>t.id==='file:Balance/units-balance.csv').numbers[1][4],1.2,'«1,2» is a number');
 // Mapping by names (Russian headers ↔ English fields) and the key by overlapping ids.
 const t=scan.tables.find(x=>x.id==='file:Balance/units-balance.csv');
 const key=match.keyMatch(t,units);assert.deepEqual([key.column,key.field],['ID','id']);
 assert.deepEqual(match.propose(t,units,key).pairs.map(p=>p.column+'='+p.field),['Урон=damage','Здоровье=hp','Скорость атаки=attackSpeed','Цена=cost']);
 // Validation on the fixtures.
 const ids=new Set(scan.sets.flatMap(x=>x.objects.map(o=>match.norm(o.id))));
 const v=match.validate(units,{ids,guids:await files.guids(scan.metaFiles)});
 const kinds=v.issues.map(i=>i.severity+':'+i.kind+':'+i.objectId+'.'+i.field);
 for(const k of ['error:type:goblin.attackSpeed','error:ref:mage.projectile','error:ref:mage.upgradeTo','warning:range:goblin.hp','warning:enum:goblin.role'])assert.ok(kinds.includes(k),k+' in '+kinds.join(', '));
 assert.ok(!kinds.some(k=>k.includes('archer.projectile')),'an existing guid is fine');
 const items=match.validate(scan.sets.find(x=>x.kind==='json'),{ids});
 assert.deepEqual(items.issues.map(i=>i.kind+':'+i.value),['duplicate:sword','type:80']);
 assert.equal(items.issues[1].line,4,'JSON line of the value');
 // User overrides: a maximum turns a value into an error.
 assert.ok(match.validate(units,{overrides:{damage:{max:20}}}).issues.some(i=>i.kind==='range'&&i.objectId==='mage'&&i.severity==='error'));

 // --- Routing ---
 const yes={'сверь баланс с конфигами':'compare','сверь конфиги с таблицей баланса':'compare','что поменялось в балансе с прошлой версии':'history','проверь конфиги юнитов':'validate','почему урон лучника в игре не как в таблице':'why','есть ли расхождения между балансом и конфигами':'compare'};
 for(const [p,k] of Object.entries(yes))assert.equal(app.intent(p),k,p);
 for(const p of ['конфиг CI','проверь конфиг CI','настройки Пети','какой баланс на карте','проверь баланс на счёте','конфиг nginx','сравни конфиг nginx с прошлым','баланс работы и жизни','что в таблице баланса','покажи лист Юниты','балансировщик нагрузки упал'])assert.equal(app.intent(p),null,p);

 // --- Chat turns on a copy of the fixture in a git repo ---
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-balance-'));
 fs.cpSync(FIX,dir,{recursive:true});
 const g=(...a)=>execFileSync('git',a,{cwd:dir,stdio:'pipe'}).toString();
 g('init','-q');g('-c','user.email=t@t','-c','user.name=Tester','add','.');g('-c','user.email=t@t','-c','user.name=Tester','commit','-qm','Units v1');
 const archerFile=path.join(dir,'Assets/Configs/Units/Archer.asset');
 fs.writeFileSync(archerFile,fs.readFileSync(archerFile,'utf8').replace('damage: 10','damage: 9').replace('cost: 100','cost: 110'));
 g('-c','user.email=t@t','-c','user.name=Анна','commit','-qam','Archer nerf');
 fs.writeFileSync(archerFile,fs.readFileSync(archerFile,'utf8').replace('damage: 9','damage: 10'));
 const before=snapshot(dir);
 const topic={id:'t',title:'Чат',messages:[]};
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'petya-balance-data-'));
 const s={settings:{...app.defaults},dataRoot:data,requestProgress:{report(){}},attachments:{list:()=>[]},
  dialogue:{state:{projects:[{id:'p',folders:[dir]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(){throw Error('no model or network in this test');}};
 const say=p=>app.turn(s,p);
 assert.equal(await say('сверь баланс с конфигами'),null,'not added: nothing here');
 s.settings['extension_config-balance']='true';
 s.dialogue.state.projects[0].folders=[];
 const where=await say('сверь баланс с конфигами');assert.equal(where.question,true);assert.match(where.text,/папку проекта/);
 s.dialogue.state.projects[0].folders=[dir];

 const r=await say('сверь баланс с конфигами');const card=r.extensionData.balanceCard;
 assert.equal(card.mode,'compare');assert.equal(card.source.label,'Balance/units-balance.csv');assert.equal(card.set.label,'UnitConfig · Assets/Configs/Units');
 assert.equal(card.mapping.confirmed,false);assert.deepEqual(card.mapping.key,{column:'ID',field:'id'});
 // The working copy: Archer's cost is 110 since «Archer nerf», its damage back to 10 (uncommitted).
 assert.deepEqual(card.counts,{same:11,diff:5,noObject:1,noRow:1,noField:0});
 assert.match(r.text,/^Сверил «Balance\/units-balance\.csv» с UnitConfig · Assets\/Configs\/Units \(5 объектов\): расходится 5 значений, 1 строки нет в конфигах, 1 объекта нет в таблице\. Например: «Урон» у «Лучник» — в таблице 12, в Archer\.asset 10\./);
 assert.match(r.text,/Сопоставление столбцов предложено автоматически/);
 const dmg=card.rows.find(x=>x.objectId==='archer'&&x.field==='damage');
 assert.deepEqual([dmg.sheet,dmg.config,dmg.delta,dmg.status,dmg.file,dmg.line,dmg.label],[12,10,2,'diff','Assets/Configs/Units/Archer.asset',20,'Лучник']);
 assert.equal(card.rows.find(x=>x.key==='dragon').status,'no-object');assert.equal(card.rows.find(x=>x.objectId==='orc').status,'no-row');
 assert.ok(card.issues.some(i=>i.kind==='ref'&&i.objectId==='mage'));
 // The Programmer gets the exact list, recognised as coding work, file by file with lines.
 assert.equal(card.codeFix,'Как программист, в отдельной ветке обнови значения в конфигах игры по балансу, больше ничего не меняя. Assets/Configs/Units/Archer.asset: damage 10 → 12 (строка 20); cost 110 → 100 (строка 23). Assets/Configs/Units/Mage.asset: cost 300 → 320 (строка 22). Assets/Configs/Units/Goblin.asset: hp -40 → 40 (строка 20); attackSpeed fast → 1.5 (строка 21).');
 assert.equal(isCoding(card.codeFix),true,'the Programmer takes it as a coding request');
 assert.equal(card.canWriteSheet,false,'a CSV file is never written');

 // «почему урон лучника в игре не как в таблице»: the one cell, with file and line.
 const why=await say('почему урон лучника в игре не как в таблице');
 assert.equal(why.text,'В таблице «Урон» у «Лучник» — 12, а в Archer.asset — 10 (строка 20). Игра берёт значение из конфига. Чтобы перенести значение из таблицы, нажмите «Применить в конфиги» — Программист сделает это в отдельной ветке.');
 assert.deepEqual(why.extensionData.balanceCard.focus.map(i=>why.extensionData.balanceCard.rows[i].field),['damage']);

 // Remap a pair and confirm: saved per project, used next time without the «предложено» note.
 const ipc=app.setup(s).ipc;
 const remapped=ipc.remap(card.reportId,'Юнит','displayName');
 assert.ok(remapped.mapping.columns.some(p=>p.column==='Юнит'&&p.field==='displayName'&&p.how==='user'));
 assert.equal(remapped.rows.find(x=>x.objectId==='archer'&&x.field==='displayName').status,'same');
 assert.throws(()=>ipc.remap(card.reportId,'Урон','nope'),/Такого поля/);
 ipc.remap(card.reportId,'Юнит','');
 ipc.confirm(card.reportId);
 const saved=JSON.parse(fs.readFileSync(path.join(data,'config-balance.json'),'utf8')).projects[dir].mappings[0];
 assert.deepEqual(saved.columns.map(c=>c.field),['damage','hp','attackSpeed','cost']);assert.equal(saved.confirmed,true);
 const again=await say('сверь баланс с конфигами');assert.equal(again.extensionData.balanceCard.mapping.confirmed,true);assert.doesNotMatch(again.text,/предложено/);
 // An override from the card: damage at most 20 → Mage's 25 is an error.
 const ruled=ipc.setRule(again.extensionData.balanceCard.reportId,'damage',{max:20});
 assert.ok(ruled.issues.some(i=>i.kind==='range'&&i.objectId==='mage'&&i.severity==='error'));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'config-balance.json'),'utf8')).projects[dir].rules['asset:5c1f2a3b4d5e6f708192a3b4c5d6e7f8'],{damage:{max:20}});
 assert.throws(()=>ipc.prepareSheetWrite(again.extensionData.balanceCard.reportId),/только в Google Таблицу/);
 // A named table: «экономика» picks the XLSX against items.json.
 const eco=(await say('сверь баланс экономики с конфигами')).extensionData.balanceCard;
 assert.equal(eco.source.label,'Balance/economy.xlsx · Предметы');assert.deepEqual(eco.rows.filter(x=>x.status==='diff').map(x=>x.objectId+'.'+x.field+':'+x.sheet+'/'+x.config),['bow.price:140/150']);

 // Validation turn: every set, errors first; a named one narrows it.
 const val=await say('проверь конфиги юнитов');
 assert.equal(val.extensionData.balanceCard.mode,'validate');assert.deepEqual(val.extensionData.balanceCard.sets.map(x=>x.label),['UnitConfig · Assets/Configs/Units']);
 assert.match(val.text,/^Проверил 1 набор конфигов \(5 объектов\): ошибок \d+, предупреждений \d+\. Первая: /);

 // History: the last commit's field changes and the uncommitted one, as a table.
 const hist=await say('что поменялось в балансе с прошлой версии');const h=hist.extensionData.balanceCard;
 assert.equal(h.mode,'history');
 assert.equal(h.versions[0].working,true);assert.deepEqual(h.versions[0].changes.map(c=>c.objectId+'.'+c.field+':'+c.old+'→'+c.new),['archer.damage:9→10']);
 assert.equal(h.versions[1].subject,'Archer nerf');assert.equal(h.versions[1].author,'Анна');
 assert.deepEqual(h.versions[1].changes.map(c=>c.field+':'+c.old+'→'+c.new+'@'+c.line),['damage:10→9@20','cost:100→110@23']);
 assert.equal(h.versions[2].subject,'Units v1');assert.ok(h.versions[2].changes.some(c=>c.new==='добавлен'));
 assert.match(hist.text,/^Последние изменения конфигов: не закоммичено — 1 правка; «Archer nerf» \(Анна\) — 2 правки/);

 // --- A Google Sheet as the balance table, written back only on the card's confirm ---
 const SHEET='BalanceBook'+'c'.repeat(20);
 const api=await fake.create({spreadsheets:[{id:SHEET,title:'Баланс',sheets:[{id:0,title:'Юниты',frozen:1,rows:[['Юнит','ID','Урон','Здоровье','Скорость атаки','Цена'],['Лучник','archer',12,80,1.2,100],['Рыцарь','knight',18,160,0.9,250],['Маг','mage',25,60,0.7,300]]},{id:7,title:'Заметки',rows:[['Просто текст']]}]}]});
 try{
  Object.assign(s.settings,sheetsApp.defaults,{'extension_google-sheets':'true',googleSheetsWrite:'true',gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'me@studio.dev',tokens:{scope:'https://www.googleapis.com/auth/spreadsheets'}}]})});
  s.request=api.request;s.saveSettings=v=>Object.assign(s.settings,v);s.mailAccounts={google:{client:()=>({access:async()=>'acct'}),status:()=>({configured:true})}};
  s.googleSheets=sheetsApp.setup(s).googleSheets;
  const sr=await say('сверь баланс с конфигами https://docs.google.com/spreadsheets/d/'+SHEET+'/edit#gid=0');
  const sc=sr.extensionData.balanceCard;
  assert.equal(sc.source.type,'sheet');assert.equal(sc.source.label,'Баланс · Юниты');assert.equal(sc.canWriteSheet,true);
  assert.deepEqual(sc.rows.filter(x=>x.status==='diff').map(x=>x.objectId+'.'+x.field),['archer.damage','archer.cost']);
  // Without a link the confirmed mapping (the CSV) still wins over a newly known spreadsheet.
  assert.equal((await say('сверь баланс с конфигами')).extensionData.balanceCard.source.label,'Balance/units-balance.csv');
  const plan=ipc.prepareSheetWrite(sc.reportId);
  assert.deepEqual(plan.changes.map(c=>[c.cell,c.old,c.new,c.label]),[['C2',12,10,'Лучник'],['F2',100,110,'Лучник']]);
  assert.equal(api.book(SHEET).sheets[0].rows[1][2],12,'nothing written before the confirm');
  const w=await ipc.writeSheet(sc.reportId);assert.equal(w.done.cells,2);assert.equal(api.book(SHEET).sheets[0].rows[1][2],10);assert.equal(api.book(SHEET).sheets[0].rows[1][5],110);
  assert.equal((await ipc.writeSheet(sc.reportId)).already,true);
  assert.equal(api.state.requests.filter(x=>x.path.endsWith('values:batchUpdate')).length,1,'written once');
  // Google Sheets not added: a link asks for it instead of failing.
  s.settings['extension_google-sheets']='false';
  const need=await say('сверь баланс с конфигами https://docs.google.com/spreadsheets/d/'+SHEET+'/edit');assert.equal(need.question,true);assert.match(need.text,/«Google Таблицы»/);
 }finally{await api.close();}
 assert.deepEqual(snapshot(dir),before,'no project file is ever written');
 fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});
 console.log('Config balance: Unity YAML/JSON/CSV/XLSX, mapping by names and values, differences with lines, validation, Programmer change list, saved mapping and rules, sheet write on confirm, git versions passed');
})().catch(e=>{console.error(e);process.exit(1);});
