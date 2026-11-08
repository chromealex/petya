process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js(`view('home');showDialogueMessages([{role:'assistant',text:'Найдено 7 задач.\\nBW-1 — Исправить вход (In Progress)',jiraItems:Array.from({length:7},(_,i)=>({key:'BW-'+(i+1),site:'https://example.atlassian.net',summary:'Исправить вход <img src=x>',status:'In Progress',category:'indeterminate',assignee:'Анна',priority:'High'})),extensionData:{slackMessages:[{author:'Мария',at:Date.now(),text:'Проверила вход. Всё работает. <script>bad</script>',url:'https://app.slack.com/archives/C1/p123'}]}}])`);
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.jira-issue-card').length===7&&!!document.querySelector('.slack-message-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.jira-issue-card').length"),7);
 assert.equal(await js("document.querySelector('.jira-issue-card a').href"),'https://example.atlassian.net/browse/BW-1');
 assert.equal(await js("document.querySelectorAll('.jira-issue-list details section').length"),2);
 assert(await js("document.querySelector('.slack-message-card').textContent.includes('Мария')"));
 assert(await js("!!document.querySelector('.slack-message-card time').dateTime"));
 assert.equal(await js("document.querySelectorAll('.jira-issue-card img,.slack-message-card script').length"),0);
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-service-cards.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Extension cards: Jira metadata/link/collapse, Slack author/time, safe text and descriptor dispatch passed');
}};
require('../src/main.cjs');
