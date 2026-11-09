// «Что изменилось в документе» card in the real chat, from a real comparison of a fixture git repository: the version
// timeline, added / removed words, the summary whose points jump to their changed sections, each section's inline word
// diff with who and when, and document text never becoming HTML.
process.env.PETYA_SMOKE_TEST='1';
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const app=require('../src/extensions/doc-diff/feature.cjs');

const people={masha:['Мария Ким','masha@studio.example'],oleg:['Олег Смирнов','oleg@studio.example']};
function git(dir,args,date,who='oleg'){const [n,e]=people[who];execFileSync('git',['-C',dir,...args],{env:{...process.env,GIT_AUTHOR_DATE:date||'',GIT_COMMITTER_DATE:date||'',GIT_AUTHOR_NAME:n,GIT_AUTHOR_EMAIL:e,GIT_COMMITTER_NAME:n,GIT_COMMITTER_EMAIL:e},stdio:'pipe'});}
function write(dir,file,text){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-docdiff-ui-')),dir=path.join(root,'game');fs.mkdirSync(dir);
git(dir,['init','-q','-b','main']);git(dir,['remote','add','origin','https://github.com/studio/game.git']);
const GDD1='# GDD «Бункер»\n\n## Лиги\n\nВ сезоне 5 лиг: бронза, серебро, золото, платина, алмаз. Сезон длится 28 дней, в конце сезона топ-10 каждой лиги поднимаются выше, а последние 5 опускаются.\n\n## Экономика\n\nСтартовый баланс — 100 золота. Золото даётся за матчи и задания.\n\n## Кланы\n\nКлан до 30 игроков <img src=x onerror=alert(1)>.\n';
write(dir,'docs/gdd.md',GDD1);git(dir,['add','-A']);git(dir,['commit','-q','-m','Первая версия GDD'],'2026-10-01T10:00:00Z');
const GDD2=GDD1.replace('В сезоне 5 лиг: бронза, серебро, золото, платина, алмаз.','В сезоне 6 лиг: бронза, серебро, золото, платина, алмаз, легенда.');
write(dir,'docs/gdd.md',GDD2);git(dir,['commit','-q','-am','Лиги: легенда'],'2026-11-04T09:00:00Z','masha');
const GDD3=GDD2.replace('Стартовый баланс — 100 золота.','Стартовый баланс — 150 золота и 5 кристаллов.').replace(/## Кланы[\s\S]*$/,'## Магазин\n\nЕжедневные предложения обновляются в 00:00 UTC.\n');
write(dir,'docs/gdd.md',GDD3);git(dir,['commit','-q','-am','Экономика и магазин'],'2026-11-06T15:30:00Z');

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const topic={id:'t1',title:'Чат',projectId:'p1',messages:[]};
 const s={settings:{'extension_doc-diff':'true',model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},dataRoot:root,requestProgress:{report(){}},
  request:async()=>({message:{content:JSON.stringify({items:[{text:'Лиг стало 6 вместо 5: добавлена легенда',hunks:[1]},{text:'Стартовый баланс вырос до 150 золота и 5 кристаллов',hunks:[2]},{text:'Клановые войны перенесены',hunks:[4]}]})}}),
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'p1',name:'Game',folders:[dir]}],activeProjectId:'p1'}}};
 const r=await app.turn(s,'что поменяли в GDD за неделю',{now:new Date('2026-11-09T10:00:00Z')});
 const card=r.extensionData.docDiffCard;
 assert.equal(card.summary.by,'model');assert.equal(card.summary.items.length,2);assert.equal(card.summary.dropped,1);
 await js(`view('home');showDialogueMessages([{role:'user',text:'что поменяли в GDD за неделю'},{role:'assistant',text:${JSON.stringify(r.text)},by:'Что изменилось в документе',extensionData:{docDiffCard:${JSON.stringify(card)}}}],'GDD')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.dd-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.dd-dot').length"),2);
 assert.equal(await js("document.querySelectorAll('.dd-hunk').length"),4);
 assert.equal(await js("document.querySelector('.dd-hunk .dd-title').textContent"),'GDD «Бункер» › Лиги');
 assert.deepEqual(await js("[...document.querySelector('.dd-hunk').querySelectorAll('del,ins')].map(x=>x.tagName+':'+x.textContent.trim())"),['DEL:5','INS:6','INS:, легенда']);
 assert.equal(await js("document.querySelectorAll('.dd-card img').length"),0,'document text is never HTML');
 assert.match(await js("document.querySelector('.dd-hunk.st-removed .dd-ops').textContent"),/<img src=x/);
 assert.match(await js("document.querySelector('.dd-hunk .dd-who').textContent"),/Мария Ким/);
 assert.equal(await js("document.querySelectorAll('.dd-summary li').length"),2);
 // A summary point jumps to its section.
 assert.equal(await js("(async()=>{document.querySelectorAll('.dd-ref')[1].click();await new Promise(r=>setTimeout(r,50));return document.querySelector('.dd-hunk[data-hunk=\"2\"]').classList.contains('flash');})()"),true);
 const asked=await js("(async()=>{let got='';const k=window.resultKit,old=k.ask;k.ask=async t=>{got=t;};[...document.querySelectorAll('.dd-card .kit-actions button')].find(b=>/месяц/.test(b.textContent)).click();await new Promise(r=>setTimeout(r,50));k.ask=old;return got;})()");
 assert.equal(asked,'Что поменяли в «docs/gdd.md» за месяц');
 const shot=await require('./card-shot.cjs')(win,'.dd-card','petya-doc-diff');
 console.log('Doc diff card ('+shot+'): timeline, words added/removed, grounded summary linked to sections, inline word diffs with who and when passed');
}};
require('../src/main.cjs');
