// «Подсказки на встрече» (src/extensions/meeting-hints): routing (on for a meeting, always, off, status; near-misses
// return null; not added → null), matching against stubbed meeting summaries and glossary (decisions, promises,
// terms, the semantic hook and its fallback), the 30-second rate limit, dismiss / «не показывать такое» / hide, the
// one-meeting mode ending with the meeting, the calendar context, and the whole path from the live meeting stream
// through the app's meeting listener — only while the app is added. No network, no model.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const feature=require('../src/extensions/meeting-hints/feature.cjs');
const {candidates,RateLimit,stems}=require('../src/extensions/meeting-hints/match.cjs');
const {HintEngine}=require('../src/extensions/meeting-hints/engine.cjs');
const knowledge=require('../src/extensions/meeting-hints/knowledge.cjs');
const hub=require('../src/extensions/meeting-hints/hub.cjs');
const {MeetingStream}=require('../src/meeting-stream.cjs');
const registry=require('../src/features/meeting-stream.cjs');
let finished=false;process.on('exit',()=>{if(!finished){console.error('Meeting hints test did not finish');process.exitCode=1;}});
const DAY=86400000,NOW=Date.parse('2026-11-09T10:00:00Z');
const OCT3=Date.parse('2026-10-03T12:00:00Z'),OCT20=Date.parse('2026-10-20T12:00:00Z');
// Two earlier meetings with summaries, as src/features/meeting-summary.cjs stores them.
const memory=[
 {id:'summary:a',sessionId:'a',source:'Встреча',kind:'summary',title:'Сводка встречи · 3 окт., 15:00',at:OCT3,summary:{discussed:['релиз'],decisions:['Перенести релиз 1.4 на вторник после регресса QA','Скидки в магазине на выходные не делаем до конца ноября'],tasks:[{who:'Я',what:'прислать макеты нового магазина',due:'пятница'},{who:'Олег',what:'обновить сборку для QA',due:''},{who:'Маша',what:'собрать отзывы игроков о магазине',due:''}],notDiscussed:[]}},
 {id:'summary:b',sessionId:'b',source:'Встреча',kind:'summary',title:'Сводка встречи · 20 окт., 11:00',at:OCT20,summary:{discussed:[],decisions:['Боевой пропуск запускаем во втором сезоне'],tasks:[],notDiscussed:[]}},
 {id:'summary:old',sessionId:'old',source:'Встреча',kind:'summary',title:'Сводка встречи · январь',at:NOW-300*DAY,summary:{decisions:['Перенести релиз на вторник'],tasks:[]}},
 {id:'x',sessionId:'a',source:'Встреча',text:'обычная реплика',at:OCT3}
];
const glossaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-hints-'));
fs.mkdirSync(path.join(glossaryRoot,'extensions','glossary'),{recursive:true});
fs.writeFileSync(path.join(glossaryRoot,'extensions','glossary','glossary.json'),JSON.stringify({version:1,projects:{general:{terms:[{id:'t-mana-0001',term:'мана',definition:'ресурс героя для умений, восстанавливается за 30 секунд',synonyms:['МП'],translations:{},forbidden:[]},{id:'t-chest-001',term:'сундук',definition:'',synonyms:[],translations:{},forbidden:[]}]}}}));
function services(extra={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{'extension_meeting-hints':'true',extension_glossary:'true',meetingHintsMode:'off',meetingHintsMuted:''},smoke:true,dataRoot:glossaryRoot,
  saveSettings(values){feature.validate({...s.settings,...values});Object.assign(s.settings,values);},
  memory:{prune:()=>memory},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}},
  ...extra};
 return s;
}
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 // --- Routing: what the request asks, near-misses null ---
 const p=feature.parse;
 assert.equal(p('подсказывай на встречах'),'always');assert.equal(p('Подсказывай мне во время созвонов'),'always');assert.equal(p('включи подсказки на всех встречах'),'always');
 assert.equal(p('включи подсказки'),'meeting');assert.equal(p('Включи подсказки на этой встрече!'),'meeting');assert.equal(p('хочу подсказки на созвоне'),'meeting');
 assert.equal(p('выключи подсказки'),'off');assert.equal(p('не показывай подсказки'),'off');assert.equal(p('не подсказывай'),'off');assert.equal(p('отключи подсказки на встречах'),'off');
 assert.equal(p('какие подсказки на встрече?'),'status');assert.equal(p('подсказки'),'status');
 for(const near of ['сводка встречи','запиши встречу','подскажи, как поставить встречу','подсказка к задаче в Jira','включи подсказки в коде','включи подсказки в Unity','напомни о встрече','что решили на встрече','подготовь меня к встрече','слушай встречу','подскажи синоним к слову встреча','что такое подсказки в IDE'])
  assert.equal(p(near),null,near);

 // --- Matching: decisions, promises, terms; semantic hook first; muted / seen / this meeting excluded ---
 const known={...knowledge.fromMemory(memory,{now:NOW}),terms:knowledge.fromGlossary(services())};
 assert.equal(known.decisions.length,3,'decisions of the last 180 days only');assert.equal(known.promises.length,3);
 assert.deepEqual(known.terms.map(t=>t.term),['мана'],'only terms with a definition');
 assert.deepEqual(knowledge.fromGlossary(services({settings:{extension_glossary:'false'}})),[],'without «Глоссарий» no terms');
 let c=candidates('Может, перенесём релиз на вторник? Регресс всё равно не закончен',known);
 assert.equal(c[0].kind,'decision');assert.match(c[0].text,/Перенести релиз 1\.4/);assert.equal(c[0].at,OCT3);assert.match(c[0].cite,/3 окт/);
 assert.deepEqual(candidates('Релиз сегодня',known),[],'one shared word is not enough');
 c=candidates('А кто пришлёт макеты магазина?',known);
 assert.equal(c[0].kind,'promise');assert.equal(c[0].who,'','the user\'s own promise');assert.equal(c[0].due,'пятница');
 assert.ok(!candidates('сборку для QA кто обновит',known).some(x=>x.kind==='promise'),'Oleg is not in this meeting → his promise is not shown');
 assert.equal(candidates('сборку для QA кто обновит',known,{attendees:['oleg.petrov@studio.io','Олег Петров']})[0].who,'Олег');
 c=candidates('у героя кончилась мана, а МП не восстанавливается',known);
 assert.deepEqual(c.map(x=>x.kind),['term']);assert.equal(c[0].term,'мана');assert.match(c[0].cite,/Общий/);
 assert.ok(!candidates('это обман',known).length);
 assert.deepEqual(candidates('перенесём релиз на вторник, мана',known,{muted:new Set(['decision'])}).map(x=>x.kind),['term'],'muted kind skipped');
 assert.deepEqual(candidates('мана',known,{seen:new Set(['term:мана'])}),[],'shown once per meeting');
 assert.deepEqual(candidates('перенесём релиз на вторник после регресса',{decisions:[{text:'Перенести релиз на вторник после регресса',sessionId:'now'}]},{meetingId:'now'}),[],'this meeting\'s own decisions are not hints');
 c=candidates('про пропуск',known,{semantic:[{text:'Боевой пропуск запускаем во втором сезоне',score:0.83,at:OCT20,title:'Сводка встречи · 20 окт.',sessionId:'b'},{text:'слабое',score:0.4,at:1,title:'',sessionId:'b'}]});
 assert.equal(c.length,1);assert.equal(c[0].by,'semantic');assert.equal(c[0].kind,'decision');
 assert.ok(stems('Давайте решим этот вопрос сегодня').size<=1,'filler words carry no meaning');

 // The semantic index hook: used when the services have it, ignored on failure.
 assert.equal(knowledge.semantic(services()),null,'no index → keyword matching');
 const asked=[];const find=knowledge.semantic(services({semanticIndex:{search:async(q,o)=>{asked.push(o);return [{text:'Боевой пропуск запускаем во втором сезоне',score:0.9,at:OCT20,title:'Сводка',sessionId:'b'},{text:'своё',score:0.99,sessionId:'m1'}];}}}));
 assert.deepEqual((await find('пропуск',{id:'m1'})).map(r=>r.text),['Боевой пропуск запускаем во втором сезоне']);assert.deepEqual(asked,[{kinds:['meeting-decision'],limit:3}]);

 // --- Rate limit ---
 const limit=new RateLimit(30000);assert.ok(limit.take(0));assert.ok(!limit.take(29999));assert.ok(limit.ready(30000));assert.ok(limit.take(30000));limit.reset();assert.ok(limit.ready(1));

 // --- The engine: one hint per 30 s, dismiss, mute, hide, the one-meeting mode ---
 {
  let now=NOW;const shown=[],hidden=[];const settings={meetingHintsMode:'meeting',meetingHintsMuted:''};
  const engine=new HintEngine({settings:()=>settings,save:v=>Object.assign(settings,v),knowledge:async()=>known,show:h=>shown.push(h),hide:()=>hidden.push(now),now:()=>now});
  const final=(text,end=now)=>engine.onEvent({type:'transcript',meetingId:'m1',final:true,text,end,source:'sound'});
  await final('нет встречи — ничего');assert.equal(shown.length,0);
  await engine.onEvent({type:'started',meetingId:'m1',context:{title:'Синк',attendees:[],startedAt:NOW}});
  await engine.onEvent({type:'transcript',meetingId:'m1',final:false,text:'перенесём релиз на вторник'});assert.equal(shown.length,0,'partials are not matched');
  now+=60000;await final('Может перенесём релиз на вторник');
  assert.equal(shown.length,1);assert.equal(shown[0].kind,'decision');assert.equal(shown[0].source.at,OCT3);assert.equal(shown[0].source.kind,'summary');assert.equal(shown[0].offset,60000);
  now+=10000;await final('у героя кончилась мана');assert.equal(shown.length,1,'max one hint per 30 s');
  now+=25000;await final('мана опять');assert.equal(shown.length,2,'30 s later the term comes (the talk window still has it)');assert.equal(shown[1].kind,'term');assert.equal(shown[1].source.kind,'glossary');
  now+=31000;await final('Может перенесём релиз на вторник');assert.equal(shown.length,2,'the same decision is not repeated');
  engine.dismiss();assert.equal(hidden.length,1);
  engine.mute('promise');assert.equal(settings.meetingHintsMuted,'promise');
  now+=31000;await final('кто пришлёт макеты магазина');assert.equal(shown.length,2,'muted kind not shown');
  assert.throws(()=>engine.mute('weather'),/Неизвестный вид/);
  engine.unmute();assert.equal(settings.meetingHintsMuted,'');
  engine.hideForMeeting();now+=31000;await final('кто пришлёт макеты магазина');
  assert.equal(shown.length,2,'hidden for the meeting → not shown');assert.equal(engine.state().hints.length,3,'but kept for the chat card');
  engine.showAgain();assert.equal(shown.length,3,'shown again on request');
  // Paused stream: no matching.
  await engine.onEvent({type:'paused',meetingId:'m1'});now+=31000;await final('боевой пропуск запускаем во втором сезоне');assert.equal(shown.length,3);
  await engine.onEvent({type:'resumed',meetingId:'m1'});
  await engine.onEvent({type:'lag',meetingId:'m1',behind:true,lag:21000});assert.equal(engine.state().meeting.behind,true);
  await engine.onEvent({type:'ended',meetingId:'m1'});
  assert.equal(settings.meetingHintsMode,'off','«включи подсказки» was for this meeting only');assert.equal(engine.state().meeting,null);assert.deepEqual(engine.state().hints,[],'hints forgotten with the meeting');
  // Off: nothing at all, even with matching talk.
  await engine.onEvent({type:'started',meetingId:'m2',context:{startedAt:now}});now+=31000;await final('Может перенесём релиз на вторник');assert.equal(shown.length,3);
  // «always» survives the end of a meeting.
  engine.setMode('always');await engine.onEvent({type:'ended',meetingId:'m2'});assert.equal(settings.meetingHintsMode,'always');
  assert.throws(()=>engine.setMode('sometimes'),/режим/);
  // A failing knowledge source or semantic hook never breaks the meeting: keyword matching with what is there.
  const quiet=new HintEngine({settings:()=>({meetingHintsMode:'always'}),save(){},knowledge:async()=>{throw Error('memory locked');},search:async()=>{throw Error('index down');},show:h=>shown.push(h),now:()=>now});
  await quiet.onEvent({type:'started',meetingId:'m3',context:{}});await quiet.onEvent({type:'transcript',meetingId:'m3',final:true,text:'перенесём релиз на вторник',end:now});assert.equal(shown.length,3);
 }

 // --- Chat turns: not added → null; on / always / off with the card ---
 {
  const s=services({settings:{'extension_meeting-hints':'false',meetingHintsMode:'off',meetingHintsMuted:''}});
  feature.setup(s);
  assert.equal(await feature.turn(s,'включи подсказки'),null,'not added → null');
  s.settings['extension_meeting-hints']='true';
  assert.equal(await feature.turn(s,'сводка встречи'),null);assert.equal(await feature.turn(s,'запиши встречу'),null);
  let r=await feature.turn(s,'включи подсказки');
  assert.equal(s.settings.meetingHintsMode,'meeting');assert.match(r.text,/следующей записанной встрече/);assert.equal(r.by,'Подсказки на встрече');
  const data=r.extensionData.meetingHints;assert.equal(data.mode,'meeting');assert.equal(data.recording,false);assert.equal(data.summaries,3);assert.equal(data.meeting,null);
  s.meetingStream={status:()=>({active:true})};
  r=await feature.turn(s,'Включи подсказки');assert.match(r.text,/на этой встрече/);
  r=await feature.turn(s,'подсказывай на встречах');assert.equal(s.settings.meetingHintsMode,'always');assert.match(r.text,/каждой записываемой встрече/);
  r=await feature.turn(s,'включи подсказки');assert.equal(s.settings.meetingHintsMode,'always','«включи» does not narrow «always»');
  r=await feature.turn(s,'какие подсказки на встрече?');assert.match(r.text,/всех записываемых встречах/);
  r=await feature.turn(s,'выключи подсказки');assert.equal(s.settings.meetingHintsMode,'off');assert.match(r.text,/выключены/);assert.equal(r.extensionData.meetingHints.mode,'off');
  assert.throws(()=>feature.validate({meetingHintsMode:'loud'}),/режим/);assert.throws(()=>feature.validate({meetingHintsMuted:'decision,spam'}),/скрытые/);
  feature.validate({meetingHintsMode:'always',meetingHintsMuted:'decision,term'});
  assert.deepEqual(feature.defaults,{'extension_meeting-hints':'false',meetingHintsMode:'off',meetingHintsMuted:''},'not added and off by default');
 }

 // --- End to end: recorder fragments → live stream → the app's meeting listener → a hint; only while added ---
 {
  const listeners=registry.load();
  assert.ok(listeners.some(x=>x.id==='meeting-hints'&&x.setting==='extension_meeting-hints'),'the app declares its meeting listener');
  let now=NOW;const stream=new MeetingStream({now:()=>now});
  const s=services();s.settings.meetingHintsMode='always';
  const {api}=registry.create(s,{listeners,stream});s.meetingStream=api;
  const {ipc}=feature.setup(s);hub.engine.now=()=>now;
  const say=async(index,text)=>{stream.segment({meetingId:'live',index,source:'Встреча',at:now-3000,endedAt:now-500,text,pending:0});await stream.idle();await tick();await stream.idle();};
  stream.start({meetingId:'live',title:'Синк по магазину'});
  now+=5000;await say(0,'Скидки в магазине на выходные снова предлагают');
  let st=ipc.state();assert.equal(st.meeting.title,'Синк по магазину');assert.equal(st.hints.length,1);assert.equal(st.hints[0].kind,'decision');assert.match(st.hints[0].text,/Скидки в магазине/);
  assert.equal(st.recording,true);assert.equal(st.glossary,true);
  // Removed from the catalog: the listener gets nothing more.
  s.settings['extension_meeting-hints']='false';
  now+=40000;await say(1,'у героя кончилась мана');assert.equal(hub.engine.state().hints.length,1,'not added → no events → no hints');
  assert.throws(()=>ipc.setMode('off'),/не добавлено/);
  s.settings['extension_meeting-hints']='true';
  now+=40000;await say(2,"у героя кончилась мана");assert.equal(hub.engine.state().hints.length,2);
  stream.end('live');await stream.idle();assert.equal(ipc.state().meeting,null);
 }

 // --- Calendar context: the meeting going on now names the meeting and its attendees ---
 {
  const fetched=[];
  const s={settings:{extension_calendar:'true',gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'me@studio.io',tokens:{access_token:'t',scope:'https://www.googleapis.com/auth/calendar'}}]})},
   mailAccounts:{google:{client:()=>({access:async()=>'token'})}}};
  const fetcher=async url=>{fetched.push(String(url));return {ok:true,json:async()=>({items:[
   {id:'1',summary:'Синк по магазину',start:{dateTime:'2026-11-09T09:55:00Z'},end:{dateTime:'2026-11-09T10:30:00Z'},attendees:[{email:'me@studio.io',self:true},{email:'oleg@studio.io'}]},
   {id:'2',summary:'Обед',start:{dateTime:'2026-11-09T12:00:00Z'},end:{dateTime:'2026-11-09T13:00:00Z'}}]})};};
  const ctx=await knowledge.calendar(s,{fetcher,now:new Date(NOW)});
  assert.deepEqual(ctx,{title:'Синк по магазину',attendees:['oleg@studio.io']});assert.match(fetched[0],/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/);
  assert.equal(await knowledge.calendar({settings:{extension_calendar:'false'}}),null);
  assert.equal(await knowledge.calendar(s,{fetcher:async()=>{throw Error('offline');},now:new Date(NOW)}),null,'calendar down → no context, no error');
  // The engine passes it to the stream.
  const notes=[];const engine=new HintEngine({settings:()=>({meetingHintsMode:'always'}),save(){},knowledge:async()=>known,calendar:async()=>ctx,annotate:(id,c)=>notes.push([id,c])});
  await engine.onEvent({type:'started',meetingId:'cal',context:{}});await tick();await tick();
  assert.deepEqual(notes,[['cal',{title:'Синк по магазину',attendees:['oleg@studio.io']}]]);
 }
 fs.rmSync(glossaryRoot,{recursive:true,force:true});
 finished=true;
 console.log('Meeting hints: routing and near-misses, decisions/promises/terms against stubbed memory and glossary, semantic hook and fallback, 30-second rate limit, dismiss/mute/hide, one-meeting mode, chat turns, stream → listener → hint only while added, calendar context passed');
})().catch(e=>{console.error(e);process.exit(1);});
