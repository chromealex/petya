// «Напоминания» (src/extensions/reminders): time parsing on a fake clock, routing and near-misses, persistence across
// restarts, firing into the original chat with a notification, snooze/done/edit/delete/undo, and event triggers
// (Jira status with backoff, Slack presence incl. a token without users:read, calendar meeting, CI build) against
// stubbed services. No network, no model.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const when=require('../src/extensions/reminders/when.cjs');
const feature=require('../src/extensions/reminders/feature.cjs');
const offer=require('../src/extensions/reminders/offer.cjs');
const registry=require('../src/extensions/reminders/triggers.cjs');
const MIN=60000,HOUR=60*MIN;
const T0=new Date(2026,10,9,14,20).getTime(); // Monday 9 November 2026, 14:20

// --- when.cjs ------------------------------------------------------------------------------------------------------
{
 const p=t=>when.parse(t,T0);
 const at=(t)=>new Date(p(t).at);
 assert.equal(at('в 16:00 позвонить').getHours(),16);assert.equal(p('в 16:00 позвонить').words,'сегодня в 16:00');assert.equal(p('в 16:00 позвонить').rest,'позвонить');
 assert.equal(p('через 2 часа выпить воды').at,T0+2*HOUR);
 assert.equal(p('через полчаса').at,T0+30*MIN);
 assert.equal(p('через полтора часа').at,T0+90*MIN);
 assert.equal(p('через минуту').at,T0+MIN);
 const mon=p('каждый понедельник в 10 стендап');assert.deepEqual(mon.repeat,{days:[1],h:10,m:0});assert.equal(new Date(mon.at).getDate(),16,'today 10:00 has passed: next Monday');assert.equal(mon.words,'каждый понедельник в 10:00');
 assert.deepEqual(p('по будням в 9:30 зарядка').repeat.days,[1,2,3,4,5]);
 assert.equal(p('каждую среду в 19 спорт').words,'каждую среду в 19:00');
 assert.deepEqual(p('по вторникам и четвергам в 8 утра бег').repeat,{days:[2,4],h:8,m:0});
 assert.equal(p('каждый день в 21:00 таблетки').at,new Date(2026,10,9,21,0).getTime());
 assert.equal(p('завтра утром отчёт').words,'завтра в 09:00');
 assert.equal(p('в пятницу в 10 демо').words,'в пятницу, 13 ноября, в 10:00');
 assert.equal(new Date(p('в следующую пятницу в 10').at).getDate(),20);
 assert.equal(new Date(p('15 ноября в 12:30 оплатить').at).getDate(),15);
 assert.equal(new Date(p('5 ноября в 10').at).getFullYear(),2027,'a past date of this year is next year');
 assert.equal(new Date(p('25.12 в 18 подарки').at).getMonth(),11);
 assert.equal(new Date(p('через 2 дня в 15:00 созвон').at).getTime(),new Date(2026,10,11,15,0).getTime());
 assert.equal(at('в 4 позвонить').getHours(),16,'«в 4» is in the afternoon');
 assert.equal(p('в 13:00').words,'завтра в 13:00','a passed time today moves to tomorrow');
 assert.equal(p('вечером купить хлеб').words,'сегодня в 19:00');
 assert.ok(p('завтра про отчёт').defaulted);
 assert.ok(p('сегодня позвонить маме').needTime);
 assert.ok(p('сегодня в 10 встреча').error);
 assert.equal(p('купить хлеб'),null);
 assert.ok(p('через 500 дней').error);
 assert.equal(when.answer('18:30',T0).words,'сегодня в 18:30');
 assert.equal(when.answer('Завтра в 10:00',T0).words,'завтра в 10:00');
 assert.equal(when.answer('Через час',T0).at,T0+HOUR);
 assert.equal(when.absolute(new Date(2026,10,9,16,0).getTime()),'понедельник, 9 ноября 2026 г., 16:00');
}

// --- routing and near-misses --------------------------------------------------------------------------------------
{
 const r=t=>feature.route(t)?.type||null;
 for(const t of ['напомни в 16:00 позвонить','Петя, напомни мне через 2 часа выпить воды','напоминай каждый понедельник в 10 про планёрку','поставь напоминание на завтра','напомни, когда закроют BW-123','напомни мне позвонить маме'])assert.equal(r(t),'create',t);
 assert.equal(r('какие у меня напоминания?'),'list');assert.equal(r('мои напоминания'),'list');assert.equal(r('покажи напоминания'),'list');
 assert.equal(r('удали напоминание про банк'),'remove');assert.equal(r('не напоминай про воду'),'remove');
 assert.equal(r('перенеси напоминание про банк на 18:00'),'move');assert.equal(r('отложи на 10 минут'),'snooze');
 for(const t of ['напомни, что мы обсуждали вчера','напомни, о чём договорились на встрече в понедельник','напомни Ивану про отчёт','напомни команде про релиз','напомни, как зовут нового тестировщика','напомни, что я отмечал как важное','проверяй почту каждые 5 минут','поставь встречу в 16:00','что такое напоминание','дневник разработки','перенеси встречу на 17:00','отложи релиз','Напомни Маше завтра в 10 про отчёт'])assert.equal(r(t),null,t);
 assert.equal(feature.subject('позвонить в банк'),'Позвонить в банк');assert.equal(feature.subject('про отчёт'),'Отчёт');assert.equal(feature.subject('что нужно купить хлеб'),'Купить хлеб');
}

// --- offers -------------------------------------------------------------------------------------------------------
{
 const offers=require('../src/features/extension-offers.cjs');const all=offers.load();
 const offered=t=>{const d=offers.decide(offers.candidates(t,{offers:all,settings:{}}));return d?.one?.offer.id||null;};
 for(const t of ['какие у меня напоминания','поставь напоминание на завтра','покажи мои напоминания'])assert.equal(offered(t),'reminders',t);
 for(const t of ['напомни в 16:00 позвонить','напомни Ивану про отчёт','дни рождения','поставь встречу в 16:00','проверяй почту каждые 5 минут'])assert.notEqual(offered(t),'reminders',t);
 assert.equal(offer.ready({extension_reminders:'true'}),true);
}

// --- a stubbed Petya ------------------------------------------------------------------------------------------------
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-reminders-'));
function petya({settings={},clock,request,workspace,mailAccounts,calendarFetch}={}){
 const topic={id:'chat-1',projectId:'general',title:'Рабочий чат',messages:[]};
 const sent=[];
 const s={companyId:'c1',dataRoot:root,smoke:true,settings:{extension_reminders:'true',...settings},
  requestProgress:{report(){}},attachments:{list:()=>[]},
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(channel,item)=>sent.push({channel,item})}},
  dialogue:{state:{topics:[topic],projects:[{id:'general',name:'Общий'}],activeProjectId:'general'},active:()=>topic,persist(){},
   rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  request:request||(async()=>{throw Error('нет сети в тесте');}),workspace,mailAccounts,calendarFetch};
 const made=feature.setup(s,{now:()=>clock.t});
 s.reminders=made.reminders;s.ipc=made.ipc;
 return {s,topic,sent,ipc:made.ipc,svc:made.reminders.service};
}
async function say(s,text,answers=[]){
 let r;
 try{r=await feature.turn(s,text);}
 catch(e){
  if(e.name!=='InputRequired')throw e;
  if(!answers.length)return {question:e.spec};
  let next=e;
  for(const a of answers){try{r=await next.resume(a);next=null;break;}catch(x){if(x.name!=='InputRequired')throw x;next=x;}}
  if(next)return {question:next.spec};
 }
 return r;
}

(async()=>{
 const clock={t:T0};
 // Not added → nothing; a near-miss stays with Petya even when added.
 {const {s}=petya({clock,settings:{extension_reminders:'false'}});assert.equal(await feature.turn(s,'напомни в 16:00 позвонить'),null);}
 {const {s}=petya({clock});assert.equal(await feature.turn(s,'напомни, что мы обсуждали вчера'),null);assert.equal(await feature.turn(s,'напомни, когда у нас релиз'),null);}

 // Time reminder: created with how it was understood; persisted; fires into the chat with a notification.
 fs.rmSync(path.join(root,'extensions'),{recursive:true,force:true});
 let p=petya({clock});
 let r=await say(p.s,'напомни в 16:00 позвонить в банк');
 assert.match(r.text,/Напомню сегодня в 16:00 \(понедельник, 9 ноября 2026 г\., 16:00\): «Позвонить в банк»/);
 const card=r.extensionData.reminderCard;assert.equal(card.mode,'created');assert.equal(card.items.length,1);assert.equal(card.items[0].group,'today');assert.equal(card.items[0].icon,'clock');
 const id=card.created;
 // Survives a restart: a new service over the same company folder sees it.
 p=petya({clock});assert.equal(p.svc.list().length,1);assert.equal(p.svc.list()[0].id,id);
 clock.t=new Date(2026,10,9,15,59).getTime();assert.deepEqual(await p.svc.tick(),[]);
 clock.t=new Date(2026,10,9,16,0,10).getTime();assert.deepEqual(await p.svc.tick(),[id]);
 const msg=p.topic.messages.at(-1);assert.equal(msg.by,'Напоминания');assert.match(msg.text,/⏰ Напоминание: Позвонить в банк/);assert.equal(msg.extensionData.reminderCard.mode,'fired');
 const note=p.sent.find(x=>x.item.id==='reminder:'+id);assert.equal(note.channel,'extension-install-progress');assert.equal(note.item.reminder.topicId,'chat-1');assert.equal(note.item.kind,'attention');
 assert.equal(p.svc.list()[0].group,'fired');assert.equal((await p.svc.tick()).length,0,'fires once');
 assert.equal(p.ipc.notices().length,1,'restored after a reload');
 // Snooze from chat: the last fired one.
 r=await say(p.s,'отложи на 10 минут');assert.match(r.text,/Отложил «Позвонить в банк» на сегодня в 16:10/);
 clock.t+=10*MIN;assert.deepEqual(await p.svc.tick(),[id]);
 p.ipc.done(id);assert.equal(p.svc.list().length,0);assert.equal(p.svc.history({from:T0,to:clock.t+1}).length,1,'done reminders stay for the journal');

 // Missed while Petya was closed: fires once on start, marked as missed.
 clock.t=T0;r=await say(p.s,'напомни через 2 часа выпить воды');
 clock.t=T0+5*HOUR;p=petya({clock});await p.svc.tick();assert.match(p.topic.messages.at(-1).text,/Пропущенное напоминание: Выпить воды/);

 // Repeat: next Monday after firing.
 clock.t=T0;r=await say(p.s,'напоминай каждый понедельник в 10 про планёрку');
 const rep=r.extensionData.reminderCard.items.find(i=>i.repeat);assert.equal(rep.icon,'repeat');assert.equal(rep.text,'Планёрку');assert.match(r.text,/каждый понедельник в 10:00/);
 clock.t=new Date(2026,10,16,10,0,5).getTime();await p.svc.tick();
 assert.equal(new Date(p.svc.view(rep.id).at).getDate(),23,'next Monday');assert.equal(p.svc.view(rep.id).status,'active');
 // Snoozing a repeating one makes a one-off copy; the schedule stays.
 const copy=p.ipc.snooze(rep.id,{minutes:15});assert.notEqual(copy.id,rep.id);assert.equal(copy.repeat,null);assert.ok(p.svc.view(rep.id).repeat,'still repeats');
 p.ipc.remove(copy.id);

 // Clarifications: no time → options, the answer creates it; no subject → asked; past time → asked again.
 clock.t=T0;
 r=await say(p.s,'напомни позвонить маме');assert.deepEqual(r.question.options,['Через час','Вечером в 19:00','Завтра в 10:00']);
 r=await say(p.s,'напомни позвонить маме',['Через час']);assert.match(r.text,/Напомню сегодня в 15:20.*«Позвонить маме»/);
 r=await say(p.s,'напомни позвонить маме',['не знаю','в 18']);assert.match(r.text,/сегодня в 18:00/,'an unclear answer is asked again');
 r=await say(p.s,'напомни через 5 минут');assert.match(r.question.text,/О чём напомнить через 5 минут/);
 r=await say(p.s,'напомни через 5 минут',['проверить духовку']);assert.match(r.text,/«Проверить духовку»/);
 r=await say(p.s,'напомни сегодня в 10 про встречу');assert.match(r.question.text,/уже прошло/);
 r=await say(p.s,'напомни завтра про отчёт');assert.match(r.text,/завтра в 10:00.*поставил 10:00/);
 // Location is not known.
 r=await say(p.s,'напомни, когда приду домой, полить цветы');assert.match(r.question.text,/не знает, где вы находитесь/);
 r=await say(p.s,'напомни, когда приду домой, полить цветы',['Вечером в 19:00']);assert.match(r.text,/сегодня в 19:00 .*: «Полить цветы»/);

 // List, edit, delete with undo, move.
 r=await say(p.s,'какие у меня напоминания?');assert.equal(r.extensionData.reminderCard.mode,'list');assert.match(r.text,/Напоминаний: \d+/);
 const bank=(await say(p.s,'напомни в 17:00 оплатить счёт')).extensionData.reminderCard.created;
 r=await say(p.s,'перенеси напоминание про счёт на 18:30');assert.match(r.text,/Перенёс «Оплатить счёт» на сегодня в 18:30/);
 p.ipc.edit(bank,{text:'Оплатить счёт за свет'});assert.equal(p.svc.view(bank).text,'Оплатить счёт за свет');
 assert.throws(()=>p.ipc.edit(bank,{at:T0-1}),/в будущем/);
 r=await say(p.s,'удали напоминание про счёт');assert.equal(r.extensionData.reminderCard.mode,'deleted');assert.ok(!p.svc.list().some(i=>i.id===bank));
 p.ipc.restore(bank);assert.ok(p.svc.list().some(i=>i.id===bank),'undo brings it back');
 r=await say(p.s,'удали напоминание про несуществующее');assert.match(r.text,/Не нашёл/);

 // --- Jira status: not connected → offers a time reminder; connected → polls with backoff and fires on Done ---
 r=await say(p.s,'напомни, когда закроют BW-123');assert.match(r.question.text,/нужно подключить «Статус задачи Jira»/);
 let status='In Progress',category='indeterminate',calls=0,fail=0;
 const jiraSettings={jiraUrl:'https://acme.atlassian.net',jiraEmail:'me@acme.io',jiraToken:'x'};
 const workspace={settings:()=>jiraSettings,async api(route){calls++;if(fail){fail--;throw Error('HTTP 502');}
  if(/BW-999/.test(route))throw Object.assign(Error('HTTP 404'),{status:404});
  return {key:'BW-123',fields:{summary:'Краш на старте',status:{name:status,statusCategory:{key:category}}}};}};
 clock.t=T0;p=petya({clock,settings:jiraSettings,workspace});
 r=await say(p.s,'напомни, когда закроют BW-123');
 assert.match(r.text,/Напомню, когда BW-123 закроют\. BW-123 «Краш на старте» сейчас: In Progress/);
 const jira=r.extensionData.reminderCard.items.find(i=>i.kind==='event');assert.equal(jira.group,'event');assert.equal(jira.icon,'task');assert.ok(jira.nextCheck>T0);
 assert.equal(jira.trigger.url,'https://acme.atlassian.net/browse/BW-123');
 const gaps=[];let last=clock.t;
 for(let i=0;i<4;i++){clock.t=p.svc.view(jira.id).nextCheck;await p.svc.tick();gaps.push(p.svc.view(jira.id).nextCheck-clock.t);}
 assert.ok(gaps[3]>gaps[0],'checks back off: '+gaps.join(','));
 // Errors: backoff and one notification on the third failure in a row.
 fail=3;for(let i=0;i<3;i++){clock.t=p.svc.view(jira.id).nextCheck;await p.svc.tick();}
 assert.ok(p.sent.some(x=>x.item.id==='reminder-check:'+jira.id&&x.item.kind==='error'));assert.match(p.svc.view(jira.id).lastError,/502/);
 status='Done';category='done';clock.t=p.svc.view(jira.id).nextCheck;await p.svc.tick();
 assert.equal(p.svc.view(jira.id).status,'fired');assert.match(p.topic.messages.at(-1).text,/BW-123 «Краш на старте» — статус «Done»/);
 assert.equal(p.topic.messages.at(-1).sources[0].url,'https://acme.atlassian.net/browse/BW-123');
 r=await say(p.s,'напомни, когда закроют BW-123');assert.match(r.text,/уже закрыта \(Done\)\. Напоминание не нужно/);
 r=await say(p.s,'напомни, когда BW-999 перейдёт в Review');assert.match(r.text,/не нашёл/);
 status='In Progress';category='indeterminate';
 r=await say(p.s,'напомни проверить фикс, когда BW-123 перейдёт в Review');assert.match(r.text,/когда BW-123 перейдёт в «Review»: «Проверить фикс»/);
 // A reminder deleted while its check runs is not fired.
 const raceId=r.extensionData.reminderCard.items.find(i=>i.text==='Проверить фикс').id;
 workspace.api=async()=>{p.ipc.remove(raceId);return {key:'BW-123',fields:{summary:'x',status:{name:'Review',statusCategory:{key:'indeterminate'}}}};};
 clock.t=p.svc.view(raceId).nextCheck;const before=p.topic.messages.length;await p.svc.tick();assert.equal(p.topic.messages.length,before,'deleted during the check: no message');

 // --- Slack presence: a token without users:read cannot do it → explained, time reminder offered ---
 const team=JSON.stringify([{name:'Олег Петров',slackId:'U0OLEG',email:'oleg@acme.io'},{name:'Мария Смирнова',aliases:'Маша',email:'masha@acme.io'}]);
 let presence={ok:false,error:'missing_scope',needed:'users:read'};
 const slackReq=async url=>{assert.match(url,/^https:\/\/slack\.com\/api\/users\.getPresence\?user=U0OLEG$/);return presence;};
 clock.t=T0;p=petya({clock,settings:{module_slack:'true',slackToken:'xoxp-1',teamMembers:team},request:slackReq});
 r=await say(p.s,'напомни, когда Олег появится в сети');assert.match(r.question.text,/users:read/);assert.deepEqual(r.question.options,['Через час','Вечером в 19:00','Завтра в 10:00']);
 presence={ok:true,presence:'active'};
 r=await say(p.s,'напомни, когда Олег появится в сети');assert.match(r.text,/Олег Петров сейчас уже в сети — напомню, когда снова появится/);
 const oleg=r.extensionData.reminderCard.items.find(i=>i.icon==='presence');
 clock.t=p.svc.view(oleg.id).nextCheck;await p.svc.tick();assert.equal(p.svc.view(oleg.id).status,'active','still the same session');
 presence={ok:true,presence:'away'};clock.t=p.svc.view(oleg.id).nextCheck;await p.svc.tick();
 presence={ok:true,presence:'active'};clock.t=p.svc.view(oleg.id).nextCheck;await p.svc.tick();
 assert.equal(p.svc.view(oleg.id).status,'fired');assert.match(p.topic.messages.at(-1).text,/Олег Петров сейчас в сети/);
 r=await say(p.s,'напомни, когда Вася появится в сети');assert.match(r.text,/Не нашёл Вася в «Команде»/);

 // --- Calendar: the next meeting with Маша, re-read while waiting (moved meeting moves the reminder) ---
 let start=new Date(2026,10,10,15,0);
 const google=JSON.stringify({accounts:[{id:'a1',email:'me@acme.io',tokens:{scope:'https://www.googleapis.com/auth/calendar'}}]});
 const calendarFetch=async url=>{assert.match(String(url),/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/);return {ok:true,status:200,json:async()=>({items:[
  {id:'e0',summary:'Планёрка',start:{dateTime:new Date(2026,10,10,10,0).toISOString()},end:{dateTime:new Date(2026,10,10,10,30).toISOString()},attendees:[{email:'me@acme.io',self:true}]},
  {id:'e1',summary:'Синк по UI',start:{dateTime:start.toISOString()},end:{dateTime:new Date(+start+30*MIN).toISOString()},attendees:[{email:'me@acme.io',self:true},{email:'masha@acme.io'}],hangoutLink:'https://meet.google.com/abc'}]})};};
 clock.t=T0;p=petya({clock,settings:{extension_calendar:'true',gmailCredential:google,teamMembers:team},calendarFetch,mailAccounts:{google:{client:()=>({access:async()=>'tok'})}}});
 r=await say(p.s,'напомни, когда начнётся следующая встреча с Машей');assert.match(r.text,/Напомню, когда начнётся встреча «Синк по UI»/);
 const meet=r.extensionData.reminderCard.items.find(i=>i.icon==='calendar');
 start=new Date(2026,10,10,16,0);clock.t=new Date(2026,10,10,15,0).getTime();await p.svc.tick();
 assert.equal(p.svc.view(meet.id).status,'active','the meeting moved to 16:00');
 clock.t=new Date(2026,10,10,16,0,20).getTime();for(let i=0;i<3&&p.svc.view(meet.id).status==='active';i++){clock.t=Math.max(clock.t,p.svc.view(meet.id).nextCheck);await p.svc.tick();}
 assert.equal(p.svc.view(meet.id).status,'fired');assert.match(p.topic.messages.at(-1).text,/Начинается встреча «Синк по UI» в 16:00/);
 r=await say(p.s,'напомни за 10 минут до встречи с Олегом');assert.match(r.text,/не нашёл/i);

 // --- CI: the running build finishes ---
 let runStatus='in_progress',conclusion=null;
 const ciReq=async url=>{assert.match(String(url),/^https:\/\/api\.github\.com\/repos\/acme\/game\/actions\/runs/);return {workflow_runs:[{id:77,name:'Android',run_number:12,status:runStatus,conclusion,head_branch:'main',created_at:new Date(T0-5*MIN).toISOString(),updated_at:new Date(T0).toISOString(),html_url:'https://github.com/acme/game/actions/runs/77'}]};};
 clock.t=T0;p=petya({clock,settings:{'extension_ci-builds':'true',githubToken:'ghp',githubRepos:'acme/game'},request:ciReq});
 r=await say(p.s,'напомни, когда соберётся билд');assert.match(r.text,/Напомню, когда сборка «Android» #12 \(main\) завершится/);
 const build=r.extensionData.reminderCard.items.find(i=>i.icon==='build');
 runStatus='completed';conclusion='failure';clock.t=p.svc.view(build.id).nextCheck;await p.svc.tick();
 assert.match(p.topic.messages.at(-1).text,/Сборка «Android» #12 \(main\) упала/);
 // Not added → explained with a time reminder offered.
 p=petya({clock});r=await say(p.s,'напомни, когда соберётся билд');assert.match(r.question.text,/«Сборка CI»/);

 // The trigger registry: declared through `provides`, unknown shapes refused.
 const ids=registry.load().map(x=>x.id);assert.deepEqual(ids,['calendar-meeting','ci-build','jira-status','slack-presence']);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-trig-'));fs.mkdirSync(path.join(tmp,'x'));
 fs.writeFileSync(path.join(tmp,'x','extension.json'),JSON.stringify({id:'x',setting:'extension_x',provides:{'reminder-trigger':'t.cjs'}}));
 fs.writeFileSync(path.join(tmp,'x','t.cjs'),"module.exports={id:'door',match:t=>/дверь/.test(t)?{}:null,ready:()=>true,prepare:async()=>({params:{},label:'откроют дверь'}),check:async()=>({fired:true})};");
 const custom=registry.create({settings:{extension_x:'true'}},{triggers:registry.load(tmp)});assert.equal(custom.match('когда откроют дверь').id,'door');assert.equal(custom.ready('door'),true);
 assert.equal(registry.create({settings:{}},{triggers:registry.load(tmp)}).ready('door'),false,'counts only while its app is added');
 fs.writeFileSync(path.join(tmp,'x','t.cjs'),"module.exports={id:'bad'};");delete require.cache[path.join(tmp,'x','t.cjs')];
 assert.throws(()=>registry.load(tmp),/Invalid reminder trigger/);

 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Reminders: time parsing on a fake clock, routing and near-misses, offers, persistence, firing into the chat with a notification, missed and repeating reminders, clarifications, list/move/edit/delete/undo, Jira backoff and errors, Slack without users:read, presence, calendar meeting move, CI build, trigger registry passed');
})().catch(e=>{console.error(e);process.exit(1);});
