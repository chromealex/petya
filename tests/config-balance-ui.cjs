// «Конфиги и баланс» cards in the real chat, from data the feature computes on the fixture project: the stacked bar,
// the mapping with field choices (remap through ipc repaints the card) and «Подтвердить сопоставление», the
// differences table with file:line and delta bars, issues by severity with the rules editor, «Применить в конфиги»
// through code-fix, «Записать в таблицу…» with the cell preview, «Выгрузить отчёт», the validation card and the
// git history card. Safe text throughout.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 // Real card data from the feature on a git copy of the fixture project.
 const app=require('../src/extensions/config-balance/feature.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-balance-ui-'));fs.cpSync(path.join(__dirname,'fixtures/config-balance/project'),dir,{recursive:true});
 const g=(...a)=>execFileSync('git',['-c','user.email=t@t','-c','user.name=Анна',...a],{cwd:dir,stdio:'pipe'});
 g('init','-q');g('add','.');g('commit','-qm','Юниты: первая версия');
 const f=path.join(dir,'Assets/Configs/Units/Archer.asset');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('damage: 10','damage: 9').replace('cost: 100','cost: 110'));g('commit','-qam','Лучник: ослабить');
 fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('damage: 9','damage: 10'));
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{...app.defaults,'extension_config-balance':'true'},requestProgress:{report(){}},attachments:{list:()=>[]},
  dialogue:{state:{projects:[{id:'p',folders:[dir]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},async request(){throw Error('offline');}};
 const compare=(await app.turn(s,'почему урон лучника в игре не как в таблице')).extensionData.balanceCard;
 const validate=(await app.turn(s,'проверь конфиги юнитов')).extensionData.balanceCard;
 const versions=(await app.turn(s,'что поменялось в балансе с прошлой версии')).extensionData.balanceCard;
 // As if the table were a Google Sheet that may be written.
 compare.canWriteSheet=true;compare.source={...compare.source,type:'sheet',label:'Баланс · Юниты',url:'https://docs.google.com/spreadsheets/d/'+'B'.repeat(30)+'/edit#gid=0'};
 compare.rows.find(r=>r.objectId==='goblin').label='Гоблин <img src=x onerror=alert(1)>';
 const remapped=JSON.parse(JSON.stringify(compare));remapped.mapping.columns.push({column:'Юнит',col:0,field:'displayName',how:'user'});remapped.mapping.unmatched=[];
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  calls.push([name,method,...args]);
  if(name==='appLinks'&&method==='available')return args[0]==='code-fix'?[{id:'coder',name:'Программист',label:'Отдать Программисту'}]:args[0]==='spreadsheet-export'?[{id:'google-sheets',name:'Google Таблицы',label:'Выгрузить в Google Таблицы'}]:[];
  if(name==='appLinks'&&method==='run')return {text:'ok'};
  if(name==='configBalance'&&method==='remap')return remapped;
  if(name==='configBalance'&&method==='prepareSheetWrite')return {changes:[{cell:'C2',old:12,new:10,label:'Лучник',field:'Урон'},{cell:'F2',old:100,new:110,label:'Лучник',field:'Цена'}]};
  if(name==='configBalance'&&method==='writeSheet')return {done:{cells:2}};
  if(name==='configBalance'&&method==='setRule')return compare;
  return null;
 });
 await js(`view('home');showDialogueMessages([{role:'user',text:'почему урон лучника в игре не как в таблице'},{role:'assistant',text:'В таблице «Урон» у «Лучник» — 12.',by:'Конфиги и баланс',extensionData:{balanceCard:${JSON.stringify(compare)}}},{role:'assistant',text:'Проверил.',by:'Конфиги и баланс',extensionData:{balanceCard:${JSON.stringify(validate)}}},{role:'assistant',text:'Изменения.',by:'Конфиги и баланс',extensionData:{balanceCard:${JSON.stringify(versions)}}}],'Баланс')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.balance-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.balance-card').length"),3);
 const first="document.querySelectorAll('.balance-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.cb-seg').length"),4,'same / diff / no object / no row');
 assert.equal(await js(first+".querySelectorAll('.cb-pair').length"),5,'four pairs and one unmatched column');
 assert.equal(await js(first+".querySelectorAll('.cb-row.focus').length"),1,'the asked cell is highlighted');
 assert.match(await js(first+".querySelector('.cb-row.focus .cb-obj small').textContent"),/^Archer\.asset:20$/);
 assert.equal(await js(first+".querySelectorAll('.cb-row').length"),7,'differences and missing rows; matching values hidden');
 assert.equal(await js("document.querySelectorAll('.balance-card img').length"),0,'data is never HTML');
 for(let i=0;i<100;i++){if(await js(first+".querySelectorAll('.kit-link').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(await js(`[...${first}.querySelectorAll('.kit-actions button')].map(b=>b.textContent)`),['Применить в конфиги (Программист)','Записать в таблицу…','Выгрузить отчёт','Открыть таблицу']);
 assert.ok(await js(first+".querySelectorAll('.cb-issue.error').length")>=3);
 // Configs → sheet: the preview of the exact cells before writing.
 await js(`[...${first}.querySelectorAll('.kit-actions button')].find(b=>b.textContent==='Записать в таблицу…').click()`);
 for(let i=0;i<100;i++){if(await js(first+".querySelectorAll('.cb-write-list li').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(first+".querySelectorAll('.cb-write-list li').length"),2);
 await js("document.querySelectorAll('.balance-card').forEach((c,i)=>c.dataset.shot=['a','b','c'][i])");
 await require('./card-shot.cjs')(win,'.balance-card[data-shot=a]','petya-config-balance');
 // The bottom of the compare card: issues, the cell preview and the actions.
 await js("(()=>{const b=document.querySelector('#card-shot');b.scrollTop=b.scrollHeight;})()");await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(path.join(os.tmpdir(),'petya-config-balance-actions.png'),(await win.webContents.capturePage()).toPNG());
 await require('./card-shot.cjs')(win,'.balance-card[data-shot=b],.balance-card[data-shot=c]','petya-config-balance-checks');
 // After the screenshots: write, hand to the Programmer, remap a column.
 await js(`document.querySelector('.cb-write .primary').click()`);
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.cb-done')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(calls.filter(c=>c[1]==='writeSheet').length,1);
 await js(`document.querySelector('.balance-card .kit-link').click()`);
 for(let i=0;i<100;i++){if(calls.some(c=>c[1]==='run'))break;await new Promise(r=>setTimeout(r,30));}
 const run=calls.find(c=>c[1]==='run');assert.equal(run[2],'code-fix');assert.match(run[4].text,/^Как программист, в отдельной ветке обнови значения в конфигах игры/);
 await js(`(()=>{const s=[...document.querySelectorAll('.balance-card .cb-pair')].find(p=>p.querySelector('.cb-col').textContent==='Юнит').querySelector('select');s.value='displayName';s.dispatchEvent(new Event('change'));})()`);
 for(let i=0;i<100;i++){if(await js("[...document.querySelectorAll('.balance-card .cb-how')].some(n=>n.textContent==='вы')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.ok(calls.some(c=>c[1]==='remap'&&c[3]==='Юнит'&&c[4]==='displayName'));
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('Config balance cards: summary bar, mapping with remap, differences with file:line, issues and rules, Programmer hand-off, sheet write preview, validation and git history cards passed');
}};
require('../src/main.cjs');
