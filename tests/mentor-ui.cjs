// «Петя-наставник» card in the real chat, from the analysis of the synthetic history (tests/fixtures/mentor-history.cjs):
// ranked rows with time bars, proposal chips, evidence with dates, drafts, «Как считал», the weekly switch; «Создать»
// reaches the app in the main process, which refuses a card it did not make itself.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {NOW,topics}=require('./fixtures/mentor-history.cjs');
 const mentor=require('../src/extensions/mentor/feature.cjs');
 const card=mentor.analyzeNow({settings:{},dataRoot:require('node:os').tmpdir(),companyId:'ui',dialogue:{state:{topics:topics()}},recurring:{list:()=>[{command:'Проверь почту'}]}},NOW);
 assert.equal(card.patterns.length,6);
 await js(`view('home');showDialogueMessages([{role:'user',text:'что мне автоматизировать?'},{role:'assistant',text:${JSON.stringify(mentor.summary(card))},by:'Петя-наставник',extensionData:{mentorCard:${JSON.stringify(card)}}}]);`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.mentor-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.mentor-row').length"),6);
 assert.deepEqual(await js("[...document.querySelectorAll('.mentor-row')].map(r=>r.dataset.type)"),card.patterns.map(p=>p.proposal.type));
 const widths=await js("[...document.querySelectorAll('.mentor-bar span')].map(s=>parseFloat(s.style.width))");
 assert.equal(widths[0],100);for(let i=1;i<widths.length;i++)assert.ok(widths[i-1]>=widths[i],'bars follow the ranking');
 assert.equal(await js("document.querySelectorAll('.mentor-evidence li').length"),card.patterns.reduce((a,p)=>a+p.examples.length,0));
 assert.ok(await js("!!document.querySelector('.mentor-evidence time')"),'evidence dates are <time>');
 assert.match(await js("document.querySelector('.mentor-row[data-type=skill] .mentor-pre').textContent"),/^---\nname: /);
 assert.match(await js("document.querySelector('.mentor-row[data-type=extension] .mentor-pre').textContent"),/"setting": "extension_my-/);
 assert.match(await js("document.querySelector('.mentor-row[data-type=schedule] .mentor-phrase').textContent"),/каждый день в 09:30$/);
 assert.match(await js("document.querySelector('.mentor-weekly').textContent"),/Еженедельный разбор выключен\.Присылать по пятницам, 17:00/);
 assert.equal(await js("document.querySelectorAll('.mentor-card [data-no-i18n].mentor-title').length"),6,'the user\'s own words are not translated');
 // Open the first evidence and draft for the screenshot.
 await js("document.querySelector('.mentor-row .mentor-evidence').open=true;document.querySelector('.mentor-row[data-type=skill] .mentor-draft').open=true;document.querySelector('.mentor-how').open=true");
 const shot=await require('./card-shot.cjs')(win,'.mentor-card','petya-mentor');
 await js("document.getElementById('card-shot').scrollTop=1e6;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(shot.replace(/\.png$/,'-bottom.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Screenshot: '+shot);
 await js("document.querySelector('.mentor-row .mentor-actions button.primary').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.kit-toast')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.kit-toast').textContent"),/карточка устарела/);
 console.log('Mentor card: ranked rows with bars, proposal chips, evidence dates, drafts, method, weekly switch, create through the app passed');
}};
require('../src/main.cjs');
