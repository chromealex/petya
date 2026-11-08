// «Выгрузить в Google Таблицы» on other apps' cards (cross-app kind `spreadsheet-export`): the button appears only
// when a provider is available, and pressing it hands the card's table (title, header, rows) to the provider.
// Checked on the A/B-test card built by the real analysis code.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),runs=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='spreadsheet-export'?[{id:'google-sheets',name:'Google Таблицы',label:'Выгрузить в Google Таблицы'}]:[];
  if(name==='appLinks'&&method==='run'){runs.push(args);return {text:'ok'};}
  return null;
 });
 const {analyze}=require('../src/extensions/ab-test/analyze.cjs');
 const card=analyze({metric:'conversion',variants:[{name:'A',users:10000,conversions:1000},{name:'B',users:10000,conversions:1080}]});
 await js(`view('home');showDialogueMessages([{role:'user',text:'посчитай A/B'},{role:'assistant',text:'Готово.',by:'A/B-тесты',extensionData:{abTestCard:${JSON.stringify(card)}}}],'A/B')`);
 for(let i=0;i<200;i++){if(await js("!!document.querySelector('.ab-card .kit-links[data-kind=spreadsheet-export] button')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.ab-card .kit-links[data-kind=spreadsheet-export] button').textContent"),'Выгрузить в Google Таблицы');
 await require('./card-shot.cjs')(win,'.ab-card','petya-spreadsheet-export-ab');
 await js("document.querySelector('.kit-links[data-kind=spreadsheet-export] button').click()");
 for(let i=0;i<100&&!runs.length;i++)await new Promise(r=>setTimeout(r,30));
 const [kind,id,payload]=runs[0];
 assert.equal(kind,'spreadsheet-export');assert.equal(id,'google-sheets');
 assert.equal(payload.header[0],'Группа');assert.deepEqual(payload.rows.map(r=>[r[0],r[1],r[2]]),[['A',10000,1000],['B',10000,1080]]);
 assert.ok(typeof payload.rows[1][6]==='number','lift of B over the control');
 console.log('Spreadsheet export from another card: button only with a provider, the card table handed over passed');
}};
require('../src/main.cjs');
