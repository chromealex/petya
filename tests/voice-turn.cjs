const assert = require('node:assert/strict');
const {VoiceTurn} = require('../src/ui/voice-turn.js');
function fixture(){
 let now=1000,id=0,pending=false;const timers=new Map(),sent=[],states=[];
 const turn=new VoiceTurn({dispatch:(...args)=>sent.push(args),pending:()=>pending,status:s=>states.push(s),now:()=>now,schedule:(fn,delay)=>{timers.set(++id,{at:now+delay,fn});return id;},cancel:id=>timers.delete(id)});
 const tick=async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await Promise.resolve();}now=end;await Promise.resolve();};
 return {turn,sent,states,tick,now:()=>now,pending:v=>pending=v};
}
(async()=>{
 let f=fixture();f.turn.activity();f.turn.feed('Петя, создай задачу про вход',1000,1000);await f.tick(1799);assert.equal(f.sent.length,0);await f.tick(1);assert.equal(f.sent.length,1);await f.tick(5000);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя, создай задачу',1000,1000);await f.tick(1000);f.turn.activity();f.pending(true);await f.tick(5000);assert.equal(f.sent.length,0);f.turn.feed('для авторизации через почту',2000,4000);f.pending(false);await f.tick(100);assert.equal(f.sent.length,1);assert.equal(f.sent[0][0],'создай задачу для авторизации через почту');
 f=fixture();f.turn.feed('Петя',1000,1000);await f.tick(3000);assert.equal(f.sent.length,0);f.turn.feed('создай задачу',4000,4000);await f.tick(1800);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя создай задачу для',1000,1000);await f.tick(5000);assert.equal(f.sent.length,0);f.turn.feed('нового экрана',6000,6000);await f.tick(1800);assert.equal(f.sent.length,1);
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.turn.feed('отмена',1100,1100);await f.tick(5000);assert.equal(f.sent.length,0);
 f=fixture();f.turn.feed('Петя создай задачу',1000,1000);f.turn.reset();await f.tick(5000);assert.equal(f.sent.length,0);
 f=fixture();assert.equal(f.turn.feed('Обсудим задачу',1000,1000).consumed,false);await f.tick(5000);assert.equal(f.sent.length,0);
 f=fixture();f.turn.arm();f.turn.feed('Второй',1000,1000);await f.tick(1800);assert.equal(f.sent[0][0],'Второй');
 f=fixture();f.turn.feed('Петя',1000,1000);await f.tick(13000);assert.equal(f.turn.active,false);assert.equal(f.turn.feed('случайный разговор',14000,14000).consumed,false);
 f=fixture();f.turn.feed('Петя, посмотри',1000,1000);f.turn.feed('Петя, сколько дефектов в релизе',1100,1100);await f.tick(1900);assert.equal(f.sent[0][0],'посмотри сколько дефектов в релизе');
 console.log('Voice turns: pauses, delayed transcription, continuation, incomplete sentences, wake word, cancellation, replies and one-shot dispatch passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
