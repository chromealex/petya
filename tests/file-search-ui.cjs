// «Поиск файлов по смыслу» cards in the real chat: results with type badges, highlighted best piece, similarity
// bars, locations and actions; the opt-in card with folders and the download button; the settings card.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const now=Date.now();
 const at=(text,...words)=>words.flatMap(w=>[...text.matchAll(new RegExp(w,'g'))].map(m=>[m.index,m.index+w.length]));
 const results={state:'results',query:'презентация про Китай с графиком LTV',request:'где презентация про Китай с графиком LTV?',indexed:1284,chunks:9120,folders:2,platform:'darwin',building:null,hits:[
  {path:'/Users/me/Projects/Bunker/docs/Китай.pptx',name:'Китай.pptx',dir:'/Users/me/Projects/Bunker/docs',shown:'~/Projects/Bunker/docs',ext:'pptx',kind:'slides',snippet:'Экономика рынка. График (line): LTV по когортам; LTV Китай за 90 дней, сравнение с Японией',ranges:at('Экономика рынка. График (line): LTV по когортам; LTV Китай за 90 дней, сравнение с Японией','График','LTV','Китай').sort((a,b)=>a[0]-b[0]),score:0.71,mtime:now-2*86400000,loc:{slide:7}},
  {path:'/Users/me/Projects/Bunker/docs/market/china-q3.pdf',name:'china-q3.pdf',dir:'/Users/me/Projects/Bunker/docs/market',ext:'pdf',kind:'pdf',snippet:'… выход в Китай во втором квартале: прогноз LTV и удержания по регионам <img src=x onerror=alert(1)>',ranges:at('… выход в Китай во втором квартале: прогноз LTV и удержания по регионам <img src=x onerror=alert(1)>','Китай','LTV'),score:0.58,mtime:now-40*86400000,loc:{page:3}},
  {path:'/Users/me/Projects/Bunker/Assets/Scripts/Analytics/LtvModel.cs',name:'LtvModel.cs',dir:'/Users/me/Projects/Bunker/Assets/Scripts/Analytics',shown:'~/Projects/Bunker/Assets/Scripts/Gameplay/Economy/Analytics/Models/Long/Path',ext:'cs',kind:'code',snippet:'public static float PredictLtv(Cohort c){ // LTV по когортам для отчёта по рынкам',ranges:at('public static float PredictLtv(Cohort c){ // LTV по когортам для отчёта по рынкам','LTV'),score:0.44,mtime:now-3600000,loc:{line:42}},
  {path:'/Users/me/Projects/Bunker/docs/monetization.md',name:'monetization.md',dir:'/Users/me/Projects/Bunker/docs',ext:'md',kind:'markdown',snippet:'Монетизация › Азия: цены в юанях',ranges:[],score:0.31,mtime:now-9*86400000,loc:{heading:'Монетизация › Азия'}}]};
 const building={...results,query:'скрипт, который сохраняет прогресс',hits:[],building:{phase:'indexing',done:412,total:1284,paused:false}};
 const setup={state:'setup',query:'презентация про Китай',request:'где презентация про Китай?',model:'qwen3-embedding:0.6b',bytes:639000000,modelInstalled:false,ollama:true,platform:'darwin',
  folders:[{path:'/Users/me/Projects/Bunker',project:'Bunker Wars',own:false},{path:'/Users/me/Documents/Отчёты',project:'',own:true}]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'где презентация про Китай с графиком LTV?'},{role:'assistant',text:'Нашёл по смыслу 4 файла.',by:'Поиск файлов',extensionData:{fileSearch:${JSON.stringify(results)}}},{role:'user',text:'найди скрипт, который сохраняет прогресс'},{role:'assistant',text:'Пока ничего похожего.',by:'Поиск файлов',extensionData:{fileSearch:${JSON.stringify(building)}}},{role:'assistant',text:'Включить?',by:'Поиск файлов',extensionData:{fileSearch:${JSON.stringify(setup)}}}],'Поиск файлов')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.fs-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.fs-card').length"),3);
 assert.equal(await js("document.querySelectorAll('.fs-card')[0].querySelectorAll('.fs-hit').length"),4);
 assert.equal(await js("document.querySelector('.fs-hit.best .fs-name').textContent"),'Китай.pptx');
 assert.equal(await js("document.querySelector('.fs-hit.best .fs-badge').textContent"),'PPTX');
 assert.equal(await js("document.querySelector('.fs-hit.best .fs-loc').textContent"),'слайд 7');
 assert.deepEqual(await js("[...document.querySelector('.fs-hit.best .fs-snippet').querySelectorAll('mark')].map(m=>m.textContent)"),['График','LTV','LTV','Китай']);
 assert.equal(await js("document.querySelectorAll('.fs-card img').length"),0,'snippets are text, never HTML');
 assert.equal(await js("document.querySelector('.fs-hit.best .fs-snippet').dataset.noI18n"),'','file text is not translated');
 assert.equal(await js("document.querySelector('.fs-hit.best .fs-score').getAttribute('aria-valuenow')"),'0.71');
 assert.deepEqual(await js("[...document.querySelector('.fs-hit.best .fs-actions').querySelectorAll('button')].map(b=>b.textContent)"),['Открыть','Показать в Finder','Спросить по этому файлу']);
 assert.equal(await js("document.querySelectorAll('.fs-card')[0].querySelector('details.kit-more summary')?.textContent"),'Ещё файлы · 1');
 assert.equal(await js("document.querySelectorAll('.fs-card')[1].querySelector('.fs-building span').textContent"),'Индекс строится: 412 из 1 284'.replace(' ',' ').replace('1 284',(1284).toLocaleString('ru-RU')));
 assert.equal(await js("document.querySelectorAll('.fs-card')[2].querySelectorAll('.fs-folders li').length"),2);
 assert.match(await js("document.querySelector('.fs-setup .kit-actions button.primary').textContent"),/Скачать модель и включить \(639 МБ\)/);
 // Widths: the card keeps to its column and nothing overflows horizontally.
 assert(await js("[...document.querySelectorAll('.fs-card')].every(c=>c.scrollWidth<=c.clientWidth+1)"),'no horizontal overflow');
 await require('./card-shot.cjs')(win,'.fs-card:not(.fs-setup)','petya-file-search');
 await require('./card-shot.cjs')(win,'.fs-setup','petya-file-search-setup');
 // Settings card: switch, folders, model state, the wipe as a red trash button.
 const settings=await js(`(async()=>{view('settings');await new Promise(r=>setTimeout(r,400));const c=document.querySelector('[data-extension="file-search"]');return c?{wipe:!!c.querySelector('.delete-button'),toggle:!!c.querySelector('input[type=checkbox]'),text:c.textContent.slice(0,200)}:null;})()`);
 assert(settings,'settings card mounted');assert.equal(settings.wipe,true);assert.equal(settings.toggle,true);
 await new Promise(r=>setTimeout(r,500));
 // The host hides settings of apps that are not added; show it for the picture.
 await js(`document.querySelector('#settings-form [data-extension="file-search"]').hidden=false;document.querySelector('#settings-form [data-extension="file-search"] details').open=true`);
 await require('./card-shot.cjs')(win,'#settings-form [data-extension="file-search"]','petya-file-search-settings');
 console.log('File search cards: badges, highlighted best piece, similarity bars, locations, actions, building progress, opt-in card and settings passed');
}};
require('../src/main.cjs');
