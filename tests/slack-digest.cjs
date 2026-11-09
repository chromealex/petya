const assert=require('node:assert/strict');const {question,SlackDigest}=require('../src/extensions/slack/digest.cjs');
(async()=>{
 for(const t of ['Что нового в Slack?','Петя, что пишут в слаке','Какие новости в Slack за неделю?','Сделай сводку по слаку','Что мне писали в Slack?'])assert(question(t),t);
 for(const t of ['Отправь в Slack отчёт','Почему упал билд, посмотри лог в слаке','Как подключить Slack?','Что такое Slack?'])assert.equal(question(t),null,t);
 assert.equal(question('Что нового в Slack за неделю?').days,7);assert.equal(question('Что мне писали в слаке?').mentions,true);
 const now=Date.parse('2026-11-05T12:00:00Z');let synced=0,summarized=null,screens=0;
 const items=[{source:'Slack',channel:'C1',title:'Релиз 1.19',url:'https://app.slack.com/archives/C1/p1',at:now-3600e3,messages:[{at:now-3600e3,user:'U1',text:'Сборка готова'},{at:now-3*86400e3,user:'U2',text:'старое'}]},{source:'Заметка',at:now,text:'x'}];
 const make=(rows,extra={})=>new SlackDigest({enabled:()=>true,ready:()=>true,items:()=>rows,sync:()=>{synced++;return Promise.resolve();},status:()=>({updatedAt:now}),summarize:async(c,m,a)=>{summarized={c,m,a};return 'Главное: сборка 1.19 готова.';},screen:async()=>{screens++;return {title:'Экран Slack',text:'#general: обед в 13:00'};},now:()=>now,...extra});
 let d=make(items),r=await d.turn('Что нового в Slack?');
 assert.match(r.text,/сборка 1\.19 готова/);assert.equal(summarized.m.length,1);assert.equal(summarized.m[0].text,'Сборка готова');assert.equal(r.sources[0].url,'https://app.slack.com/archives/C1/p1');assert.equal(r.by,'Slack: сводка');
 assert.equal(await d.turn('Как дела?'),null);
 let fresh=0;d=make([],{background:()=>false,keepFresh:()=>{fresh++;}});r=await d.turn('Что нового в Slack?');assert(r.question);assert.equal(synced,1);assert.equal(fresh,1);assert.match(r.text,/раз в 15 минут/);assert.equal(r.clarificationOptions.length,2);
 r=await d.turn('Да, прочитай с экрана');assert.equal(screens,1);assert.match(r.text,/с экрана/);assert.equal(summarized.a.screen,true);
 r=await d.turn('Что нового в Slack?');r=await d.turn('Нет, подожду обновления');assert.match(r.text,/в фоне/);
 d=make([],{screen:async()=>{const e=Error('нужно разрешение');e.code='COMPUTER_PERMISSION_REQUIRED';throw e;},approve:(c,a)=>({handled:true,text:'approve',action:a})});await d.turn('Что нового в Slack?');r=await d.turn('да');assert.equal(r.action.type,'slackDigestScreen');
 d=make(items,{ready:()=>false});assert.equal(await d.turn('Что нового в Slack?'),null);
 console.log('Slack digest: questions, synced-message summary with sources, sync + screen fallback, permission and not-connected passed');
})().catch(e=>{console.error(e);process.exit(1);});
