// Settings of the GitHub-based apps in the real window: adding «Сборки» shows its card, «Настроить GitHub» adds and
// reveals the shared «GitHub» card; the token never comes back to the form; default repos are validated on save.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async test=>{for(let i=0;i<150;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+test);};
 await js('window.chatNavigationReady');
 await js("window.extensionHost.open('ci-builds')");
 await wait("!!document.querySelector('[data-extension=\"ci-builds\"]:not([hidden])')");
 await wait("/GitHub не подключён/.test(document.querySelector('[data-extension=\"ci-builds\"] .ci-github').textContent)");
 await js("document.querySelector('[data-extension=\"ci-builds\"] .ci-open-github').click()");
 await wait("!!document.querySelector('[data-extension=\"github\"]:not([hidden])')");
 await js("window.extensionHost.open('pull-requests',{stay:true})");
 await wait("!!document.querySelector('[data-extension=\"pull-requests\"]:not([hidden])')");
 // Invalid default repository is refused with a clear message; a valid list is normalized.
 await js("{const c=document.querySelector('[data-extension=\"github\"]');c.querySelector('details')?.setAttribute('open','');c.querySelector('[name=githubRepos]').value='not a repo';c.querySelector('.github-save').click()}");
 await wait("/owner\\/repo/.test(document.querySelector('[data-extension=\"github\"] [role=status]').textContent)");
 await js("{const c=document.querySelector('[data-extension=\"github\"]');c.querySelector('[name=githubRepos]').value='acme/game ,https://github.com/acme/tools';c.querySelector('[name=githubToken]').value='github_pat_test';c.querySelector('.github-save').click()}");
 await wait("document.querySelector('[data-extension=\"github\"] [role=status]').textContent==='Сохранено.'");
 assert.equal(await js("document.querySelector('[data-extension=\"github\"] [name=githubRepos]').value"),'acme/game, acme/tools');
 assert.equal(await js("document.querySelector('[data-extension=\"github\"] [name=githubToken]').value"),'','the token is not shown back');
 assert.equal((await js("window.petya.feature('githubConnection','status')")).connected,true);
 await wait("/GitHub подключён/.test(document.querySelector('[data-extension=\"ci-builds\"] .ci-github').textContent)");
 await wait("/GitHub подключён/.test(document.querySelector('[data-extension=\"pull-requests\"] .pr-github').textContent)");
 for(const id of ['ci-builds','github','pull-requests'])await js(`document.querySelector('[data-extension="${id}"] details')?.setAttribute('open','')`);
 const file=await require('./card-shot.cjs')(win,'[data-extension="github"],[data-extension="ci-builds"],[data-extension="pull-requests"]','petya-github-settings');
 console.log('Screenshot: '+file);
 console.log('GitHub settings: app cards, shared GitHub card opened from «Сборки», repo validation, secret token not echoed passed');
}};
require('../src/main.cjs');
