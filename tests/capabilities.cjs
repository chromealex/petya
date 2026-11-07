const assert=require('node:assert/strict');
const {CATALOG,restate,grounded}=require('../src/capabilities.cjs');
const {routingRequest,parseRoute,dispatch}=require('../src/semantic-tools.cjs');
// Every canonical example is taken by its handler's own gate.
for(const c of CATALOG)for(const e of c.examples)assert(c.accepts(e),c.id+': '+e);
// Free wording restated by the model runs only when the handler takes it and nothing is invented.
assert.equal(restate('recurring','проверяй почту каждые 30 минут','глядь почту раз в полчаса'),'проверяй почту каждые 30 минут');
assert.equal(restate('recurring','проверяй почту каждые 15 минут','глядь почту раз в полчаса'),null,'invented number');
assert.equal(restate('jira-work','какие задачи у Ивана','чем сейчас занят Иван по джире'),'какие задачи у Ивана');
assert.equal(restate('jira-work','какие задачи у Петра','чем сейчас занят Иван по джире'),null,'invented name');
assert.equal(restate('unity','покажи ошибки в консоли Unity','чё там юнити ругается'),'покажи ошибки в консоли Unity');
assert.equal(restate('project-memory','работаем над проектом Альфа','давай теперь займёмся альфой'),'работаем над проектом Альфа');
assert.equal(restate('recurring','расскажи анекдот','расскажи что-нибудь смешное'),null,'gate rejects');
assert.equal(restate('nope','что ты умеешь','x'),null);
assert(grounded('проверяй почту каждые 5 минут','каждые пять минут проверяй ящик'));
// The router offers the catalogue and returns the restatement only when sure.
const req=routingRequest('m','глядь почту раз в полчаса',{capabilities:CATALOG});
assert(req.format.properties.tool.enum.includes('recurring')&&req.format.required.includes('canonical'));assert.match(req.messages[0].content,/recurring — повторять команду/);
const answer=(o)=>({message:{content:JSON.stringify({tool:'chat',confidence:.9,recipeId:'',question:'',canonical:'',...o})}});
assert.deepEqual(parseRoute(answer({tool:'recurring',confidence:.92,canonical:'проверяй почту каждые 30 минут'}),[],CATALOG),{tool:'capability',id:'recurring',canonical:'проверяй почту каждые 30 минут'});
assert.equal(parseRoute(answer({tool:'recurring',confidence:.5,canonical:'x'}),[],CATALOG),null,'unsure capability is ignored');
assert.equal(parseRoute(answer({tool:'recurring',confidence:.95,canonical:'x'}),[],[]),null,'unknown without catalogue');
(async()=>{
 assert.equal(await dispatch({tool:'capability',id:'recurring',canonical:'c'},'o',{}),null);
 assert.equal((await dispatch({tool:'capability',id:'recurring',canonical:'c'},'o',{capability:async(c,r)=>({text:r.canonical})})).text,'c');
 console.log('Capabilities: '+CATALOG.length+' functions by meaning, gate-checked restatements, no invented names or numbers passed');
})().catch(e=>{console.error(e);process.exit(1);});
