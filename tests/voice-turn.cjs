const assert = require('node:assert/strict');
const {VoiceTurn} = require('../src/ui/voice-turn.js');
function fixture(){
 let now=1000,id=0,pending=false,timeouts=0;const timers=new Map(),sent=[],states=[];
 const turn=new VoiceTurn({dispatch:(...args)=>sent.push(args),pending:()=>pending,onTimeout:()=>timeouts++,status:s=>states.push(s),now:()=>now,schedule:(fn,delay)=>{timers.set(++id,{at:now+delay,fn});return id;},cancel:id=>timers.delete(id)});
 const tick=async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await Promise.resolve();}now=end;await Promise.resolve();};
 return {turn,sent,states,tick,now:()=>now,pending:v=>pending=v,timeouts:()=>timeouts};
}
(async()=>{
 let f=fixture();f.turn.activity();f.turn.feed('Петя, создай задачу про вход',1000,1000);await f.tick(1199);assert.equal(f.sent.length,0);await f.tick(1);assert.equal(f.sent.length,1);await f.tick(5000);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя, создай задачу',1000,1000);await f.tick(1000);f.turn.activity();f.pending(true);await f.tick(5000);assert.equal(f.sent.length,0);f.turn.feed('для авторизации через почту',2000,4000);f.pending(false);await f.tick(100);assert.equal(f.sent.length,1);assert.equal(f.sent[0][0],'создай задачу для авторизации через почту');
 f=fixture();f.turn.feed('Петя',1000,1000);await f.tick(3000);assert.equal(f.sent.length,0);f.turn.feed('создай задачу',4000,4000);await f.tick(1800);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя создай задачу для',1000,1000);await f.tick(5000);assert.equal(f.sent.length,0);f.turn.feed('нового экрана',6000,6000);await f.tick(1800);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.turn.feed('отмена',1100,1100);await f.tick(5000);assert.equal(f.sent.length,0);
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.turn.reset();await f.tick(5000);assert.equal(f.sent.length,0);
 f=fixture();assert.equal(f.turn.feed('Обсудим задачу',1000,1000).consumed,false);await f.tick(5000);assert.equal(f.sent.length,0);
 f=fixture();f.turn.arm();f.turn.feed('Второй',1000,1000);await f.tick(1800);assert.equal(f.sent[0][0],'Второй');
 f=fixture();f.turn.feed('Петя',1000,1000);await f.tick(13000);assert.equal(f.turn.active,false);assert.equal(f.turn.feed('случайный разговор',14000,14000).consumed,false);
 f=fixture();f.turn.feed('Петя, посмотри',1000,1000);f.turn.feed('Петя, сколько дефектов в релизе',1100,1100);await f.tick(1900);assert.equal(f.sent[0][0],'посмотри сколько дефектов в релизе');
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.pending({capturing:false,transcribing:true});await f.tick(1200);assert(f.states.includes('Распознаю последние слова…'));await f.tick(11000);assert.equal(f.timeouts(),1);assert.equal(f.turn.active,false);assert.equal(f.sent.length,0);await f.tick(30000);assert.equal(f.timeouts(),1);
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.pending({capturing:false,transcribing:true});await f.tick(1200);f.turn.feed('про вход',1000,1000);await f.tick(100);assert.equal(f.states.at(-1),'Распознаю последние слова…');
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.pending({capturing:false,transcribing:false});await f.tick(1200);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.pending({capturing:true,transcribing:true});for(let i=0;i<61;i++){f.turn.activity();await f.tick(1000);}assert.equal(f.timeouts(),1);assert.equal(f.sent.length,0);
 f=fixture();f.turn.feed('Петя как дела',1000,1000);f.pending({capturing:false,buffered:true,transcribing:true});await f.tick(1200);f.turn.feed('сегодня',1000,1000);assert.equal(f.states.at(-1),'Распознаю последние слова…');assert.equal(f.turn.deadline,13000);await f.tick(100);assert.equal(f.states.at(-1),'Распознаю последние слова…');f.pending(false);await f.tick(100);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Как дела?',1000,1000,true);await f.tick(1300);assert.equal(f.sent[0][0],'Как дела?');
 f.turn.feed('Какие проекты есть?',2300,2300,true);await f.tick(1300);assert.equal(f.sent[1][0],'Какие проекты есть?');
 assert.equal(f.turn.feed('Фоновый разговор',3600,3600,false).consumed,false);
 f.turn.feed('Петя, ты тут?',3600,3600,false);await f.tick(1300);assert.equal(f.sent[2][0],'ты тут?');
 f=fixture();assert.equal(f.turn.feed('',1000,1000,true).consumed,false);await f.tick(13000);assert.equal(f.sent.length,0);
 console.log('Voice turns: pauses, delayed transcription, continuation, incomplete sentences, wake word, cancellation, replies and one-shot dispatch passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
