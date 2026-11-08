// Meeting summary: discussed / decided / tasks / not discussed from the transcript without echo, the meeting service's letter
// used when it came, and the chat question answered with it.
const assert=require('node:assert/strict');const feature=require('../src/features/meeting-summary.cjs');const {ContextStore}=require('../src/context-store.cjs');
const now=Date.now(),m=60000;
const rows=[{id:'a1',sessionId:'s1',source:'Встреча',speaker:'Sergey Ivanov',text:'Релиз переносим на четверг',at:now-30*m},{id:'a2',sessionId:'s1',source:'Микрофон',text:'Релиз переносим на четверг',at:now-30*m+3000},
 {id:'a3',sessionId:'s2',source:'Микрофон',text:'Я посмотрю баг с покупками',at:now-20*m},{id:'a4',sessionId:'s2',source:'Встреча',text:'谢谢',at:now-19*m}];
assert.equal(feature.meetings(rows).length,1,'a restarted recording is one meeting');
const lines=feature.transcript(feature.meetings(rows)[0],rows,[{name:'Сергей Иванов',role:'QA'}]);
assert.match(lines,/Сергей Иванов \(QA\): Релиз/);assert.match(lines,/Я: Я посмотрю баг/);assert.doesNotMatch(lines,/谢谢/);assert.equal(lines.split('\n').length,2,'echo and made-up text left out');
assert.equal(feature.plainVtt('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nАнна: Привет\n'),'Анна: Привет');
(async()=>{
 const memory=new ContextStore({items:rows,save:()=>{},now:()=>now});let asked;
 const said=[];const s={smoke:true,settings:{model:'qwen',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_zoom:'true'},core:{localEndpoint:u=>u},memory,team:{members:()=>[]},meetingSessions:{status:()=>[]},
  mailAccounts:{google:{accounts:()=>[{id:'g'}]},search:async()=>[{subject:'Расшифровка встречи Zoom',text:'Итоги',at:now-10*m,attachments:[{name:'meeting.vtt',text:'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nСергей: Релиз в четверг'}]}]},
  request:async(_u,o)=>{asked=JSON.parse(JSON.parse(o.body).messages[1].content);return {message:{content:JSON.stringify({discussed:['Перенос релиза'],decisions:['Релиз в четверг'],tasks:[{who:'Я',what:'Посмотреть баг с покупками',due:''}],notDiscussed:['Кланы']})}};},
  dialogue:{rememberAction:(c,t)=>said.push(t),active:()=>null},requestProgress:{report(){}}};
 // The letter is found by the Zoom extension's meeting source; without the extension there is none.
 s.meetingSources=require('../src/features/meeting-sources.cjs').create(s);
 const {meetingSummary}=feature.setup(s);
 const reply=await meetingSummary.turn('Сделай сводку по последней встрече');
 assert.match(reply.text,/Обсудили[\s\S]*Перенос релиза/);assert.match(reply.text,/Не обсудили[\s\S]*Кланы/);assert.match(reply.text,/письма сервиса встреч с расшифровкой \(Zoom\)/);
 assert.match(asked.serviceLetter,/Сергей: Релиз в четверг/);
 const saved=memory.prune();assert.ok(saved.some(r=>r.kind==='summary'&&r.basis==='mail'));assert.ok(saved.some(r=>r.kind==='meeting-mail'&&r.from==='Zoom'));
 assert.equal(await meetingSummary.turn('Как дела?'),null);
 // Without the Zoom extension no source looks for a letter: the summary is made from the transcript alone.
 {const bare={...s,settings:{...s.settings,extension_zoom:'false'},memory:new ContextStore({items:rows.map(r=>({...r})),save:()=>{},now:()=>now})};bare.meetingSources=require('../src/features/meeting-sources.cjs').create(bare);
  const r=await feature.setup(bare).meetingSummary.turn('Сделай сводку по последней встрече');assert.doesNotMatch(r.text,/письма/);assert.ok(!bare.memory.prune().some(x=>x.kind==='meeting-mail'));}
 // Natural questions about the last meeting get the summary; a meeting named otherwise is left to the usual answer.
 for(const q of ['Что было на последней встрече?','о чём говорили на созвоне','что обсудили на последней встрече','как прошла встреча','а что решили на прошлом созвоне?','что мы не обсудили на встрече'])assert.match((await meetingSummary.turn(q))?.text||'',/Обсудили/,q);
 for(const q of ['что было на встрече с клиентом в понедельник','напомни про встречу','что такое созвон'])assert.equal(await meetingSummary.turn(q),null,q);
 console.log('meeting summary: discussed, decided, tasks, not discussed, the meeting service letter (only with its app added) and the chat question passed');
})().catch(e=>{console.error(e);process.exit(1);});
