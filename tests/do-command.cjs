const assert=require('node:assert/strict');
const {doCommand,isDoCommand,actionableContext}=require('../src/core.cjs');
const {claudeBudget}=require('../src/agent-budget.cjs');
const {Agents}=require('../src/agents.cjs');
(async()=>{
 assert(isDoCommand('Петя, делай!'));assert(isDoCommand('делай\nУточнение пользователя: добавить поиск'));assert(!isDoCommand('не делай'));assert(!isDoCommand('сделай задачу'));
 assert(!actionableContext({text:'Привет, как дела?'}));assert(actionableContext({text:'Нужно исправить кнопку входа: после нажатия ничего не происходит.'}));
 for (const command of ['Петя, делай через Codex','делай кодексу','делай, передай Codex']) assert.equal(doCommand(command).target,'codex');
 assert.equal(doCommand('делай через Клода').target,'claude');
 assert.equal(doCommand('делай через Claude\nУточнение пользователя: ошибка в Codex').target,'claude');
 assert.equal(doCommand('делай без Claude'),null);
 assert.equal(doCommand('делай Claude или Codex'),null);
 const now=1000000,usage=p=>({observedAt:now,rate_limits:{five_hour:{used_percentage:p,resets_at:2000}}});
 assert.equal(claudeBudget(usage(79),now).state,'available');assert.equal(claudeBudget(usage(80),now).state,'low');assert.equal(claudeBudget(usage(100),now).remaining,0);
 assert.equal(claudeBudget({...usage(20),observedAt:now-300001},now).state,'unknown');assert.equal(claudeBudget({observedAt:now,context_window:{remaining_percentage:90}},now).state,'unknown');
 assert.equal(claudeBudget({observedAt:now,rate_limits:{five_hour:{used_percentage:NaN,resets_at:2000}}},now).state,'unknown');
 let budget={state:'available'},opened=[],saved;
 const a=new Agents({records:[],save:r=>saved=structuredClone(r),available:async()=>true,budget:()=>budget,open:async url=>opened.push(url),copy:()=>{}});
 const first=a.create('auto','Работа',['T-1'],'one');await a.route(first.id);assert.equal(first.target,'claude');assert.equal(first.state,'send-required');await a.route(first.id,'codex');assert.equal(opened.length,1);
 budget={state:'low'};const second=a.create('auto','Работа',['T-2'],'two');await a.route(second.id);assert.equal(second.target,'codex');
 budget={state:'unknown',reason:'Нет данных'};const third=a.create('auto','Работа',['T-3'],'three');const unresolved=await a.route(third.id);assert.equal(unresolved.ready,false);assert.equal(opened.length,2);assert.equal(unresolved.options.length,3);
 await a.route(third.id,'defer');assert.equal(opened.length,2);
 const restored=new Agents({records:saved,save:()=>{},available:async()=>true,budget:()=>budget,open:async u=>opened.push(u),copy:()=>{}});
 await restored.route(third.id,'codex');assert.equal(opened.length,3);await restored.route(third.id,'claude');assert.equal(opened.length,3);
 const fourth=a.create('auto','Работа',['T-4'],'four');await Promise.allSettled([a.route(fourth.id,'claude'),a.route(fourth.id,'codex')]);assert.equal(opened.length,4);
 budget={state:'low'};const explicit=a.create('auto','Работа',['T-5'],'five');await a.route(explicit.id,doCommand('делай через Claude').target);assert.equal(explicit.target,'claude');
 let probes=0,installed=false;
 const explicitOnly=new Agents({records:[],save:()=>{},available:async()=>installed,budget:()=>{probes++;throw new Error('Must not read quota');},open:async()=>{},copy:()=>{}});
 const waiting=explicitOnly.create('auto','Работа');await explicitOnly.route(waiting.id,'claude');installed=true;await explicitOnly.route(waiting.id);assert.equal(waiting.target,'claude');assert.equal(probes,0);
 for(const only of ['claude','codex']) {
   const single=new Agents({records:[],save:()=>{},available:async target=>target===only,budget:()=>{throw new Error('Quota must not block the only installed executor');},open:async()=>{},copy:()=>{}});
   const automatic=single.create('auto','Работа');await single.route(automatic.id);assert.equal(automatic.target,only);
   const explicitMissing=single.create('auto','Работа');const choice=await single.route(explicitMissing.id,only==='claude'?'codex':'claude');assert.equal(choice.ready,false);assert.equal(explicitMissing.target,'auto');
 }
 console.log('Do command: context readiness, budget threshold/freshness, Claude priority, Codex fallback, choices, persistence and duplicate protection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
