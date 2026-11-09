// «Перформанс-ревью» card in the real chat: monthly bars stacked by kind of fact, the draft whose points carry their
// fact numbers (pressing one opens and marks the fact), the gaps, the facts by kind with source links, «Скопировать
// черновик» and the document-export hand-off with the Markdown. Facts never become HTML. Feature calls are stubbed.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='document-export'?[{id:'google-drive',name:'Google Диск',label:'Сохранить в Google Docs'}]:[];
  if(name==='appLinks'&&method==='run'){calls.push(['link',...args]);return {text:'Готово'};}
  return null;
 });
 const SITE='https://studio.atlassian.net';
 const facts=[
  {id:'F1',kind:'task',date:'2026-06-01',key:'GAME-9',text:'Закрыта задача GAME-9 «Логи сервера» (Task)',source:{label:'Jira · GAME-9',url:SITE+'/browse/GAME-9'}},
  {id:'F2',kind:'task',date:'2026-07-14',key:'GAME-15',text:'Закрыта задача GAME-15 «Кэш профилей» (Story)',source:{label:'Jira · GAME-15',url:SITE+'/browse/GAME-15'}},
  {id:'F3',kind:'pr',date:'2026-09-01',merged:true,text:'PR #41 «Новый матчмейкер» — влит',source:{label:'studio/game #41',url:'https://github.com/studio/game/pull/41'}},
  {id:'F4',kind:'task',date:'2026-09-03',key:'GAME-12',text:'Закрыта задача GAME-12 «Матчмейкинг по рейтингу» (Story)',source:{label:'Jira · GAME-12',url:SITE+'/browse/GAME-12'}},
  {id:'F5',kind:'review',date:'2026-09-20',text:'Ревью PR #39 «Античит» (автор ivan-k)',source:{label:'studio/game #39',url:'https://github.com/studio/game/pull/39'}},
  {id:'F6',kind:'note',date:'2026-10-01',text:'Заметка 1:1: Хочет вести архитектуру матчмейкинга. <b>не HTML</b>',source:{label:'Встречи 1:1 · 2026-10-01',url:''}},
  {id:'F7',kind:'meeting',date:'2026-10-12',text:'Взял(а) на встрече: Подготовить план миграции лиг (срок: пятница)',source:{label:'Встреча · 12 окт., 11:00',url:''}},
  {id:'F8',kind:'incident',date:'2026-10-14',key:'GAME-30',text:'Разобран инцидент GAME-30 «Падение сервера лиг»',source:{label:'Jira · GAME-30',url:SITE+'/browse/GAME-30'}},
  {id:'F9',kind:'review',date:'2026-10-20',text:'Ревью PR #43 «Шейдеры травы» (автор masha-p)',source:{label:'studio/game #43',url:'https://github.com/studio/game/pull/43'}},
  {id:'F10',kind:'followup',date:'2026-11-02',done:true,text:'Договорённость с 1:1: Подготовит RFC по очередям — выполнено',source:{label:'Встречи 1:1 · 2026-11-02',url:''}}];
 const months=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'].map(m=>({month:m,counts:Object.fromEntries(['task','incident','pr','review','meeting','followup','note'].map(k=>[k,facts.filter(f=>f.kind===k&&f.date.startsWith(m)).length]))}));
 const draft={by:'mixed',dropped:2,gaps:['нет данных о встречах: в сводках встреч за период его задач и решений нет'],sections:[
  {id:'results',title:'Результаты',items:[{text:'Довёл до релиза матчмейкинг по рейтингу (GAME-12)',facts:['F4']},{text:'Закрыто задач в Jira: 3 (GAME-9, GAME-15, GAME-12)',facts:['F1','F2','F4']},{text:'Разобрал падение сервера лиг',facts:['F8']}]},
  {id:'engineering',title:'Код и ревью',items:[{text:'Pull requests: 1, из них влито 1',facts:['F3']},{text:'Код-ревью чужих PR: 2',facts:['F5','F9']}]},
  {id:'collaboration',title:'Работа с командой',items:[{text:'Задачи и решения со встреч: 1',facts:['F7']},{text:'Договорённости с 1:1: 1, выполнено 1',facts:['F10']},{text:'Итогов встреч 1:1 за период: 1',facts:['F6']}]}]};
 const card={person:{name:'Олег Смирнов',role:'Сервер'},from:'2026-05-11',to:'2026-11-09',days:182,facts,draft,gaps:draft.gaps,months,links:{jira:''},markdown:'# Перформанс-ревью · Олег Смирнов\n\n## Результаты\n\n- Довёл до релиза матчмейкинг по рейтингу (GAME-12) [F4]'};
 await js(`view('home');showDialogueMessages([{role:'user',text:'собери материалы для ревью Олега за полгода'},{role:'assistant',text:'Ревью · Олег Смирнов …',by:'Перформанс-ревью',extensionData:{perfReviewCard:${JSON.stringify(card)}}}],'Ревью')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.pr-card')"))break;await new Promise(r=>setTimeout(r,30));}
 const q=sel=>js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
 assert.equal(await q('.pr-col'),7);assert.equal(await q('.pr-seg'),10,'a segment per kind per month');
 assert.equal(await q('.pr-section'),3);assert.equal(await q('.pr-point'),8);assert.equal(await q('.pr-ref'),11);
 assert.equal(await q('.pr-gaps li'),1);assert.equal(await q('.pr-group'),7);assert.equal(await q('.pr-fact'),10);
 assert.equal(await js("document.querySelector('.pr-fact[data-fact=\"F1\"] a.pr-fact-src').href"),SITE+'/browse/GAME-9');
 assert.equal(await js("[...document.querySelectorAll('.pr-fact-text')].some(n=>n.textContent.includes('<b>'))&&!document.querySelector('.pr-fact-text b')"),true,'facts are text, never HTML');
 // A fact number opens its group and marks the fact.
 await js("[...document.querySelectorAll('.pr-ref')].find(b=>b.textContent==='F8').click()");
 assert.equal(await js("document.querySelector('.pr-fact[data-fact=\"F8\"]').closest('details').open"),true);
 assert.equal(await js("document.querySelector('.pr-fact[data-fact=\"F8\"]').classList.contains('is-flash')"),true);
 // Document export gets the Markdown.
 for(let i=0;i<60;i++){if(await js("!!document.querySelector('.pr-card .kit-link')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.pr-card .kit-link').textContent"),'Сохранить в Google Docs');
 await js("document.querySelector('.pr-card .kit-link').click()");
 for(let i=0;i<60;i++){if(calls.length)break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(calls[0][1],'document-export');assert.equal(calls[0][3].title,'Перформанс-ревью · Олег Смирнов');assert.match(calls[0][3].text,/^# Перформанс-ревью · Олег Смирнов/);
 await js("document.querySelectorAll('.pr-group').forEach((d,i)=>d.open=i<2)");
 await require('./card-shot.cjs')(win,'.pr-card','petya-perf-review');
 console.log('Perf review card: monthly bars by kind, draft points with fact numbers that open the facts, gaps, sourced facts, document export passed');
}};
require('../src/main.cjs');
