// «Календарь»: routing and near-misses, connection states, Google Calendar / Microsoft Graph reads with stubbed
// fetch, free time and ranked slots, team-directory clarifications, event creation only through the card's
// confirm (idempotent, unknown outcome never repeated), incremental consent in the shared Google/Microsoft clients.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const app=require('../src/extensions/calendar/feature.cjs');
const when=require('../src/extensions/calendar/when.cjs');
const slots=require('../src/extensions/calendar/slots.cjs');
const people=require('../src/extensions/calendar/people.cjs');
const {granted,SCOPES}=require('../src/extensions/calendar/client.cjs');
const offers=require('../src/features/extension-offers.cjs');
const offer=require('../src/extensions/calendar/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const json=(v,status=200)=>({ok:status<300,status,json:async()=>v});
const NOW=new Date(2026,10,9,9,0);// Monday 9 Nov 2026, 09:00
const at=(d,h,m=0)=>new Date(2026,10,d,h,m).toISOString();
const GOOGLE_SCOPE='https://www.googleapis.com/auth/gmail.readonly '+SCOPES.google.join(' ');
(async()=>{
 // --- Dates and times read by code ---
 assert.equal(when.ymd(when.range('когда я свободен в пятницу',NOW).from),'2026-11-13');
 assert.equal(when.ymd(when.range('встречи на завтра',NOW).from),'2026-11-10');
 assert.deepEqual([when.ymd(when.range('на этой неделе',NOW).from),when.ymd(when.range('на этой неделе',NOW).to)],['2026-11-09','2026-11-16']);
 assert.equal(when.ymd(when.range('на следующей неделе',NOW).from),'2026-11-16');
 assert.equal(when.ymd(when.range('на этой неделе',new Date(2026,10,8,12)).from),'2026-11-09','on Sunday «this week» is the coming one');
 assert.equal(when.ymd(when.range('12 ноября',NOW).from),'2026-11-12');
 assert.equal(when.range('в среднем это долго',NOW),null,'«среднем» is not Wednesday');
 assert.equal(when.time('в четверг в 15:00'),900);assert.equal(when.time('в 3 дня'),900);assert.equal(when.time('в 9 утра'),540);assert.equal(when.time('в 15.30'),930);
 assert.equal(when.time('на 2 часа'),null);assert.equal(when.time('на 30 минут в 11'),660);
 assert.equal(when.duration('найди час'),60);assert.equal(when.duration('полчаса'),30);assert.equal(when.duration('полтора часа'),90);assert.equal(when.duration('на 45 минут'),45);assert.equal(when.duration('в 15:00'),null);

 // --- Free time and ranking ---
 const week=when.range('на этой неделе',NOW);
 assert.equal(slots.windows(week,{now:NOW}).length,5,'weekend is skipped');
 assert.equal(new Date(slots.windows({from:when.startOfDay(NOW),to:when.addDays(when.startOfDay(NOW),1),single:true},{now:new Date(2026,10,9,12,10)})[0].from).getMinutes(),30,'today starts at the next half hour');
 const ranked=slots.find([{email:'me',busy:[{start:at(9,10),end:at(9,12)}]},{email:'x',error:'нет доступа к календарю',busy:[]}],{from:when.startOfDay(NOW),to:when.addDays(when.startOfDay(NOW),1),single:true},{duration:60,now:NOW});
 assert.ok(ranked.slots.every(s=>Date.parse(s.start)>=Date.parse(at(9,12))),'busy time is never offered');
 assert.deepEqual(ranked.unknown,['x']);assert.match(ranked.slots[0].note,/свободны все доступные/,'an unreadable calendar is not counted as free');
 assert.deepEqual(slots.gaps([{start:at(13,11,30),end:at(13,12,30)}],slots.windows({from:new Date(2026,10,13),to:new Date(2026,10,14),single:true},{now:NOW})).map(g=>[when.hm(new Date(g.start)),when.hm(new Date(g.end))]),[['10:00','11:30'],['12:30','19:00']]);

 // --- People from the team directory ---
 assert.deepEqual(people.mentioned('найди час с Машей и Олегом на этой неделе').names,['Машей','Олегом']);
 assert.deepEqual(people.mentioned('созвон с Марией Петровой, Олегом и ivan@x.org завтра').names,['Марией Петровой','Олегом']);
 assert.deepEqual(people.mentioned('созвон с Марией Петровой, Олегом и ivan@x.org завтра').emails,['ivan@x.org']);
 const members=[{name:'Мария Петрова',aliases:'Маша',email:'maria@corp.ru'},{name:'Олег Иванов',email:'oleg@corp.ru'},{name:'Олег Смирнов',email:'smirnov@corp.ru'},{name:'Александр Ким',aliases:'Саша',email:''}];
 assert.deepEqual(people.candidates('Машей',members).map(m=>m.name),['Мария Петрова']);
 assert.deepEqual(people.candidates('Олегом Ивановым',members).map(m=>m.name),['Олег Иванов']);
 assert.equal(people.candidates('Олегом',members).length,2);

 // --- Routing: phrases and near-misses ---
 const yes={'что у меня сегодня':'agenda','встречи на завтра':'agenda','найди час с Машей и Олегом на этой неделе':'find','поставь встречу с Машей в четверг в 15:00':'create','когда я свободен в пятницу':'free','что в календаре на пятницу':'agenda','найди час на этой неделе':'find'};
 for(const [t,k] of Object.entries(yes))assert.equal(app.intent(t),k,t);
 const near=['сводка встречи','что решили на встрече','слушай встречу Zoom','какой срок задачи PET-12','календарь отпусков','дни рождения в этом месяце','что у меня сегодня по задачам','составь крон на каждое утро','найди время в логах','сделай сводку встречи за вчера','поставь задачу Олегу на завтра','расписание поездов на завтра','напомни про день рождения Маши завтра'];
 for(const t of near)assert.equal(app.intent(t),null,t);

 // --- Chat turns ---
 const topic={id:'t',title:'Чат',messages:[]};
 let calls=[],routes=[];
 const fetcher=async(url,o={})=>{calls.push({url,method:o.method||'GET',headers:o.headers||{},body:o.body?JSON.parse(o.body):null});for(const [test,answer] of routes)if(test(url,o))return typeof answer==='function'?answer(url,o):answer;throw Error('unexpected '+url);};
 const starts=[];
 const manager=provider=>({client:id=>({access:async()=>'tok-'+id}),status:()=>({configured:true}),login:{pending:null,lastError:''},async start(o){starts.push({provider,...o});this.login.pending={};}});
 const saved=[];
 const s={settings:{model:'',teamMembers:JSON.stringify(members)},requestProgress:{report(){}},mailAccounts:{google:manager('google'),microsoft:manager('microsoft')},
  saveSettings(v){saved.push(v);Object.assign(s.settings,v);},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const turn=(t,deps={})=>app.turn(s,t,{fetcher,now:NOW,...deps});
 assert.equal(await turn('что у меня сегодня'),null,'not added: nothing here');
 s.settings.extension_calendar='true';
 for(const t of near)assert.equal(await turn(t),null,t);
 const none=await turn('что у меня сегодня');
 assert.equal(none.question,true);assert.match(none.text,/Настройки → Календарь/);
 s.settings.gmailCredential=JSON.stringify({client:{client_id:'c'},accounts:[{id:'g1',email:'me@corp.ru',tokens:{refresh_token:'r',scope:'https://www.googleapis.com/auth/gmail.readonly'}}]});
 const mailOnly=await turn('встречи на завтра');
 assert.equal(mailOnly.question,true);assert.match(mailOnly.text,/me@corp\.ru подключён только для почты.*Разрешить доступ к календарю/);
 assert.equal(calls.length,0,'no request without calendar access');
 s.settings.gmailCredential=JSON.stringify({client:{client_id:'c'},accounts:[{id:'g1',email:'me@corp.ru',tokens:{refresh_token:'r',scope:GOOGLE_SCOPE}}]});
 assert.equal(app.connected(s.settings),true);assert.equal(offer.ready(s.settings),true);

 // Agenda (Google): today's events with meeting link, declined and cancelled left out of the summary.
 routes=[[u=>u.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?'),json({items:[
  {id:'e1',summary:'Стендап',start:{dateTime:at(9,10)},end:{dateTime:at(9,10,15)},conferenceData:{entryPoints:[{entryPointType:'phone',uri:'tel:+1-555'},{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'}]},htmlLink:'https://calendar.google.com/event?eid=1'},
  {id:'e2',summary:'Ревью дизайна',location:'Переговорная 3',start:{dateTime:at(9,14)},end:{dateTime:at(9,15)},attendees:[{email:'me@corp.ru',self:true,responseStatus:'accepted'}]},
  {id:'e3',summary:'Обед с партнёром',start:{dateTime:at(9,13)},end:{dateTime:at(9,14)},attendees:[{email:'me@corp.ru',self:true,responseStatus:'declined'}]},
  {id:'e4',summary:'Отменено',status:'cancelled',start:{dateTime:at(9,16)},end:{dateTime:at(9,17)}},
  {id:'e5',summary:'Конференция',start:{date:'2026-11-09'},end:{date:'2026-11-10'}}]})]];
 const today=await turn('что у меня сегодня');
 assert.equal(today.text,'Сегодня 2 встречи: 10:00 Стендап; 14:00 Ревью дизайна. Ближайшая — Стендап в 10:00.');
 const day=today.extensionData.calendarCard;
 assert.equal(day.mode,'day');assert.equal(day.events.length,4);assert.equal(day.events.find(e=>e.id==='e1').link,'https://meet.google.com/abc-defg-hij');assert.equal(day.events.find(e=>e.id==='e3').declined,true);assert.equal(day.events.find(e=>e.id==='e5').allDay,true);
 const q=new URL(calls.at(-1).url).searchParams;assert.equal(q.get('singleEvents'),'true');assert.equal(q.get('timeMin'),new Date(2026,10,9).toISOString());assert.equal(calls.at(-1).headers.Authorization,'Bearer tok-g1');
 assert.equal(topic.messages.at(-1).by,'Календарь');

 // Week strip.
 calls=[];const weekReply=await turn('покажи мои встречи на этой неделе');
 assert.equal(weekReply.extensionData.calendarCard.mode,'week');assert.equal(weekReply.extensionData.calendarCard.days.length,7);
 // Free time on Friday.
 routes=[[u=>u.includes('/calendars/primary/events?'),json({items:[{id:'f1',summary:'1:1',start:{dateTime:at(13,11,30)},end:{dateTime:at(13,12,30)}},{id:'f2',summary:'Свободный слот',transparency:'transparent',start:{dateTime:at(13,15)},end:{dateTime:at(13,16)}}]})]];
 const fri=await turn('когда я свободен в пятницу');
 assert.equal(fri.text,'Пятница, 13 ноября свободно: 10:00–11:30, 12:30–19:00.');assert.equal(fri.extensionData.calendarCard.free.length,2);

 // Slot for three people: «Олегом» is ambiguous → a clarification with choices; the answer resumes the same step.
 routes=[[u=>u==='https://www.googleapis.com/calendar/v3/freeBusy',(u,o)=>{const b=JSON.parse(o.body);return json({calendars:Object.fromEntries(b.items.map(i=>[i.id,i.id==='primary'?{busy:[{start:at(9,10),end:at(9,13)}]}:i.id==='maria@corp.ru'?{busy:[{start:at(9,13),end:at(9,15)},{start:at(10,10),end:at(10,19)}]}:{busy:[{start:at(9,15),end:at(9,16)}]}]))});}]];
 calls=[];
 const asked=await turn('найди час с Машей и Олегом на этой неделе').then(()=>null,e=>e);
 assert.ok(asked instanceof InputRequired,'ambiguous name is a clarification');assert.match(asked.spec.text,/Олегом/);assert.deepEqual(asked.spec.options,['Олег Иванов · oleg@corp.ru','Олег Смирнов · smirnov@corp.ru']);assert.equal(asked.spec.strictChoices,true);
 assert.equal(calls.length,0,'nothing is read before the clarification');
 const found=await asked.resume('Олег Иванов · oleg@corp.ru');
 const card=found.extensionData.calendarCard;
 assert.equal(card.mode,'slots');assert.deepEqual(card.people.map(p=>p.email),['me@corp.ru','maria@corp.ru','oleg@corp.ru']);
 assert.deepEqual(calls[0].body.items.map(i=>i.id),['primary','maria@corp.ru','oleg@corp.ru']);
 const best=card.slots[0];
 // Monday afternoon is free but tight (Oleg until 16:00) or at the day's edge; Wednesday 11:00 has margins.
 assert.equal(best.start,at(11,11));assert.deepEqual(best.busy,[]);assert.ok(card.slots.some(x=>x.start===at(9,17)),'the list spans several days');
 assert.ok(card.slots.every(x=>!x.busy.length));
 assert.match(found.text,/^Нашёл 5 вариантов на 60 мин с Мария, Олег на этой неделе\. Лучший — ср, 11 нояб\.? 11:00–12:00/);
 assert.deepEqual(card.attendees.map(a=>a.email),['maria@corp.ru','oleg@corp.ru']);

 // Create from chat: only a proposal; no write request is made by the turn.
 calls=[];
 const proposal=await turn('поставь встречу с Машей в четверг в 15:00 «Синк по релизу»');
 const draft=proposal.extensionData.calendarCard;
 assert.equal(draft.requested,true);assert.equal(draft.slots[0].start,at(12,15));assert.equal(draft.slots[0].end,at(12,16));assert.equal(draft.title,'Синк по релизу');
 assert.match(proposal.text,/только после «Поставить встречу»/);
 assert.ok(calls.every(c=>c.method==='POST'&&c.url.endsWith('/freeBusy')),'the chat turn never creates an event');
 // A missing email: a question with «Без …» and an inline address.
 const noEmail=await turn('найди час с Сашей завтра').then(()=>null,e=>e);
 assert.match(noEmail.spec.text,/Александр Ким.*нет email/);assert.deepEqual(noEmail.spec.options,['Без «Александр Ким»']);
 const withEmail=await noEmail.resume('alex@corp.ru');
 assert.deepEqual(withEmail.extensionData.calendarCard.attendees.map(a=>a.email),['alex@corp.ru']);
 const without=await (await turn('найди час с Сашей завтра').catch(e=>e)).resume('Без «Александр Ким»');
 assert.deepEqual(without.extensionData.calendarCard.attendees,[]);

 // --- Confirm in the card → the event (Google) ---
 // The default video call is the first video-meeting provider of an added app (here «Google Meet»).
 s.settings['extension_google-meet']='true';s.settings.extension_teams='true';
 const ui=app.setup(s,{fetcher,now:()=>NOW}).ipc;
 routes=[[u=>u.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?'),(u,o)=>json({id:'new1',htmlLink:'https://calendar.google.com/event?eid=new1',conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/new-link'}]}})]];
 calls=[];
 const [first,second]=await Promise.allSettled([ui.create({draftId:draft.draftId,slot:0,title:'  Синк по релизу v2 '}),ui.create({draftId:draft.draftId,slot:0})]);
 assert.equal(first.status,'fulfilled');assert.equal(second.status,'rejected');assert.match(second.reason.message,/Уже создаю/,'duplicate click is refused');
 assert.equal(calls.length,1);
 const post=calls[0];const pq=new URL(post.url).searchParams;
 assert.equal(post.method,'POST');assert.equal(pq.get('sendUpdates'),'all');assert.equal(pq.get('conferenceDataVersion'),'1');
 assert.equal(post.body.summary,'Синк по релизу v2');assert.equal(post.body.start.dateTime,at(12,15));assert.equal(post.body.start.timeZone,'Europe/Moscow');assert.deepEqual(post.body.attendees.map(a=>a.email),['maria@corp.ru']);
 assert.equal(post.body.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');
 assert.equal(first.value.created.url,'https://calendar.google.com/event?eid=new1');assert.equal(first.value.created.link,'https://meet.google.com/new-link');assert.equal(first.value.created.video,'google-meet');
 const again=await ui.create({draftId:draft.draftId,slot:0});assert.equal(again.already,true);assert.equal(calls.length,1,'a created event is never created twice');
 // No answer from the service: the outcome is unknown and is not repeated.
 routes=[[u=>u.includes('/calendars/primary/events?'),()=>{throw Error('socket hang up');}]];
 await assert.rejects(()=>ui.create({draftId:card.draftId,slot:1}),/нет ответа сервиса/);
 await assert.rejects(()=>ui.create({draftId:card.draftId,slot:1}),/Не знаю, создалась ли встреча/);
 await assert.rejects(()=>ui.create({draftId:'missing'}),/устарел/);
 await assert.rejects(()=>ui.create({draftId:withEmail.extensionData.calendarCard.draftId,slot:99}),/Выберите время/);
 await assert.rejects(()=>app.setup(s,{fetcher,now:()=>new Date(2026,11,1)}).ipc.create({draftId:withEmail.extensionData.calendarCard.draftId,slot:0}),/уже прошло/,'a past slot is refused');

 // --- Service errors ---
 routes=[[u=>u.includes('/events?'),json({error:{code:403,message:'Request had insufficient authentication scopes.',status:'PERMISSION_DENIED',details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},403)]];
 const denied=await turn('встречи на завтра');assert.equal(denied.error,true);assert.match(denied.text,/^Календарь · .*Разрешить доступ к календарю/);
 routes=[[u=>u.includes('/events?'),json({error:{code:403,errors:[{reason:'accessNotConfigured'}],message:'Google Calendar API has not been used'}},403)]];
 assert.match((await turn('встречи на завтра')).text,/не включён Google Calendar API/);

 // --- Microsoft Graph ---
 s.settings.gmailCredential='';
 s.settings.microsoftCredential=JSON.stringify({client:{client_id:'x'},accounts:[{id:'m1',email:'me@corp.com',tokens:{refresh_token:'r',scope:'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read'}}]});
 routes=[[u=>u.startsWith('https://graph.microsoft.com/v1.0/me/calendarView?'),json({value:[{id:'o1',subject:'Планирование',start:{dateTime:'2026-11-10T08:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-11-10T09:00:00.0000000',timeZone:'UTC'},location:{displayName:'Teams'},onlineMeeting:{joinUrl:'https://teams.microsoft.com/l/meetup-join/1'},webLink:'https://outlook.office365.com/owa/?itemid=1',showAs:'busy'}]})],
  [u=>u==='https://graph.microsoft.com/v1.0/me/calendar/getSchedule',(u,o)=>{const b=JSON.parse(o.body);return json({value:b.schedules.map(id=>id==='oleg@corp.ru'?{scheduleId:id,error:{message:'no',responseCode:'ErrorNoFreeBusyAccess'}}:{scheduleId:id,scheduleItems:[{status:'busy',start:{dateTime:'2026-11-10T07:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-11-10T09:00:00.0000000',timeZone:'UTC'}},{status:'free',start:{dateTime:'2026-11-10T12:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-11-10T13:00:00.0000000',timeZone:'UTC'}}]})});}],
  [u=>u==='https://graph.microsoft.com/v1.0/me/events',json({id:'ev',webLink:'https://outlook.office365.com/owa/?itemid=ev',onlineMeeting:{joinUrl:'https://teams.microsoft.com/l/meetup-join/ev'}})]];
 calls=[];
 const tomorrow=await turn('встречи на завтра');
 assert.equal(tomorrow.text,'Завтра 1 встреча: 11:00 Планирование.');
 assert.equal(calls[0].headers.Prefer,'outlook.timezone="UTC"');assert.equal(calls[0].headers.Authorization,'Bearer tok-m1');
 assert.equal(tomorrow.extensionData.calendarCard.events[0].link,'https://teams.microsoft.com/l/meetup-join/1');
 calls=[];
 const ms=await turn('найди час с Олегом Ивановым завтра');
 const msCard=ms.extensionData.calendarCard;
 assert.equal(calls[0].body.schedules.join(),'me@corp.com,oleg@corp.ru');
 assert.equal(msCard.people[1].error,'нет доступа к календарю');assert.match(ms.text,/Не видно календарь: Олег Иванов — нет доступа к календарю/);
 assert.ok(Date.parse(msCard.slots[0].start)>=Date.parse('2026-11-10T09:00:00Z'),'busy 10:00–12:00 MSK is skipped; «free» items are not busy');
 calls=[];
 await ui.create({draftId:msCard.draftId,slot:0,video:true});
 assert.equal(calls[0].body.subject,'Встреча: Олег');assert.equal(calls[0].body.start.timeZone,'UTC');assert.equal(calls[0].body.attendees[0].emailAddress.address,'oleg@corp.ru');assert.equal(calls[0].body.isOnlineMeeting,true);
 // Personal Microsoft account: no getSchedule → own busy from events, colleagues marked unknown.
 routes.unshift([u=>u.endsWith('/getSchedule'),json({error:{code:'ErrorInvalidUser',message:'not supported'}},400)]);
 const personal=(await turn('найди час с Олегом Ивановым завтра')).extensionData.calendarCard;
 assert.equal(personal.people[0].busy.length,1);assert.match(personal.people[1].error,/Microsoft не показывает/);

 // Two calendars and no choice in settings: a question, and the answer is remembered.
 s.settings.gmailCredential=JSON.stringify({client:{client_id:'c'},accounts:[{id:'g1',email:'me@corp.ru',tokens:{refresh_token:'r',scope:GOOGLE_SCOPE}}]});
 routes=[[u=>u.includes('/calendars/primary/events?'),json({items:[]})]];
 const which=await turn('что у меня сегодня').catch(e=>e);
 assert.deepEqual(which.spec.options,['me@corp.ru · Google','me@corp.com · Outlook']);
 const picked=await which.resume('me@corp.ru · Google');assert.equal(picked.text,'Сегодня встреч нет.');assert.equal(s.settings.calendarAccount,'google:g1');

 // --- Settings: incremental consent and its notification ---
 const sent=[];s.win={isDestroyed:()=>false,webContents:{send:(ch,item)=>sent.push([ch,item])}};
 const ui2=app.setup(s,{fetcher,now:()=>new Date(),poll:5}).ipc;
 s.settings.calendarAccount='';
 s.settings.microsoftCredential=JSON.stringify({client:{client_id:'x'},accounts:[{id:'m1',email:'me@corp.com',tokens:{refresh_token:'r',scope:'Mail.Read User.Read'}}]});
 const st=await ui2.connect('microsoft','microsoft:m1');
 assert.deepEqual(starts.at(-1),{provider:'microsoft',scopes:['Calendars.ReadWrite'],email:'me@corp.com'});
 assert.equal(sent.at(-1)[0],'extension-install-progress');assert.equal(sent.at(-1)[1].busy,true);assert.equal(st.accounts.find(a=>a.key==='microsoft:m1').calendar,false);
 s.settings.microsoftCredential=JSON.stringify({client:{client_id:'x'},accounts:[{id:'m1',email:'me@corp.com',tokens:{refresh_token:'r',scope:'Mail.Read User.Read Calendars.ReadWrite'}}]});
 s.mailAccounts.microsoft.login.pending=null;
 await new Promise(r=>setTimeout(r,40));
 assert.equal(sent.at(-1)[1].kind,'success');assert.match(sent.at(-1)[1].text,/me@corp\.com подключён/);assert.equal(s.settings.calendarAccount,'microsoft:m1');
 assert.equal(ui2.status().operation.kind,'success','status restores the notification');
 await ui2.connect('google','google:g1');assert.deepEqual(starts.at(-1).scopes,SCOPES.google);
 s.mailAccounts.google.login.pending=null;s.mailAccounts.google.login.lastError='Вход отменён в Google.';
 await new Promise(r=>setTimeout(r,40));assert.equal(sent.at(-1)[1].kind,'error');
 assert.equal(granted('google','https://www.googleapis.com/auth/gmail.readonly'),false);assert.equal(granted('microsoft','https://graph.microsoft.com/Calendars.ReadWrite'),true);

 // --- Shared clients: extra scopes asked with the mail scope kept ---
 const {Gmail}=require('../src/gmail.cjs');const {Outlook}=require('../src/outlook.cjs');
 let url,state={client:{client_id:'id.apps.googleusercontent.com',client_secret:'s'}};
 const tokenCalls=[];
 const gfetch=async(u,o)=>{if(u.includes('oauth2.googleapis.com/token')){tokenCalls.push(Object.fromEntries(new URLSearchParams(o.body)));return new Response(JSON.stringify({access_token:'a',refresh_token:'r',expires_in:3600,scope:GOOGLE_SCOPE}));}return new Response(JSON.stringify({emailAddress:'me@corp.ru'}));};
 const gmail=new Gmail({load:()=>structuredClone(state),save:v=>{state=v;},enabled:()=>true,open:u=>{url=new URL(u);},fetcher:gfetch});
 await gmail.start({scopes:SCOPES.google,email:'me@corp.ru'});
 assert.equal(url.searchParams.get('scope'),GOOGLE_SCOPE);assert.equal(url.searchParams.get('include_granted_scopes'),'true');assert.equal(url.searchParams.get('login_hint'),'me@corp.ru');
 await fetch(url.searchParams.get('redirect_uri')+'?'+new URLSearchParams({state:url.searchParams.get('state'),code:'c'}));
 assert.equal(state.tokens.scope,GOOGLE_SCOPE);assert.equal(granted('google',state.tokens.scope),true);
 state.tokens.expiresAt=0;await gmail.access();assert.equal(state.tokens.scope,GOOGLE_SCOPE,'refresh keeps the granted scopes');
 await gmail.start();assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/gmail.readonly','plain Gmail connection is unchanged');assert.equal(url.searchParams.has('include_granted_scopes'),false);gmail.stop();
 let mstate={client:{client_id:'12345678-1234-1234-1234-123456789abc'}};const mtokens=[];
 const mfetch=async(u,o)=>{if(u.includes('/token')){mtokens.push(Object.fromEntries(new URLSearchParams(o.body)));return new Response(JSON.stringify({access_token:'a',refresh_token:'r',expires_in:3600,scope:'Mail.Read User.Read Calendars.ReadWrite'}));}return new Response(JSON.stringify({mail:'me@corp.com'}));};
 const outlook=new Outlook({load:()=>structuredClone(mstate),save:v=>{mstate=v;},enabled:()=>true,open:u=>{url=new URL(u);},fetcher:mfetch});
 await outlook.start({scopes:SCOPES.microsoft,email:'me@corp.com'});
 assert.equal(url.searchParams.get('scope'),'openid offline_access User.Read Mail.Read Calendars.ReadWrite');assert.equal(url.searchParams.get('login_hint'),'me@corp.com');
 await fetch(url.searchParams.get('redirect_uri')+'?'+new URLSearchParams({state:url.searchParams.get('state'),code:'c'}));
 assert.equal(mtokens[0].scope,'openid offline_access User.Read Mail.Read Calendars.ReadWrite');assert.equal(mstate.tokens.scopes,mtokens[0].scope);
 mstate.tokens.expiresAt=0;await outlook.access();assert.equal(mtokens[1].scope,'openid offline_access User.Read Mail.Read Calendars.ReadWrite','refresh asks for the calendar too');
 mstate={client:mstate.client,tokens:{refresh_token:'r',expiresAt:0}};await outlook.access();assert.equal(mtokens[2].scope,'openid offline_access User.Read Mail.Read','old mail-only accounts refresh as before');

 // --- Offer when not added / not connected ---
 const notReady={extension_calendar:'false'};
 const pickOffer=t=>offers.candidates(t,{offers:[offer],settings:notReady}).map(r=>r.offer.id+(r.direct?':direct':''));
 assert.deepEqual(pickOffer('найди час с Машей на этой неделе'),['calendar:direct']);
 assert.deepEqual(pickOffer('покажи встречи на завтра'),['calendar:direct']);
 assert.deepEqual(pickOffer('открой google calendar'),['calendar:direct']);
 for(const t of ['сводка встречи','что решили на встрече','слушай встречу Zoom','календарь отпусков','срок задачи PET-1'])assert.deepEqual(pickOffer(t),[],t);

 // --- Settings validation ---
 assert.throws(()=>app.validate({calendarWorkStart:'25:00'}),/ЧЧ:ММ/);assert.throws(()=>app.validate({calendarWorkStart:'19:00',calendarWorkEnd:'10:00'}),/раньше/);assert.throws(()=>app.validate({calendarDuration:'7'}),/15, 30/);
 app.validate({calendarWorkStart:'09:30',calendarWorkEnd:'18:00',calendarDuration:'30',calendarAccount:'google:g1'});
 console.log('Calendar: dates, free time and ranked slots, team clarifications, Google/Graph reads and errors, confirm-only idempotent creation, incremental consent, offer and near-misses passed');
})().catch(e=>{console.error(e);process.exit(1);});
