// «Место на диске» card in the real chat: volume bar, categories as bars with tags and notes, an expanded row with
// its biggest subfolders, and the cleanup confirmation listing exact paths and the total before anything happens.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const G=1e9,H='/Users/alex';
 const item=(name,path,bytes,extra={})=>({name,path,bytes,...extra});
 const disk={scanId:'stale-scan',at:Date.parse('2026-11-08T10:40:00Z'),elapsedMs:14200,partial:true,cancelled:false,skipped:3,platform:'darwin',unityRoots:[H+'/Projects'],
  volume:{path:H,total:494.4*G,free:31.2*G,used:463.2*G},
  categories:[
   {id:'unity-library',label:'Unity: папки Library',tag:'regen',clean:'trash',note:'Library пересоздаётся Unity при открытии проекта, займёт время.',bytes:61.3*G,partial:false,skipped:0,roots:[H+'/Projects/BunkerWars',H+'/Projects/MetroWars'],
    items:[item('BunkerWars',H+'/Projects/BunkerWars/Library',38.1*G,{project:H+'/Projects/BunkerWars'}),item('MetroWars',H+'/Projects/MetroWars/Library',19.9*G,{project:H+'/Projects/MetroWars'}),item('Prototype <img src=x onerror=alert(1)>',H+'/Projects/Prototype/Library',3.3*G)]},
   {id:'ollama',label:'Модели Ollama',tag:'caution',clean:'ollama',note:'Удаляются только через «ollama rm»; модель придётся скачать заново.',bytes:42.7*G,partial:false,skipped:0,roots:[H+'/.ollama/models'],
    items:[item('qwen3:30b',H+'/.ollama/models/manifests/registry.ollama.ai/library/qwen3/30b',18.6*G,{model:true}),item('gemma3:27b',H+'/.ollama/models/manifests/registry.ollama.ai/library/gemma3/27b',17.4*G,{model:true}),item('qwen3:4b',H+'/.ollama/models/manifests/registry.ollama.ai/library/qwen3/4b',2.6*G,{model:true})]},
   {id:'xcode-derived',label:'Xcode: DerivedData',tag:'safe',clean:'trash',note:'Промежуточные файлы сборки — Xcode пересоберёт их сам.',bytes:28.4*G,partial:false,skipped:0,roots:[H+'/Library/Developer/Xcode/DerivedData'],
    items:[item('Unity-iPhone-gqbxkz',H+'/Library/Developer/Xcode/DerivedData/Unity-iPhone-gqbxkz',21.2*G),item('Petya-abcd',H+'/Library/Developer/Xcode/DerivedData/Petya-abcd',7.2*G)]},
   {id:'docker',label:'Docker Desktop: диск',tag:'caution',clean:null,note:'Образ диска Docker — чистите через «docker system prune» или настройки Docker Desktop.',bytes:22.1*G,partial:false,skipped:0,roots:[H+'/Library/Containers/com.docker.docker/Data/vms/0/data'],items:[]},
   {id:'gradle',label:'Gradle: кэши',tag:'regen',clean:'trash',note:'Скачанные зависимости и кэш сборок — первая сборка после очистки будет долгой.',bytes:14.9*G,partial:false,skipped:0,roots:[H+'/.gradle/caches'],items:[item('modules-2',H+'/.gradle/caches/modules-2',9.1*G),item('transforms-4',H+'/.gradle/caches/transforms-4',5.8*G)]},
   {id:'downloads',label:'Загрузки',tag:'caution',clean:null,note:'Ваши файлы — проверьте сами, Петя их не удаляет.',bytes:11.6*G,partial:true,skipped:3,roots:[H+'/Downloads'],items:[item('Xcode_16.xip',H+'/Downloads/Xcode_16.xip',7.9*G)]},
   {id:'package-caches',label:'Кэши npm, Yarn, pnpm, pip',tag:'safe',clean:'trash',note:'Кэши загрузок пакетов — менеджеры скачают пакеты заново.',bytes:6.2*G,partial:false,skipped:0,roots:[H+'/.npm/_cacache',H+'/Library/Caches/pip'],items:[item('~/.npm/_cacache',H+'/.npm/_cacache',4.9*G),item('~/Library/Caches/pip',H+'/Library/Caches/pip',1.3*G)]},
   {id:'trash',label:'Корзина',tag:'safe',clean:null,note:'Уже удалённые файлы — очистите Корзину в Finder или Проводнике.',bytes:2.4*G,partial:false,skipped:0,roots:[H+'/.Trash'],items:[]}
  ]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'чем забит диск'},{role:'assistant',text:'Свободно 31,2 ГБ из 494 ГБ.',by:'Место на диске',extensionData:{diskUsage:${JSON.stringify(disk)}}}],'Диск')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.disk-card').length===1"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.disk-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.disk-row').length"),8);
 assert.equal(await js("document.querySelector('.disk-row .disk-row-name').textContent"),'Unity: папки Library','largest first');
 assert.equal(await js("document.querySelectorAll('.disk-card img').length"),0,'names are never HTML');
 assert.match(await js("document.querySelector('.disk-volume-track').getAttribute('aria-label')"),/Занято 94%/);
 assert.equal(await js("document.querySelector('.disk-volume-track').classList.contains('alert')"),true,'free < 10% is highlighted');
 assert.equal(await js("[...document.querySelectorAll('.disk-row-size')].map(n=>n.textContent).join('|')"),'61,3 ГБ|42,7 ГБ|28,4 ГБ|22,1 ГБ|14,9 ГБ|≥ 11,6 ГБ|6,2 ГБ|2,4 ГБ');
 assert.equal(await js("document.querySelector('.disk-card .kit-chip').textContent"),'частично');
 await require('./card-shot.cjs')(win,'.disk-card','petya-disk-usage-collapsed');
 // Expand the Unity row: its projects; «Очистить…» lists the exact paths and the total before anything is done.
 await js("document.querySelector('.disk-row').open=true");
 assert.equal(await js("document.querySelectorAll('.disk-row[open] .disk-item').length"),3);
 await js("document.querySelector('.disk-row[open] .disk-clean').click()");
 assert.equal(await js("document.querySelectorAll('.disk-confirm-list code').length"),3);
 assert.equal(await js("document.querySelector('.disk-confirm-list code').textContent"),H+'/Projects/BunkerWars/Library');
 assert.equal(await js("document.querySelector('.disk-confirm-total').textContent"),'Итого: 61,3 ГБ · выбрано 3');
 await js("document.querySelectorAll('.disk-confirm-list input')[2].click()");
 assert.equal(await js("document.querySelector('.disk-confirm .primary').textContent"),'Переместить в корзину · 58 ГБ');
 // Ollama rows start unchecked (caution) and remove only through `ollama rm`.
 await js("document.querySelectorAll('.disk-row')[1].open=true;document.querySelectorAll('.disk-row')[1].querySelector('.disk-clean').click()");
 assert.equal(await js("document.querySelectorAll('.disk-row')[1].querySelector('.disk-confirm .primary').disabled"),true);
 assert.match(await js("document.querySelectorAll('.disk-row')[1].querySelector('.disk-confirm-title').textContent"),/ollama rm/);
 assert.equal(await js("document.querySelectorAll('.disk-row')[3].querySelector('.disk-clean')"),null,'Docker is not cleaned by Petya');
 await require('./card-shot.cjs')(win,'.disk-card','petya-disk-usage');
 // A stale card (scan not in memory) refuses to clean anything.
 await js("document.querySelectorAll('.disk-row')[0].querySelector('.disk-confirm .primary').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.kit-toast.error')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.kit-toast.error').textContent"),/устарел/);
 assert.equal(await js("document.querySelectorAll('.disk-row')[0].querySelectorAll('.disk-confirm').length"),1,'confirmation stays after a refusal');
 console.log('Disk usage card: volume bar, sorted bars with tags, expanded rows, exact-path confirmation, caution unchecked, stale scan refused passed');
}};
require('../src/main.cjs');
