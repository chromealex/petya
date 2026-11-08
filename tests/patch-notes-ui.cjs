// «Патчноуты» card in the real chat: the changes with switches (internal and unfinished ones off with the reason),
// language and destination tabs, the character counter against the store limit, lines that name their sources on
// hover, safe text, and a switch that recounts the texts through the app's own call (no model).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const notes=require('../src/extensions/patch-notes/notes.cjs');
const sources=require('../src/extensions/patch-notes/sources.cjs');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const cfg={patchNotesInternalLabels:sources.DEFAULT_LABELS,patchNotesInternalComponents:'Backend',jiraUrl:'https://corp.atlassian.net'};
 const it=(source,ref,title,extra={})=>sources.item(cfg,{source,ref,title,url:source==='jira'?'https://corp.atlassian.net/browse/'+ref:source==='pr'?'https://github.com/acme/game/pull/'+ref.slice(1):'',...extra});
 const items=sources.merge([it('jira','GAME-12','Кланы: вступление и чат клана',{type:'Story'}),it('jira','GAME-15','Игра вылетала при покупке в магазине',{type:'Bug'}),it('jira','GAME-16','Быстрее загрузка уровней',{type:'Improvement'}),it('jira','GAME-17','Новые скины оружия в магазине',{type:'Story'}),
  it('jira','GAME-20','Перевести сервер на новый кластер',{type:'Task',components:['Backend']}),it('jira','GAME-21','Ивент Хэллоуин',{type:'Story',done:false}),
  it('pr','#41','Daily login reward <img src=x onerror=alert(1)>',{labels:['feature']}),it('commit','a1b2c3d','GAME-15 fix purchase crash'),it('commit','c3d4e5f','chore: bump gradle'),it('commit','d4e5f6a','fix: sound stops after ads')]);
 const ru={headings:notes.HEADINGS.ru,model:true,lines:[{group:'feature',text:'Кланы: вступайте в клан и общайтесь в его чате',short:'Кланы и чат клана',sources:['jira:GAME-12']},{group:'feature',text:'Награда за ежедневный вход — заходите каждый день',short:'Награда за вход',sources:['pr:#41']},
  {group:'feature',text:'Новые скины оружия в магазине',short:'Скины оружия',sources:['jira:GAME-17']},{group:'improvement',text:'Уровни загружаются заметно быстрее',short:'Быстрее загрузка',sources:['jira:GAME-16']},{group:'fix',text:'Игра больше не вылетает при покупке в магазине',short:'Нет вылета при покупке',sources:['jira:GAME-15']},{group:'fix',text:'Звук больше не пропадает после рекламы',short:'Звук после рекламы',sources:['commit:d4e5f6a']}]};
 const en={headings:notes.HEADINGS.en,model:true,lines:[{group:'feature',text:'Clans: join a clan and chat with its members',short:'Clans and clan chat — join a clan, chat with members and help each other in events',sources:['jira:GAME-12']},{group:'feature',text:'Daily login reward',short:'A reward for every day you log in, growing through the week so keep the streak going',sources:['pr:#41']},
  {group:'feature',text:'New weapon skins in the shop',short:'New weapon skins in the shop: twelve looks for rifles, pistols and the new crossbow',sources:['jira:GAME-17']},{group:'improvement',text:'Levels load noticeably faster',short:'Levels load noticeably faster on older phones and tablets as well as new ones',sources:['jira:GAME-16']},{group:'fix',text:'No more crash when buying in the shop',short:'No more crash when you buy items or bundles in the shop on some Android devices',sources:['jira:GAME-15']},{group:'fix',text:'Sound no longer stops after ads',short:'Sound and music no longer stop after watching a rewarded ad in the middle of a level',sources:['commit:d4e5f6a']}]};
 const chosen=items.filter(i=>i.include).map(i=>i.id);
 const card={id:'pn-ui',title:'Версия 1.5',version:'1.5',sources:['Jira · версия 1.5','git · v1.4.2..v1.5.0','GitHub · acme/game'],range:{from:'v1.4.2',to:'v1.5.0'},items,languages:['ru','en'],requested:['ru','en'],tone:'дружелюбный',
  notes:{ru,en},model:true,warnings:[],chosen,dest:'play',limits:{appstore:4000,play:500,post:2000}};
 card.texts=notes.texts(card.notes,{chosen,title:card.title});card.internal=notes.changelog(items,{title:card.title,chosen});
 await js(`view('home');showDialogueMessages([{role:'user',text:'напиши патчноут к версии 1.5 для Google Play'},{role:'assistant',text:'Версия 1.5: 5 изменений для игроков.',by:'Патчноуты',extensionData:{patchNotes:${JSON.stringify(card)}}}],'Патчноуты')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.pn-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.pn-item').length"),items.length);
 assert.equal(await js("document.querySelectorAll('.pn-item.off').length"),3,'internal and unfinished changes start switched off');
 assert.equal(await js("document.querySelectorAll('.pn-card img').length"),0,'titles are never HTML');
 assert.equal(await js("document.querySelector('.pn-tab[aria-selected=\"true\"][data-tab=\"play\"]')?.textContent"),'Google Play','the requested destination is open');
 assert.match(await js("document.querySelector('.pn-count').textContent"),/\/ 500$/);
 assert.match(await js("document.querySelector('.pn-row.line').title"),/^Jira GAME-12 — Кланы/,'hover shows the source');
 assert.ok(await js("[...document.querySelectorAll('.pn-row.line')].every(r=>r.title)"),'every line has its source');
 await js("[...document.querySelectorAll('.pn-tab')].find(b=>b.dataset.tab==='en').click()");
 assert.ok(await js("document.querySelector('.pn-dropped')?.textContent.startsWith('не влезло строк')"),'English Google Play text is cut to the limit');
 await require('./card-shot.cjs')(win,'.pn-card','petya-patch-notes');
 // A switch recounts through compose (stubbed here), with the chosen ids of the card.
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,arg)=>{if(name!=='patchNotes')throw Error('x');calls.push([method,arg]);const ch=arg.chosen;return {texts:notes.texts(card.notes,{chosen:ch,title:card.title}),internal:notes.changelog(items,{title:card.title,chosen:ch}),chosen:ch};});
 await js("[...document.querySelectorAll('.pn-tab')].find(b=>b.dataset.tab==='appstore').click();document.querySelector('.pn-item[data-id=\"commit:d4e5f6a\"] input').click()");
 for(let i=0;i<100;i++){if(calls.length&&!(await js("document.querySelector('.pn-preview').textContent.includes('Sound')")))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(calls[0][0],'compose');assert.ok(!calls[0][1].chosen.includes('commit:d4e5f6a'));
 assert.ok(!(await js("document.querySelector('.pn-preview').textContent.includes('Sound')")),'the line of the switched-off change is gone');
 await js("document.querySelector('.pn-item[data-id=\"jira:GAME-20\"] input').click()");
 assert.equal(await js("document.querySelector('.pn-hint').hidden"),false,'a change the text does not mention yet asks to regenerate');
 console.log('Patch notes card: switches, internal reasons, tabs, limit counter and cut, sources on hover, safe text, recount on toggle passed');
}};
require('../src/main.cjs');
