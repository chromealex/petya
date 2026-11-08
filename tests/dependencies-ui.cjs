// «Зависимости» card in the real chat: summary chips, the patch/minor/major bar, ecosystem status, the package table
// with versions, update kinds and advisory links, the vulnerabilities filter and the hand-off to the coder.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const p=(name,ecosystem,current,wanted,latest,kind,vulns=[],extra={})=>({name,ecosystem,current,wanted,latest,kind,vulns,flags:[],dev:false,direct:true,...extra});
 const v=(id,severity,summary,url,fixed='')=>({id,severity,summary,url,fixed});
 const packages=[
  p('lodash','npm','4.17.20','4.17.21','4.17.21','patch',[v('GHSA-p6mc-m468-83gw','high','Prototype Pollution in lodash','https://github.com/advisories/GHSA-p6mc-m468-83gw','4.17.21')]),
  p('minimist','npm','1.2.5',null,null,null,[v('GHSA-xvch-5gv4-984h','critical','Prototype Pollution in minimist','https://github.com/advisories/GHSA-xvch-5gv4-984h','1.2.6')],{direct:false}),
  p('requests','pip','2.31.0','2.31.0','2.32.3','minor',[v('GHSA-9wx4-h78v-vm56','moderate','Requests Session verify=False persists','https://github.com/advisories/GHSA-9wx4-h78v-vm56','2.32.0')]),
  p('react','npm','17.0.2','17.0.2','18.3.1','major'),
  p('pydantic','pip','1.10.2','1.10.2','2.9.2','major'),
  p('typescript','npm','5.4.5','5.6.3','5.6.3','minor',[],{dev:true}),
  p('httpx','pip','0.27.0','0.27.2','0.27.2','patch'),
  p('<b>evil</b>','npm','1.0.0','1.0.1','1.0.1','patch'),
  p('com.unity.entities','unity','1.0.0-pre.65',null,null,null,[],{flags:['preview']}),
  p('com.company.tools','unity','https://github.com/company/tools.git#v2',null,null,null,[],{flags:['git']}),
  p('com.unity.inputsystem','unity','1.7.0',null,null,null),
  p('express','npm','4.21.1',null,null,null)
 ];
 const deps={project:'BunkerWars',at:Date.parse('2026-11-08T10:40:00Z'),filter:null,showVulns:false,packages,notes:['pip: 1 пакет без точной версии (==) — уязвимости для него не проверить.'],
  ecosystems:[{id:'npm',label:'npm · web',status:'ok',note:'',vulnSource:'npm audit'},{id:'pip',label:'pip · requirements.txt',status:'ok',note:'',vulnSource:'OSV'},{id:'unity',label:'Unity · BunkerWars (2022.3.40f1)',status:'listed',note:'Последние версии пакетов Unity без редактора не узнать — показаны текущие версии, git/file-пакеты и preview.'}],
  summary:{outdated:7,patch:3,minor:2,major:2,vulns:{critical:1,high:1,moderate:1,low:0,unknown:0},vulnerable:3,flagged:2,total:12}};
 await js(`view('home');showDialogueMessages([{role:'user',text:'какие пакеты устарели'},{role:'assistant',text:'BunkerWars: устарело 7 пакетов.',by:'Зависимости',extensionData:{dependencies:${JSON.stringify(deps)}}}],'Зависимости')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.deps-card').length===1"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.deps-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.deps-seg').length"),3);
 assert.equal(await js("document.querySelectorAll('.deps-card tbody tr').length"),11,'up-to-date npm package is hidden');
 assert.equal(await js("document.querySelectorAll('.deps-card b').length"),0,'package names are never HTML');
 assert.equal(await js("document.querySelector('.deps-card tbody tr .deps-name').textContent"),'lodash');
 assert.equal(await js("document.querySelector('a.deps-badge.sev-critical').href"),'https://github.com/advisories/GHSA-xvch-5gv4-984h');
 assert.equal(await js("document.querySelector('.deps-card .kit-key').hasAttribute('data-no-i18n')"),true);
 assert.equal(await js("document.querySelector('.deps-card .deps-name').hasAttribute('data-no-i18n')"),true);
 await require('./card-shot.cjs')(win,'.deps-card','petya-dependencies');
 // Vulnerabilities filter.
 await js("[...document.querySelectorAll('.deps-card .kit-actions button')][1].click()");
 assert.equal(await js("document.querySelectorAll('.deps-card tbody tr').length"),3);
 await js("[...document.querySelectorAll('.deps-card .kit-actions button')][1].click()");
 assert.equal(await js("document.querySelectorAll('.deps-card tbody tr').length"),11);
 // The update goes to the coder as a chat request; capture it instead of sending.
 await js("window.__asked=null;window.submitChatCommand=async t=>{window.__asked=t;};0");
 await js("document.querySelector('.deps-card .kit-actions button.primary').click()");
 for(let i=0;i<50;i++){if(await js('!!window.__asked'))break;await new Promise(r=>setTimeout(r,20));}
 const asked=await js('window.__asked');
 assert.match(asked,/^Как программист, обнови зависимости lodash до 4\.17\.21 \(npm\), requests до 2\.32\.3 \(pip\), /);
 assert.ok(!/react|pydantic|minimist|com\.unity/.test(asked),'major updates, unknown versions and Unity are not in the safe list');
 assert.match(asked,/в отдельной ветке и прогони тесты$/);
 console.log('Dependencies card: chips, stacked bar, table with safe text and advisory links, vulnerabilities filter, coder hand-off passed');
}};
require('../src/main.cjs');
