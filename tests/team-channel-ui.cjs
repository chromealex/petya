// Isolated UI fixture: no Slack credentials or real roster writes.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
let calls=[];
require('../src/slack-team.cjs').SlackTeam.prototype.collect=async function(command){
 calls.push(command);
 if(calls.length===1)throw Object.assign(Error('Directory limit'),{code:'SLACK_CHANNEL_LOOKUP_REQUIRED'});
 return [{member:require('../src/team.cjs').validate([{name:'Тестовый коллега',slackId:'UTEST'}])[0],source:'Slack',evidence:'Тестовый коллега'}];
};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+code);};
 await js('window.chatNavigationReady');
 await js("view('home');$('command').value='Заполни команду';window.sendChatNow()");
 await wait("!!document.querySelector('.clarification-input.text-clarification')");
 assert(await js("document.querySelector('.chat-composer').contains(document.querySelector('.clarification-input'))"));
 assert.equal(calls.length,1);
 // The answer is typed in the composer; «Продолжить» stays disabled until there is text.
 assert.equal(await js("document.querySelector('.clarification-input .primary').disabled"),true);
 await js("$('command').value='https://example.slack.com/archives/CTEST';$('command').dispatchEvent(new Event('input'));document.querySelector('.clarification-input .primary').click()");
 await wait("dialogueMessages.textContent.includes('Добавлено коллег: 1')");
 assert.equal(calls.length,2);assert.match(calls[1],/Заполни команду из Slack https:/);
 await wait("!document.querySelector('.clarification-input')");
 console.log('Team channel UI: inline address, single-submit continuation and successful dismissal passed');
}};
require('../src/main.cjs');
