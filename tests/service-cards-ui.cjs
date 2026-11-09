process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js(`view('home');showDialogueMessages([{role:'assistant',text:'Найдено 7 задач.\\nBW-1 — Исправить вход (In Progress)',jiraItems:Array.from({length:7},(_,i)=>({key:'BW-'+(i+1),site:'https://example.atlassian.net',summary:'Исправить вход <img src=x>',status:'In Progress',category:'indeterminate',assignee:'Анна',priority:'High'})),extensionData:{slackMessages:[{author:'Мария',at:Date.now(),text:'Проверила вход. Всё работает. <script>bad</script>',url:'https://app.slack.com/archives/C1/p123'}]}}])`);
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.jira-issue-card').length===7&&!!document.querySelector('.slack-msg')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.jira-issue-card').length"),7);
 assert.equal(await js("document.querySelector('.jira-issue-card a').href"),'https://example.atlassian.net/browse/BW-1');
 assert.equal(await js("document.querySelectorAll('.jira-issue-list details section').length"),2);
 assert(await js("document.querySelector('.slack-msg').textContent.includes('Мария')"));
 assert(await js("!!document.querySelector('.slack-msg time').dateTime"));
 assert.equal(await js("document.querySelectorAll('.jira-issue-card img,.slack-msg script').length"),0);
 // Slack markup left in older cards reads as text: a labelled link, a person by name (or «Участник Slack»), no raw <…>.
 await js(`(()=>{const box=document.createElement('div');box.id='slack-raw';document.querySelector('.chat-feed').append(box);window.renderSlackMessages(box,[{author:'U043B3BETHQ',at:Date.now()-3600000,text:'<https://docs.google.com/spreadsheets/d/1/edit|https://docs.google.com/spreadsheets/d/1/edit> тут смотрят, <@U090C4PDLJG>',url:'https://x.slack.com/archives/C1/p1793863632177059'}]);})()`);
 assert.equal(await js("document.querySelector('#slack-raw .slack-link').textContent"),'Google Таблица');
 assert(!(await js("document.querySelector('#slack-raw .slack-text').textContent")).includes('<'));
 assert.equal(await js("document.querySelector('#slack-raw .slack-author').textContent"),'Участник Slack');
 assert(await js("!!document.querySelector('#slack-raw .slack-tool[aria-label=\"Открыть в Slack\"]')"),'opens in the Slack app');
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-service-cards.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Extension cards: Jira metadata/link/collapse, Slack author/time, safe text and descriptor dispatch passed');
}};
require('../src/main.cjs');
