// «Google Таблицы» cards in the real chat: tab chips that load another tab, the filter, the table with its header,
// sticky first column and number bars, search results by tab, a new row with «Добавить строку» (one ipc call) and an
// export with the destination choice, the exact cell diff of an existing tab and «Выгрузить». Safe text throughout.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 const ID='BalanceBook'+'a'.repeat(20),url='https://docs.google.com/spreadsheets/d/'+ID+'/edit';
 const waves={sheet:{id:1717,title:'Волны',rows:3,cols:2},header:0,text:[['Волна','Враги','Награда'],['1','Гоблин, Лучник','50'],['2','Орк','80'],['3','Орк, Тролль','120']],numbers:[[null,null,null],[1,null,50],[2,null,80],[3,null,120]],numeric:[true,false,true],frozenCols:0,truncated:false,url:url+'#gid=1717'};
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  calls.push([name,method,...args]);
  if(name==='appLinks'&&method==='available')return [];
  if(name==='googleSheets'&&method==='sheet')return {...waves,spreadsheetId:ID,title:'Баланс',tabs:[],writable:true};
  if(name==='googleSheets'&&method==='append')return {done:{range:'Юниты!A6:E6',url}};
  if(name==='googleSheets'&&method==='exportPreview')return {kind:'existing',cells:8,changed:3,changes:[{cell:'A1',old:'Товар',new:'Дата'},{cell:'B1',old:'Цена',new:'DAU'},{cell:'B2',old:99,new:1200}]};
  if(name==='googleSheets'&&method==='exportRun')return {done:{spreadsheetId:ID,sheet:'Лист1',url,cells:8}};
  throw Error('unexpected '+name+'.'+method);
 });
 const units=[['Юнит','ID','Урон','Здоровье','Цена','Дальность','Скорость атаки','Класс'],['Лучник','archer',12,80,100,6,1.2,'стрелок'],['Рыцарь','knight',18,160,250,1,0.9,'воин'],['Маг','mage',25,60,300.5,5,0.7,'маг'],['Гоблин','goblin',6,40,30,1,1.5,'враг'],['Тролль <img src=x onerror=alert(1)>','troll',30,400,0,1,0.5,'враг'],['Дракон','dragon',-5,1200,2000,4,0.6,'босс']];
 const fmt=v=>typeof v==='number'?String(v).replace('.',','):v;
 const sheet={mode:'sheet',spreadsheetId:ID,title:'Баланс',url,tabs:[{id:0,title:'Юниты',rows:7},{id:1717,title:'Волны',rows:4},{id:9,title:'Экономика',rows:30}],writable:true,
  sheet:{id:0,title:'Юниты',rows:7,cols:8},header:0,text:units.map(r=>r.map(fmt)),numbers:units.map((r,i)=>r.map(v=>i&&typeof v==='number'?v:null)),numeric:[false,false,true,true,true,true,true,false],frozenCols:1,truncated:false};
 const find={mode:'find',spreadsheetId:ID,title:'Баланс',url,query:'лучника',searched:3,matches:[
  {sheet:'Юниты',gid:0,cell:'A2',row:2,col:0,value:'Лучник',fields:[{label:'Юнит',value:'Лучник'},{label:'ID',value:'archer'},{label:'Урон',value:'12'},{label:'Здоровье',value:'80'}]},
  {sheet:'Волны',gid:1717,cell:'B2',row:2,col:1,value:'Гоблин, Лучник',fields:[{label:'Волна',value:'1'},{label:'Враги',value:'Гоблин, Лучник'}]},
  {sheet:'Волны',gid:1717,cell:'B5',row:5,col:1,value:'Лучник x3',fields:[{label:'Волна',value:'4'},{label:'Враги',value:'Лучник x3'}]}]};
 const append={mode:'append',draftId:'d-append',spreadsheetId:ID,title:'Баланс',url,sheet:{id:0,title:'Юниты'},labels:['Юнит','ID','Урон','Здоровье','Цена'],row:['Друид','druid',14,90,180],numeric:[false,false,true,true,true],last:[['Маг','mage','25','60','300,5'],['Гоблин','goblin','6','40','30']]};
 const exp={mode:'export',draftId:'d-export',title:'Метрики игры · 7 дней',sheetName:'Метрики',app:'Метрики игры',header:['Дата','DAU','Новые','Выручка'],
  rows:Array.from({length:10},(_,i)=>['2026-11-0'+i,1200+i*37,300-i*7,5400.5+i*120]),total:10,truncated:false,canCreate:true,known:[{id:ID,title:'Баланс',sheets:['Юниты','Волны']},{id:'EconomyBook'+'b'.repeat(20),title:'Экономика',sheets:['Лист1']}]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'что в таблице баланса'},{role:'assistant',text:'Таблица «Баланс», лист «Юниты».',by:'Google Таблицы',extensionData:{sheetsCard:${JSON.stringify(sheet)}}},{role:'assistant',text:'Нашёл.',by:'Google Таблицы',extensionData:{sheetsCard:${JSON.stringify(find)}}},{role:'assistant',text:'Добавлю строку.',by:'Google Таблицы',extensionData:{sheetsCard:${JSON.stringify(append)}}},{role:'assistant',text:'Готово к выгрузке.',by:'Google Таблицы',extensionData:{sheetsCard:${JSON.stringify(exp)}}}],'Таблицы')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.sheets-card').length===4"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.sheets-card').length"),4);
 const first="document.querySelectorAll('.sheets-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.gs-tabs .kit-chip').length"),3);
 assert.deepEqual(await js(`[...${first}.querySelectorAll('thead th')].slice(0,3).map(t=>t.textContent)`),['Юнит','ID','Урон']);
 assert.equal(await js(first+".querySelectorAll('tbody tr').length"),6);
 assert.equal(await js(first+".querySelectorAll('td.num .gs-bar').length")>10,true,'number bars');
 assert.equal(await js(first+".querySelectorAll('.gs-bar.neg').length"),1,'negative value marked');
 assert.equal(await js("getComputedStyle(document.querySelector('.gs-table td.gs-first')).position"),'sticky','frozen first column');
 assert.equal(await js("document.querySelectorAll('.sheets-card img').length"),0,'cell text is never HTML');
 // Filter rows.
 await js(first+".querySelector('.gs-filter').value='враг';"+first+".querySelector('.gs-filter').dispatchEvent(new Event('input'))");
 assert.equal(await js(first+".querySelectorAll('tbody tr').length"),2);
 assert.match(await js(first+".querySelector('.gs-count').textContent"),/^2 из 6/);
 await js(first+".querySelector('.gs-filter').value='';"+first+".querySelector('.gs-filter').dispatchEvent(new Event('input'))");
 // Find results by tab.
 const second="document.querySelectorAll('.sheets-card')[1]";
 assert.equal(await js(second+".querySelectorAll('.gs-find-tab').length"),2);
 assert.equal(await js(second+".querySelectorAll('.gs-match').length"),3);
 // Export: choosing an existing tab shows «Показать изменения»; the preview lists old → new.
 const fourth="document.querySelectorAll('.sheets-card')[3]";
 assert.equal(await js(fourth+".querySelector('[data-action=check]').hidden"),true);
 await js(`(()=>{const r=${fourth}.querySelector('input[value=existing]');r.checked=true;r.dispatchEvent(new Event('change'));})()`);
 assert.equal(await js(fourth+".querySelector('[data-action=check]').hidden"),false);
 await js(fourth+".querySelector('[data-action=check]').click()");
 for(let i=0;i<100;i++){if(await js(fourth+".querySelectorAll('.gs-diff-list li').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(fourth+".querySelectorAll('.gs-diff-list li').length"),3);
 assert.deepEqual(calls.find(c=>c[1]==='exportPreview').slice(2),['d-export',{kind:'existing',spreadsheetId:ID,sheet:'Юниты'}]);
 await js("document.querySelectorAll('.sheets-card').forEach((c,i)=>c.dataset.shot=i<2?'a':i===2?'b':'c')");
 await require('./card-shot.cjs')(win,'.sheets-card[data-shot=a]','petya-google-sheets');
 await require('./card-shot.cjs')(win,'.sheets-card[data-shot=b]','petya-google-sheets-append');
 await require('./card-shot.cjs')(win,'.sheets-card[data-shot=c]','petya-google-sheets-export');
 // Clicks after the screenshot: another tab, the append (once) and the export.
 await js(`document.querySelectorAll('.sheets-card')[0].querySelectorAll('.gs-tabs .kit-chip')[1].click()`);
 for(let i=0;i<100;i++){if(await js(`document.querySelectorAll('.sheets-card')[0].querySelector('.kit-subtitle').textContent==='Волны'`))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(`document.querySelectorAll('.sheets-card')[0].querySelectorAll('tbody tr').length`),3);
 const third="document.querySelectorAll('.sheets-card')[2]";
 assert.equal(await js(third+".querySelector('tr.gs-new td').textContent"),'Друид');
 await js(third+".querySelector('.kit-actions button.primary').click()");
 for(let i=0;i<100;i++){if(await js(third+".querySelector('.kit-chip.tone-done')!==null"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(calls.filter(c=>c[1]==='append').length,1);assert.equal(await js(third+".querySelector('.kit-actions button.primary')"),null,'confirm button gone after the write');
 await js(fourth+".querySelector('[data-action=export]').click()");
 for(let i=0;i<100;i++){if(await js(fourth+".querySelector('.kit-chip.tone-done')!==null"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(calls.filter(c=>c[1]==='exportRun').length,1);
 console.log('Google Sheets cards: tabs, filter, sticky header and first column, number bars, search by tab, append once, export with a cell diff passed');
}};
require('../src/main.cjs');
