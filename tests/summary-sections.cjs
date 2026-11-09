// Sections of the daily summary come from apps (summary-section, src/summary-sections.cjs): Slack provides its own;
// a section counts only while its app is added; a failing or slow one is shown as unreadable without hiding others;
// the core brief names no app.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sections=require('../src/summary-sections.cjs');
const {dailyBrief}=require('../src/daily-brief.cjs');
(async()=>{
 assert.ok(require('../src/features/app-links.cjs').REGISTRIES.includes('summary-section'));
 assert.deepEqual(sections.load().map(x=>[x.id,x.extension,x.setting]),[['slack','slack','module_slack']]);
 const now=new Date(2026,10,9,15).getTime(),from=new Date(now).setHours(0,0,0,0);
 const memory={prune:()=>[{source:'Slack',at:now-3600000,messages:[{at:now-3600000},{at:now-60000},{at:from-1000}]},{source:'Telegram',at:now}]};
 // Without Slack added: no Slack section.
 assert.deepEqual(await sections.collect({settings:{},memory},{from,to:now,now}),[]);
 const slack=await sections.collect({settings:{module_slack:'true'},memory},{from,to:now,now});
 assert.deepEqual(slack,[{id:'slack',title:'Slack',lines:['Сохранённых записей за сегодня: 2.','Обсуждения доступны в разделе «Материалы».']}]);
 // Order, a failing section and a slow one: each on its own, the others stay.
 const fake=(id,order,collect,setting='')=>({id,extension:id,setting,section:{id,title:id.toUpperCase(),order,collect}});
 const list=[fake('b',20,async()=>({lines:['два']})),fake('a',10,async()=>({lines:['один']})),fake('c',30,async()=>{throw Error('нет сети');}),fake('d',40,()=>new Promise(()=>{})),fake('e',50,async()=>null),fake('f',60,async()=>({lines:['скрыто']}),'extension_f')];
 const got=await sections.collect({settings:{}},{from,to:now,now},{sections:list.sort((x,y)=>x.section.order-y.section.order),timeout:50});
 assert.deepEqual(got.map(x=>[x.id,x.lines.join(),x.error||'']),[['a','один',''],['b','два',''],['c','','нет сети'],['d','','не ответил за 0 сек']]);
 const text=dailyBrief({records:[],sections:[...got,...slack],now}).text;
 assert.match(text,/### A\n\nодин/);assert.match(text,/### C\n\nНе удалось прочитать: нет сети/);assert.match(text,/### Slack\n\nСохранённых записей за сегодня: 2\./);
 assert.ok(text.indexOf('### Jira')<text.indexOf('### A'),'apps\' sections after Petya\'s own');
 assert.doesNotMatch(dailyBrief({records:[],now}).text,/Slack/,'no Slack section without the app');
 // The core brief names no app's section.
 for(const file of ['src/daily-brief.cjs','src/learning-setup.cjs','src/summary-sections.cjs'])assert.ok(!/slack|слак/i.test(fs.readFileSync(path.join(__dirname,'..',file),'utf8')),file+' names Slack');
 console.log('Summary sections: Slack provides its section, only while added, order, failures and timeouts isolated, no app named in the core brief passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
