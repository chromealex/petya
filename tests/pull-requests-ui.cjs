// «Pull requests» cards in the real chat: the list (avatar, +/− bar, checks, review, age), one PR (summary bullets,
// checks, files bar chart), safe text and the comment box that sends only after confirmation.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const iso=h=>new Date(Date.now()-h*3600000).toISOString();
 const item=(repo,n,title,author,add,del,checks,review,h,extra={})=>({key:repo+'#'+n,repo,number:n,title,author,url:'https://github.com/'+repo+'/pull/'+n,draft:false,createdAt:iso(h+20),updatedAt:iso(h),additions:add,deletions:del,files:4,base:'main',head:'feature/'+n,
  checks:{state:checks,passed:checks==='success'?5:3,failed:checks==='failure'?1:0,pending:checks==='pending'?2:0,list:[]},review,...extra});
 const listCard={mode:'list',scope:'review',title:'Ждут вашего ревью',repos:[],total:5,items:[
  item('acme/game',412,'Speed up the sum helper and cache results <img src=x onerror=alert(1)>','alice',1240,310,'failure','pending',2),
  item('acme/game',408,'Fix login on Android 14','bob',38,12,'success','approved',20),
  item('acme/tools',77,'Bump dependencies','renovate-bot',3,3,'pending','changes',48,{draft:true}),
  item('acme/tools',75,'Docs: describe the release process in detail with all the steps we use today','Карина Смирнова',220,0,'none','commented',200)]};
 const single={mode:'pr',...item('acme/game',412,'Speed up the sum helper and cache results','alice',1240,310,'failure','changes',2),
  checks:{state:'failure',passed:3,failed:1,pending:1,list:[{name:'test (ubuntu-latest)',status:'failure',url:'https://github.com/acme/game/runs/1'},{name:'build-android',status:'pending',url:''},{name:'lint',status:'success',url:''},{name:'typecheck',status:'success',url:''}]},
  summary:{bullets:['Заменяет reduce на цикл в sum и кэширует результат по ключу массива.','Добавляет тесты на пустой массив и большие числа.','Обновляет README с примерами.'],risk:'Кэш не сбрасывается при изменении массива — возможны устаревшие значения.'},summarized:true,
  fileList:[{name:'src/math/sum.js',status:'modified',additions:120,deletions:80},{name:'src/math/cache.js',status:'added',additions:300,deletions:0},{name:'tests/math/sum.test.js',status:'added',additions:410,deletions:0},{name:'README.md',status:'modified',additions:40,deletions:12},{name:'src/legacy/old-sum.js',status:'removed',additions:0,deletions:200},
   ...Array.from({length:6},(_,i)=>({name:'packages/very/long/path/to/some/deeply/nested/module-'+i+'/index.js',status:'modified',additions:60+i*10,deletions:3+i}))],description:''};
 await js(`view('home');showDialogueMessages([{role:'user',text:'какие PR ждут моего ревью'},{role:'assistant',text:'Вашего ревью ждут 5 PR.',by:'Pull requests',extensionData:{prCard:${JSON.stringify(listCard)}}},{role:'assistant',text:'acme/game#412',by:'Pull requests',extensionData:{prCard:${JSON.stringify(single)}}}],'PR')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.pr-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.pr-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.pr-row').length"),4);
 assert.equal(await js("document.querySelectorAll('.pr-card img').length"),0,'titles are never HTML');
 assert.equal(await js("document.querySelectorAll('.pr-row')[0].querySelector('.kit-person').textContent"),'A');
 assert.equal(await js("document.querySelectorAll('.pr-row')[0].querySelector('.pr-plus').textContent"),'+'+(1240).toLocaleString('ru-RU'));
 assert.ok(await js("document.querySelectorAll('.pr-row')[0].querySelector('.pr-diff-bar').offsetWidth>document.querySelectorAll('.pr-row')[1].querySelector('.pr-diff-bar').offsetWidth"),'bigger change, longer bar');
 assert.equal(await js("document.querySelectorAll('.pr-row')[0].querySelectorAll('.kit-chip.tone-alert').length"),1,'failed checks are red');
 assert.equal(await js("document.querySelectorAll('.pr-summary li').length"),3);
 assert.equal(await js("document.querySelectorAll('.pr-card')[1].querySelectorAll('.pr-file').length"),11);
 assert.equal(await js("document.querySelector('.pr-check.failure').textContent"),'test (ubuntu-latest)');
 assert.equal(await js("document.querySelectorAll('[data-no-i18n].pr-title').length"),4,'service text is left to the translator');
 // The comment box: nothing is sent until the confirmation is accepted.
 await js("[...document.querySelectorAll('.pr-card')[1].querySelectorAll('.kit-actions button')].at(-1).click()");
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await js("document.querySelectorAll('.pr-compose textarea').length"),1);
 await js("const t=document.querySelector('.pr-compose textarea');t.value='Кэш стоит сбрасывать при изменении массива.';document.querySelector('.pr-compose .kit-actions button.primary').click()");
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await js("document.querySelectorAll('.pr-confirm').length"),1);assert.equal(await js("document.querySelectorAll('.kit-toast').length"),0,'no call before confirmation');
 const file=await require('./card-shot.cjs')(win,'.pr-card','petya-pull-requests');
 await js("document.getElementById('card-shot').scrollTop=1e6;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace(/\.png$/,'-bottom.png'),(await win.webContents.capturePage()).toPNG());
 // The confirmed call reaches the app in the main process, which refuses a PR it did not show itself.
 await js("document.querySelector('.pr-confirm button.primary').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.kit-toast')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.kit-toast').textContent"),/карточка устарела/);
 console.log('Screenshot: '+file);
 console.log('Pull requests cards: list rows with avatar/+−/checks/review, single PR summary, checks and files bars, safe text, comment sent only after confirmation passed');
}};
require('../src/main.cjs');
