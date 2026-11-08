// «Сборки» card in the real chat: failed run with job/step and log lines, history strips, recent runs,
// rerun confirmation inside the card, safe text, and a green card without a failure.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const iso=m=>new Date(Date.now()-m*60000).toISOString();
 const r=(n,status,m,extra={})=>({key:'gh:acme/game:'+n,source:'github',repo:'acme/game',group:'gh:acme/game:1',workflow:'CI',number:n,title:'Commit '+n,branch:'main',status,duration:250+n,at:iso(m),url:'https://github.com/acme/game/actions/runs/'+n,...extra});
 const failure={key:'gh:acme/game:412',source:'github',repo:'acme/game',workflow:'CI',number:412,branch:'main',title:'Speed up the sum helper <img src=x onerror=alert(1)>',url:'https://github.com/acme/game/actions/runs/412/job/77',job:'test',step:'Run tests',
  lines:['FAIL src/sum.test.js','● sum › adds numbers','TypeError: Cannot read properties of undefined (reading \'length\')','at sum (src/sum.js:3:12)'],error:'',at:iso(30),rerun:'gh:acme/game:412',handoff:'Исправь код проекта, чтобы проходила проверка «test», шаг «Run tests». Ошибка:\nTypeError'};
 const statuses=['success','success','failure','success','success','success','cancelled','success','failure','failure'];
 const history=[{key:'gh:acme/game:1',name:'CI',source:'github',repo:'acme/game',runs:statuses.map((s,i)=>({status:s,number:403+i,branch:'main',at:iso(400-i*30),url:'https://github.com/acme/game/actions/runs/'+(403+i),title:'Commit'}))},
  {key:'gh:acme/game:2',name:'Android release build',source:'github',repo:'acme/game',runs:['success','success','running'].map((s,i)=>({status:s,number:80+i,branch:'release/1.2',at:iso(300-i*60),url:'',title:''}))},
  {key:'unity:default-ios',name:'iOS',source:'unity',repo:'',runs:['success','failure','success','success','queued'].map((s,i)=>({status:s,number:20+i,branch:'main',at:iso(500-i*60),url:'',title:''}))}];
 const runs=[r(413,'running',2,{title:'Merge pull request #88 from acme/feature/very-long-branch-name-for-layout-check',branch:'feature/very-long-branch-name-for-layout-check'}),r(412,'failure',30,{title:failure.title}),{...r(82,'running',4),workflow:'Android release build',branch:'release/1.2',number:82},{key:'unity:default-ios:24',source:'unity',repo:'',workflow:'iOS',number:24,title:'Speed tweak',branch:'main',status:'queued',duration:12,at:iso(5),url:''},r(411,'success',90),r(410,'success',200)];
 const red={runs,history,failure,repos:['acme/game'],errors:[],filter:{kind:'why',platform:'',branch:''},note:''};
 const green={runs:[r(420,'success',3),r(419,'success',60)],history:[{...history[0],runs:history[0].runs.map(x=>({...x,status:'success'}))}],failure:null,repos:['acme/game'],errors:[{source:'Unity Build Automation',text:'Unity Build Automation: не найдено. Проверьте ID организации и проекта.'}],filter:{kind:'status',platform:'android',branch:''},note:''};
 // Only «Программист» is connected: the failed run offers it and no tracker or Slack link.
 await js("window.petya.saveSettings({extension_coder:'true'})");
 await js(`view('home');showDialogueMessages([{role:'user',text:'почему упала сборка?'},{role:'assistant',text:'Упал «CI» #412 на main.',by:'Сборки',extensionData:{ciCard:${JSON.stringify(red)}}},{role:'assistant',text:'Последние сборки: 2 успешно.',by:'Сборки',extensionData:{ciCard:${JSON.stringify(green)}}}],'Сборки')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.ci-card').length===2&&!!document.querySelector('.ci-card .kit-link[data-provider=coder]')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.ci-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.ci-card')[0].querySelectorAll('.ci-log-line').length"),4);
 assert.equal(await js("document.querySelector('.ci-step').textContent"),'Run tests');
 assert.equal(await js("document.querySelectorAll('.ci-card img').length"),0,'commit titles are never HTML');
 assert.equal(await js("document.querySelectorAll('.ci-card')[0].querySelectorAll('.ci-history-row').length"),3);
 assert.equal(await js("document.querySelectorAll('.ci-card')[0].querySelector('.ci-strip').querySelectorAll('.ci-cell.failure').length"),3);
 assert.equal(await js("document.querySelectorAll('.ci-card')[0].querySelectorAll('.ci-history-row')[1].querySelectorAll('.ci-cell.empty').length"),7,'short history is padded to 10 cells');
 assert.equal(await js("document.querySelectorAll('.ci-card')[0].querySelectorAll('.ci-run').length"),6);
 assert.deepEqual(await js("[...document.querySelectorAll('.ci-card')[0].querySelectorAll('.kit-actions button')].map(b=>b.textContent)"),['Открыть','Перезапустить…','Отдать Программисту']);
 assert.deepEqual(await js("[...document.querySelectorAll('.ci-card')[1].querySelectorAll('.kit-actions button')].map(b=>b.textContent)"),['Открыть','Обновить']);
 assert.equal(await js("document.querySelectorAll('.ci-card')[1].querySelector('.kit-chip').textContent"),'всё зелёное');
 // «Перезапустить…» only opens a confirmation; nothing is sent until «Перезапустить» in it.
 await js(`document.querySelectorAll('.ci-card')[0].querySelectorAll('.kit-actions button')[1].click()`);
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await js("document.querySelectorAll('.ci-confirm').length"),1);
 assert.equal(await js("document.querySelectorAll('.kit-toast').length"),0,'no call before confirmation');
 const file=await require('./card-shot.cjs')(win,'.ci-card','petya-ci-builds');
 // The lower part (actions, the green card) in a second picture.
 await js("document.getElementById('card-shot').scrollTop=1e6;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace(/\.png$/,'-bottom.png'),(await win.webContents.capturePage()).toPNG());
 // The confirmed call reaches the app in the main process, which refuses a run it did not show itself.
 await js("document.querySelector('.ci-confirm button.primary').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.kit-toast')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.kit-toast').textContent"),/карточка устарела/);
 assert.equal(await js("document.querySelectorAll('.ci-confirm').length"),1,'a refused rerun keeps the confirmation for another try');
 console.log('Screenshot: '+file);
 console.log('CI builds card: failure with job/step and log lines, history strips padded to 10, recent runs, safe text, rerun only after confirmation passed');
}};
require('../src/main.cjs');
