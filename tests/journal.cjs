// «Дневник дня» (src/extensions/journal): routing and near-misses, the day from Petya's own data (chats, messages and
// tasks through Petya, Jira status changes, commits, recorded meetings, reminders) on a fake clock with stubbed
// services, a failing source not hiding the others, private encrypted notes and reflection, carrying items to
// tomorrow's plan, the plan in the morning brief, the evening summary (off by default), the week, and the
// journal-source registry. No network, no model.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const feature=require('../src/extensions/journal/feature.cjs');
const offer=require('../src/extensions/journal/offer.cjs');
const sources=require('../src/extensions/journal/sources.cjs');
const brief=require('../src/features/morning-brief.cjs');
const reminders=require('../src/extensions/reminders/feature.cjs');
const MIN=60000,HOUR=60*MIN;
const at=(d,h,m=0)=>new Date(2026,10,d,h,m).getTime();
const T0=at(9,18,30); // Monday 9 November 2026, 18:30

// --- routing -------------------------------------------------------------------------------------------------------
{
 const r=t=>feature.route(t)?.type||null;
 for(const [t,type] of [['что я сегодня сделал?','day'],['Петя, что я сделал сегодня','day'],['итоги дня','day'],['что я вчера сделал','day'],['итоги недели','week'],['что я успел за неделю','week'],['план на завтра','plan'],['что перенести на завтра','plan'],['запиши в дневник: созвонились с дизайнером','note'],['присылай итоги дня в 19:00','evening'],['выключи итоги дня','evening']])assert.equal(r(t),type,t);
 assert.equal(feature.route('что я вчера сделал').yesterday,true);
 for(const t of ['дневник разработки','напиши дневник разработки для игроков','журнал логов','журнал изменений','итоги встречи','итоги спринта','что я сделал не так','план релиза','план на спринт','что у меня завтра в календаре','покажи логи','диалог за сегодня','что нового в Slack'])assert.equal(r(t),null,t);
 // Offers: own requests offer this app, neighbours never do.
 const offers=require('../src/features/extension-offers.cjs'),all=offers.load();
 const offered=t=>{const d=offers.decide(offers.candidates(t,{offers:all,settings:{}}));return d?.one?.offer.id||null;};
 for(const t of ['что я сегодня сделал','итоги недели','план на завтра','запиши в дневник: идея с картой'])assert.equal(offered(t),'journal',t);
 for(const t of ['дневник разработки','журнал логов','журнал изменений','итоги встречи','какие у меня напоминания'])assert.notEqual(offered(t),'journal',t);
 assert.equal(offer.ready({extension_journal:'true'}),true);
}

// --- a stubbed Petya with a day of work ------------------------------------------------------------------------------
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-journal-'));
function petya({clock,settings={},jira='ok',git=true}={}){
 const chat={id:'c1',projectId:'game',title:'Почему падает билд',messages:[
  {role:'user',text:'почему падает билд',at:at(9,11,5)},{role:'assistant',text:'…',at:at(9,11,6)},{role:'user',text:'а на андроиде?',at:at(9,11,20)},
  {role:'user',text:'вчерашний вопрос',at:at(8,15)}],
  actionReceipts:[{id:'r1',action:'send',service:'slack',status:'confirmed',channelName:'bw-dev',at:at(9,12,0),summary:'Билд починен',url:'https://app.slack.com/archives/C1/p1'},
   {id:'r2',action:'send',service:'slack',status:'unknown',at:at(9,12,5)},{id:'r3',action:'create',service:'jira',status:'confirmed',key:'BW-130',at:at(9,13,0),summary:'Краш на Android 9'}]};
 const auto={id:'c2',projectId:'general',title:'Утренняя сводка · 09.11',messages:[{role:'user',text:'Раздай агентам',at:at(9,9,30)}]};
 const old={id:'c3',projectId:'general',title:'Архив',archived:true,messages:[{role:'user',text:'x',at:at(9,10)}]};
 const topic={id:'c4',projectId:'general',title:'Общий чат',messages:[]};
 const sent=[],calls=[];
 const workspace={settings:()=>({jiraUrl:'https://acme.atlassian.net'}),async api(route,options={}){
  calls.push({route,body:options.body?JSON.parse(options.body):null});
  if(jira==='fail')throw Error('HTTP 503');
  if(route==='/rest/api/3/myself')return {accountId:'me-1'};
  const body=JSON.parse(options.body);
  if(/CHANGED BY currentUser\(\)/.test(body.jql))return {issues:[
   {key:'BW-123',fields:{summary:'Краш на старте'},changelog:{histories:[
    {created:new Date(at(9,16,40)).toISOString(),author:{accountId:'me-1'},items:[{field:'status',fromString:'In Progress',toString:'Review'}]},
    {created:new Date(at(9,17,10)).toISOString(),author:{accountId:'other'},items:[{field:'status',fromString:'Review',toString:'Done'}]},
    {created:new Date(at(8,10)).toISOString(),author:{accountId:'me-1'},items:[{field:'status',fromString:'To Do',toString:'In Progress'}]}]}}]};
  if(/duedate <=/.test(body.jql))return {issues:[{key:'BW-140',fields:{summary:'Обновить SDK рекламы',duedate:'2026-11-10',status:{name:'To Do'}}}]};
  return {issues:[]};}};
 const gitWorkspace=git?{repository:async()=>({root:'/work/bunker-wars'}),git:async(rootDir,args)=>{
  if(args[0]==='config')return 'me@acme.io\n';
  assert.ok(args.includes('--author=me@acme.io'));
  return [['a1b2c3d',new Date(at(9,14,2)).toISOString(),'Fix crash on startup'],['d4e5f6a',new Date(at(9,17,55)).toISOString(),'Bump SDK']].map(x=>x.join('\t')).join('\n');}}:null;
 const memory={prune:()=>[
  {sessionId:'m1',source:'Встреча',title:'Синк по UI · 09.11.2026, 15:00',text:'…',at:at(9,15,2)},{sessionId:'m1',source:'Микрофон',title:'Синк по UI · 09.11.2026',text:'…',at:at(9,15,47)},
  {sessionId:'m0',source:'Встреча',title:'Вчерашняя',text:'…',at:at(8,12)},{source:'Slack',text:'не встреча',at:at(9,12)}]};
 const s={companyId:'c-'+Math.random(),dataRoot:fs.mkdtempSync(path.join(root,'co-')),smoke:true,
  settings:{extension_journal:'true',extension_reminders:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'me@acme.io',jiraToken:'x',journalEvening:'',...settings},
  saveSettings(v){Object.assign(this.settings,v);},requestProgress:{report(){}},attachments:{list:()=>[]},
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(channel,item)=>sent.push({channel,item})}},
  dialogue:{state:{topics:[chat,auto,old,topic],projects:[{id:'general',name:'Общий'},{id:'game',name:'Bunker Wars'}],activeProjectId:'general'},active:()=>topic,persist(){},
   rememberAction(c,text){topic.messages.push({role:'user',text:c,at:clock.t},{role:'assistant',text,at:clock.t});}},
  workspace,gitWorkspace,memory};
 // «Напоминания» is added too: its journal source and its service.
 const rem=reminders.setup(s,{now:()=>clock.t});s.reminders=rem.reminders;
 // A reversible fake keychain: the file must not contain the plain notes.
 const made=feature.setup(s,{now:()=>clock.t,encrypt:t=>Buffer.from(t,'utf8').reverse(),decrypt:b=>Buffer.from(b).reverse().toString('utf8')});
 s.journal=made.journal;
 return {s,sent,calls,topic,ipc:made.ipc,chat};
}

(async()=>{
 const clock={t:T0};
 // Not added → nothing.
 {const {s}=petya({clock,settings:{extension_journal:'false'}});assert.equal(await feature.turn(s,'что я сегодня сделал'),null);}

 let p=petya({clock});
 // A reminder done today and one fired but not marked (carried to tomorrow).
 const done=p.s.reminders.service.add({text:'Позвонить в банк',time:{at:at(9,10)}});clock.t=at(9,10,0)+1000;await p.s.reminders.service.tick();p.s.reminders.service.done(done.id);
 p.s.reminders.service.add({text:'Отправить отчёт',time:{at:at(9,17)}});clock.t=at(9,17)+1000;await p.s.reminders.service.tick();
 clock.t=T0;
 let r=await feature.turn(p.s,'что я сегодня сделал?');
 if(!r.extensionData)console.log(r.text);const card=r.extensionData.journalCard;
 assert.equal(card.mode,'day');assert.equal(card.date,'2026-11-09');
 assert.deepEqual({meetings:card.totals.meetings,tasks:card.totals.tasks,commits:card.totals.commits,chats:card.totals.chats,messages:card.totals.messages,reminders:card.totals.reminders},{meetings:1,tasks:2,commits:2,chats:1,messages:1,reminders:2});
 assert.match(r.text,/^Сегодня: 1 встреча, 2 задачи в Jira, 2 коммита, 1 чат с Петей, 1 сообщение через Петю, 2 напоминания\./);
 assert.match(r.text,/Вопрос дня: /);
 const kinds=card.timeline.map(i=>i.kind);
 assert.deepEqual(card.timeline.map(i=>i.at),[...card.timeline.map(i=>i.at)].sort((a,b)=>a-b),'timeline in time order');
 for(const k of ['chat','message','task','transition','commit','meeting','reminder'])assert.ok(kinds.includes(k),k);
 assert.ok(!card.timeline.some(i=>/вчерашн|Вчерашняя|Раздай|Архив/i.test(i.title)),'only today, no automatic or archived chats');
 const transition=card.timeline.find(i=>i.kind==='transition');assert.equal(transition.detail,'In Progress → Review');assert.equal(transition.url,'https://acme.atlassian.net/browse/BW-123');
 assert.ok(!card.timeline.some(i=>i.detail==='Review → Done'),'someone else\'s transition is not mine');
 assert.equal(card.timeline.find(i=>i.kind==='meeting').detail,'≈ 45 мин');
 assert.equal(card.timeline.find(i=>i.kind==='chat').detail,'2 запроса · Bunker Wars');
 assert.deepEqual(card.carry.map(c=>c.id).sort(),['jira:BW-140',card.carry.find(c=>c.source==='reminders').id].sort());
 assert.equal(card.week.length,7);assert.equal(card.week[0].date,'2026-11-09');assert.equal(card.week[1].future,true);
 assert.equal(card.focus,false,'no focus app here');
 const jql=p.calls.find(c=>/CHANGED/.test(c.body?.jql||'')).body;assert.equal(jql.jql,'status CHANGED BY currentUser() DURING ("2026/11/09 00:00", "2026/11/16 00:00") ORDER BY updated DESC'.replace('2026/11/16 00:00','2026/11/10 00:00'));assert.equal(jql.expand,'changelog');

 // A failing source is named; the others still count.
 {const q=petya({clock,jira:'fail',git:false});r=await feature.turn(q.s,'итоги дня');assert.match(r.text,/Не удалось прочитать: Jira/);assert.equal(r.extensionData.journalCard.totals.chats,1);assert.equal(r.extensionData.journalCard.totals.commits,0);}

 // Notes: stored encrypted, never copied into the chat card.
 r=await feature.turn(p.s,'запиши в дневник: договорились с дизайнером о новом меню');assert.match(r.text,/Записал в дневник/);
 const raw=fs.readFileSync(path.join(p.s.dataRoot,'extensions','journal','journal.json'),'utf8');assert.ok(!raw.includes('дизайнер'),'encrypted at rest');assert.ok(JSON.parse(raw).encrypted);
 r=await feature.turn(p.s,'что я сегодня сделал');assert.equal(r.extensionData.journalCard.totals.notes,1);assert.ok(!JSON.stringify(r.extensionData).includes('дизайнер'),'notes stay out of the chat');
 assert.equal(p.ipc.private('2026-11-09').notes[0].text,'договорились с дизайнером о новом меню');
 p.ipc.reflect('2026-11-09','Починили краш');assert.equal(p.ipc.private('2026-11-09').reflection.answer,'Починили краш');assert.equal(p.ipc.private('2026-11-09').reflection.prompt,p.ipc.private('2026-11-09').prompt);
 // Survives a restart (same company folder, same keychain).
 {const again=require('../src/extensions/journal/store.cjs').create(path.join(p.s.dataRoot,'extensions','journal','journal.json'),{decrypt:b=>Buffer.from(b).reverse().toString('utf8')});assert.equal(again.peek('2026-11-09').notes.length,1);}

 // Carry to tomorrow, plan, morning brief.
 const chosen=card.carry.filter(c=>c.id==='jira:BW-140');
 p.ipc.carry('2026-11-09',chosen);p.ipc.carry('2026-11-09',chosen);
 r=await feature.turn(p.s,'план на завтра');assert.match(r.text,/^План на завтра: BW-140 Обновить SDK рекламы\.$/);assert.equal(r.extensionData.journalCard.planned.length,1,'no duplicates');
 assert.equal(r.extensionData.journalCard.carry.find(c=>c.id==='jira:BW-140').planned,true);
 clock.t=at(10,9,30);
 const parts=await brief.partsFor(p.s,new Date(clock.t));const mine=parts.find(x=>x.by==='Дневник дня');
 assert.match(mine.text,/^План на сегодня из дневника:\n• BW-140 Обновить SDK рекламы$/);assert.equal(mine.extensionData.journalCard.mode,'plan');
 p.ipc.check('2026-11-10','jira:BW-140',true);
 assert.match((await brief.partsFor(p.s,new Date(clock.t))).find(x=>x.by==='Дневник дня').text,/✓ BW-140/);
 // Unfinished plan items of today are offered again for tomorrow.
 p.ipc.check('2026-11-10','jira:BW-140',false);
 r=await feature.turn(p.s,'что я сегодня сделал');assert.ok(r.extensionData.journalCard.carry.some(c=>c.id==='jira:BW-140'&&c.detail==='срок 2026-11-10 · To Do'||c.id==='jira:BW-140'));
 // Without the journal added the brief part is silent.
 p.s.settings.extension_journal='false';assert.equal((await brief.partsFor(p.s,new Date(clock.t))).find(x=>x.by==='Дневник дня'),undefined);p.s.settings.extension_journal='true';

 // Evening summary: off by default; when set, once on a weekday, into the «Дневник» chat with a notification.
 assert.equal(feature.defaults?.journalEvening??require('../src/extensions/journal/feature.cjs').defaults.journalEvening,'');
 clock.t=at(10,19,5);assert.equal(p.s.dialogue.state.topics.some(t=>t.journal),false);
 r=await feature.turn(p.s,'присылай итоги дня в 7 вечера');assert.match(r.text,/по будням в 19:00/);assert.equal(p.s.settings.journalEvening,'19:00');
 const before=p.sent.length;
 {const q=p;const made=feature.setup(q.s,{now:()=>clock.t,encrypt:t=>Buffer.from(t,'utf8').reverse(),decrypt:b=>Buffer.from(b).reverse().toString('utf8')});
  const id=await made.ipc.runEvening();const t=q.s.dialogue.state.topics.find(x=>x.id===id);assert.equal(t.title,'Дневник');assert.equal(t.messages.at(-1).extensionData.journalCard.mode,'day');assert.match(t.messages.at(-1).text,/^Итоги дня\./);
  assert.ok(p.sent.slice(before).some(x=>x.item.id==='journal-evening'&&x.item.journal.topicId===id));}
 // The timer: once per weekday, not on weekends, not hours late.
 {const q=petya({clock});clock.t=at(10,19,5);assert.equal(q.s.journal.evening.due(),false,'off by default');
  q.s.settings.journalEvening='19:00';assert.equal(q.s.journal.evening.due(at(10,18,59)),false);assert.equal(q.s.journal.evening.due(at(14,19,5)),false,'Saturday');assert.equal(q.s.journal.evening.due(at(10,22,30)),false,'too late');
  const id=await q.s.journal.evening.tick();assert.ok(id);assert.equal(await q.s.journal.evening.tick(),null,'once a day');
  clock.t=at(11,19,1);assert.ok(await q.s.journal.evening.tick(),'next weekday again');}
 clock.t=at(10,19,5);
 r=await feature.turn(p.s,'выключи итоги дня');assert.equal(p.s.settings.journalEvening,'');
 assert.throws(()=>p.ipc.evening('25:00'),/ЧЧ:ММ/);

 // The week.
 clock.t=at(13,18);
 r=await feature.turn(p.s,'итоги недели');const wk=r.extensionData.journalCard;
 assert.equal(wk.mode,'week');assert.match(r.text,/^За неделю: /);assert.match(r.text,/Самый насыщенный день — понедельник/);
 assert.equal(wk.week.filter(d=>!d.future).length,5);assert.equal(wk.week[0].totals.commits,2);

 // The registry: declared through `provides`; a focus app only adds `focus` items with minutes.
 assert.deepEqual(sources.load().map(x=>x.id),['chats','git','jira','meetings','reminders']);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-jsrc-'));fs.mkdirSync(path.join(tmp,'focus'));
 fs.writeFileSync(path.join(tmp,'focus','extension.json'),JSON.stringify({id:'focus',setting:'extension_focus',provides:{'journal-source':'j.cjs'}}));
 fs.writeFileSync(path.join(tmp,'focus','j.cjs'),"module.exports={id:'focus',name:'Фокус',icon:'focus',collect:async(s,{from})=>({items:[{at:from+3600000,kind:'focus',icon:'focus',title:'Фокус-сессия',minutes:50},{at:from-1,kind:'focus',title:'вне периода',minutes:99}]})};");
 const reg=sources.create({settings:{extension_focus:'true'}},{sources:sources.load(tmp)});
 const got=await reg.collect({from:at(9,0),to:at(10,0)});assert.equal(feature.totals(got.items).focusMinutes,50);
 assert.equal((await sources.create({settings:{}},{sources:sources.load(tmp)}).collect({from:at(9,0),to:at(10,0)})).items.length,0,'counts only while its app is added');

 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Journal: routing and near-misses, offers, the day from chats/receipts/Jira transitions/commits/meetings/reminders, failing source, encrypted private notes and reflection, carry to tomorrow and the morning brief part, evening summary off by default, the week, journal-source registry with a focus app passed');
})().catch(e=>{console.error(e);process.exit(1);});
