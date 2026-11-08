// Cross-app links in real cards: with no tracker connected a card shows no task button at all; with Jira and Asana
// both connected the button gets a «▾» menu, the choice is remembered, and the press hands a prepared request to
// the chat (captured here instead of sending).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+(label||test));};
 await js('window.chatNavigationReady');
 const summary={sessionId:'s1',title:'Планирование спринта 14',basis:'recording',decisions:['Релиз 1.5 переносим на среду','Логи матчмейкинга пишем в отдельный канал'],
  tasks:[{what:'Починить вылет при входе в магазин',who:'Олег',due:'пятница'},{what:'Подготовить сборку для QA',who:'Мария',due:''}],notDiscussed:['Бюджет на рекламу'],discussed:[]};
 const failure={key:'gh:acme/game:412',source:'github',repo:'acme/game',workflow:'CI',number:412,branch:'main',title:'Speed up the sum helper',url:'https://github.com/acme/game/actions/runs/412',job:'test',step:'Run tests',
  lines:['FAIL src/sum.test.js','TypeError: Cannot read properties of undefined'],error:'',at:new Date().toISOString(),rerun:'',handoff:'Исправь код проекта, чтобы проходила проверка «test». Ошибка: TypeError'};
 const ci={runs:[{key:'gh:acme/game:412',source:'github',repo:'acme/game',group:'g',workflow:'CI',number:412,title:'Speed up the sum helper',branch:'main',status:'failure',duration:250,at:new Date().toISOString(),url:failure.url}],history:[],failure,repos:['acme/game'],errors:[],filter:{},note:''};
 const show=(key,data,text)=>js(`showDialogueMessages([...(window.__shown||[]),{role:'assistant',text:${JSON.stringify(text)},by:'test',extensionData:{${key}:${JSON.stringify(data)}}}],'Ссылки')`);
 // 1. Nothing connected: no task, Programmer or Slack buttons, the rest of the card is intact.
 await js("view('home');window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};window.resultKit.availableLinks.clear()");
 await show('meetingSummary',summary,'Сводка встречи «Планирование спринта 14».');
 await wait("!!document.querySelector('.meeting-card')");
 await new Promise(r=>setTimeout(r,500));
 assert.equal(await js("document.querySelectorAll('.meeting-card .kit-link').length"),0,'no provider → no link buttons');
 assert.deepEqual(await js("[...document.querySelectorAll('.meeting-card>.kit-actions button')].map(b=>b.textContent)"),['В повестку следующей','Обновить']);
 const none=await require('./card-shot.cjs')(win,'.meeting-card','petya-links-none');
 await js("document.getElementById('card-shot').remove()");
 // 2. Jira and Asana connected (and the Programmer, Slack): split buttons with a menu.
 await js("window.petya.saveSettings({module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token',module_asana:'true',extension_coder:'true',module_slack:'true',slackToken:'xoxp-ui'})");
 // Asana's OAuth credential cannot be saved from the page: the listing shows it as a second tracker (the real
 // registry is covered by tests/app-links.cjs); runs still go through the real main process (Jira here).
 assert.deepEqual((await js("window.petya.feature('appLinks','available','task-tracker',{})")).map(p=>p.id),['jira']);
 await js(`(()=>{const real=window.resultKit.availableLinks;window.resultKit.availableLinks=async(kind,context)=>{const list=await real(kind,context);return kind==='task-tracker'?[...list,{id:'asana',name:'Asana',label:'В задачу Asana'}]:list;};window.resultKit.availableLinks.clear=real.clear;real.clear();localStorage.setItem('petya-kit-link-task-tracker','asana');document.querySelectorAll('.meeting-card,.ci-card').forEach(n=>n.closest('.message')?.remove());})()`);
 await js(`showDialogueMessages([{role:'assistant',text:'Сводка встречи.',by:'test',extensionData:{meetingSummary:${JSON.stringify(summary)}}},{role:'assistant',text:'Упал «CI» #412.',by:'Сборки',extensionData:{ciCard:${JSON.stringify(ci)}}}],'Ссылки')`);
 await wait("!!document.querySelector('.ci-card .kit-link[data-provider=coder]')&&document.querySelectorAll('.meeting-card .meeting-task .kit-links.several').length===2",'links rendered');
 assert.equal(await js("document.querySelector('.meeting-card>.kit-actions .kit-link.primary').textContent"),'Создать все: Asana','the remembered tracker comes first');
 assert.equal(await js("document.querySelector('.ci-card .kit-link[data-provider=slack]').textContent"),'Отправить в Slack');
 assert.equal(await js("document.querySelector('.ci-card .kit-links.several .kit-link').textContent"),'В задачу Asana');
 // The Programmer gets the CI hand-off text as is.
 await js("document.querySelector('.ci-card .kit-link[data-provider=coder]').click()");
 await wait("window.__asked.some(a=>a[0].startsWith('Исправь код проекта'))");
 await js('window.__asked=[]');
 // The menu lists both trackers; picking Jira runs it (real main process) and is remembered.
 const file=await require('./card-shot.cjs')(win,'.meeting-card,.ci-card','petya-links-two');
 await js("document.querySelector('#card-shot .ci-card .kit-links.several .kit-link-more').click()");
 await wait("document.querySelectorAll('.kit-menu .kit-menu-item').length===2");
 assert.deepEqual(await js("[...document.querySelectorAll('.kit-menu .kit-menu-item')].map(b=>b.textContent)"),['В задачу Jira','В задачу Asana']);
 // The overlay covers the floating menu: lift the menu above it for the picture.
 await js("document.querySelector('.kit-menu').style.zIndex='2147483647'");
 await new Promise(r=>setTimeout(r,200));
 const menuShot=require('node:path').join(require('node:os').tmpdir(),'petya-links-menu.png');
 require('node:fs').writeFileSync(menuShot,(await win.webContents.capturePage()).toPNG());
 await js("[...document.querySelectorAll('.kit-menu .kit-menu-item')][0].click()");
 await wait('window.__asked.length===1');
 const [text,send]=(await js('window.__asked'))[0];
 assert.match(text,/^Создай задачу в Jira: Баг\. Упала сборка CI #412 в acme\/game \(ветка main\)\. test → Run tests: FAIL src\/sum\.test\.js/);assert.equal(send,true);
 assert.equal(await js("document.querySelector('#card-shot .ci-card .kit-links.several .kit-link').textContent"),'В задачу Jira','the choice is remembered');
 assert.equal(await js("localStorage.getItem('petya-kit-link-task-tracker')"),'jira');
 console.log('App links UI: no buttons without providers, split button with a remembered menu choice, chat hand-off passed · '+none+', '+file+', '+menuShot);
}};
require('../src/main.cjs');
