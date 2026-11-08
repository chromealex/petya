// «Поиск по всему» cards in the real chat: the source spread bar, tabs with counts that filter rows, highlighted
// snippets (text only), sources that are off or failed, and the answer card with numbered citations.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const now=Date.now(),H=3600000,D=24*H;
 const mk=(source,title,snippet,word,extra={})=>{const marks=[];let at=0;const low=snippet.toLowerCase();for(;;){const i=low.indexOf(word,at);if(i<0)break;let e=i+word.length;while(e<snippet.length&&/[\p{L}]/u.test(snippet[e]))e++;marks.push([i,e]);at=e;}
  const tl=title.toLowerCase().indexOf(word);return {id:source+':'+title,source,title,snippet,marks,titleMarks:tl>=0?[[tl,tl+word.length+(title.slice(tl+word.length).match(/^\p{L}*/u)[0].length)]]:[],url:'',at:now-H,meta:'',...extra};};
 const items=[
  mk('slack','#jw-bw-dev · Матчмейкинг','Предлагаю расширять окно MMR в матчмейкинге каждые 30 секунд, иначе на пиках очередь до 4 минут.','матчмейк',{url:'https://team.slack.com/archives/C1/p1762000100000200',meta:'Маша · #jw-bw-dev',at:now-2*H}),
  mk('jira','BW-77 · Матчмейкинг: долгий поиск на пиках','Очередь матчмейкинга растёт до 4 минут в вечерние часы.','матчмейк',{url:'https://studio.atlassian.net/browse/BW-77',meta:'Баг · В работе',at:now-D}),
  mk('confluence','Матчмейкинг: правила подбора','…подбирает соперников по MMR. Матчмейкинг расширяет окно на 50 каждые 30 секунд…','матчмейк',{url:'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=9',at:now-20*D}),
  mk('meetings','Планёрка · 05.11','по матчмейкингу решили: окно MMR 200, потом расширяем','матчмейк',{meta:'Олег',at:now-4*D}),
  mk('telegram','Игроки BW','когда починят матчмейкинг? ищет по 5 минут <img src=x onerror=alert(1)>','матчмейк',{meta:'Player1',at:now-D}),
  mk('mail','Re: матчмейкинг в турнирах','По матчмейкингу в турнирах — ждём данных от аналитики.','матчмейк',{url:'https://mail.google.com/mail/u/0/#all/18c2f',meta:'Олег <oleg@studio.dev>',at:now-6*D}),
  mk('files','Assets/Scripts/Net/Matchmaker.cs','// матчмейкинг по рейтингу, окно 200 MMR','матчмейк',{meta:'строка 3',path:'/tmp/Game/Assets/Scripts/Net/Matchmaker.cs',line:3,at:now-9*D}),
  mk('glossary','Матчмейкинг','Подбор соперников по MMR.\nСинонимы: подбор\nen: Matchmaking','матчмейк',{at:now-10*D}),
  mk('slack','#tournaments','Матчмейкинг для турниров — отдельная очередь с фиксированным окном','матчмейк',{url:'https://team.slack.com/archives/C9/p1761000000000100',meta:'oleg · #tournaments',at:now-12*D}),
  mk('slack','#jw-bw-dev · Матчмейкинг','Матчмейкинг ломается на пиках: очередь растёт до 4 минут','матчмейк',{url:'https://team.slack.com/archives/C1/p1762000000000100',meta:'Олег · #jw-bw-dev',at:now-3*D})];
 const count=id=>items.filter(i=>i.source===id).length;
 const card={id:'s1',query:'матчмейкинг',terms:['матчмейкинг'],extra:['matchmaking','MMR'],embed:'',at:now,items,
  sources:[{id:'slack',label:'Slack',state:'limited',count:count('slack'),note:'Токен Slack не даёт искать по всему Slack — искал в сохранённой переписке.'},{id:'confluence',label:'Confluence',state:'ok',count:1},{id:'notion',label:'Notion',state:'timeout',count:0,note:'Не ответил за 8 с.'},
   {id:'jira',label:'Jira',state:'ok',count:1},{id:'mail',label:'Почта',state:'ok',count:1},{id:'telegram',label:'Telegram',state:'ok',count:1},{id:'meetings',label:'Встречи',state:'ok',count:1},{id:'files',label:'Файлы проекта',state:'ok',count:1},{id:'glossary',label:'Глоссарий',state:'ok',count:1}]};
 const answer={query:'матчмейкинг',found:true,citations:[{n:1,source:'slack',title:'#jw-bw-dev · Матчмейкинг',url:'https://team.slack.com/archives/C1/p1762000100000200',at:now-2*H},{n:2,source:'jira',title:'BW-77 · Матчмейкинг: долгий поиск на пиках',url:'https://studio.atlassian.net/browse/BW-77',at:now-D},{n:4,source:'meetings',title:'Планёрка · 05.11',url:'',at:now-4*D}]};
 await js(`view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'найди везде про матчмейкинг'},{role:'assistant',text:'Нашёл по «матчмейкинг» 10 результатов.',by:'Поиск по всему',extensionData:{searchAll:card}},{role:'user',text:'Ответь по найденному'},{role:'assistant',text:'На пиках поиск идёт до 4 минут [1, 2]. Решили начать с окна MMR 200 и расширять его [4].',by:'Поиск по всему',extensionData:{searchAllAnswer:answer}}])},'Поиск')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.sa-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.sa-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.sa-tab').length"),9,'«Все» and eight sources with results');
 assert.equal(await js("document.querySelectorAll('.sa-seg').length"),8);
 assert.equal(await js("document.querySelectorAll('.sa-card:not(.sa-answer) .sa-row').length"),10);
 assert.equal(await js("document.querySelectorAll('.sa-card img').length"),0,'snippets are text');
 assert.equal(await js("document.querySelector('.sa-row mark').textContent.toLowerCase().startsWith('матчмейк')"),true);
 assert.equal(await js("[...document.querySelectorAll('.sa-state')].map(x=>x.querySelector('span').textContent).join(',')"),'Slack,Notion');
 await js("document.querySelector('.sa-tab[data-source=\"slack\"]').click()");
 assert.equal(await js("document.querySelectorAll('.sa-card:not(.sa-answer) .sa-row').length"),3,'the Slack tab filters rows');
 assert.equal(await js("[...document.querySelectorAll('.sa-card:not(.sa-answer) .sa-row')].every(r=>r.dataset.source==='slack')"),true);
 await js("document.querySelector('.sa-tab[data-source=\"all\"]').click()");
 assert.equal(await js("!!document.querySelector('.sa-reveal')"),true,'a found file can be shown in its folder');
 assert.equal(await js("document.querySelectorAll('.sa-cites li').length"),3);
 await require('./card-shot.cjs')(win,'.sa-card:not(.sa-answer)','petya-search-all');
 await require('./card-shot.cjs')(win,'.sa-answer','petya-search-all-answer');
 console.log('Search everywhere cards: spread bar, source tabs filtering rows, highlighted snippets, failed sources, answer citations passed');
}};
require('../src/main.cjs');
