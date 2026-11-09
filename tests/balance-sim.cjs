// «Симуляция баланса» (src/extensions/balance-sim): routing with near-misses (config reconciliation, metrics, money
// balance, levels outside games), the «what if» parser, the economy read from the fixture project through «Конфиги и
// баланс»' readers (rewards, prices, XP curve, hints, each with file and line), the XP table readings, the seeded Monte
// Carlo (deterministic, realised pace = the inputs, monotone percentiles, edge cases), the turn (not added, no project,
// no rewards, the confirm card with nothing run, run by card id, the answer text, a «what if» before/after,
// clarifications for a missing amount and an unknown target), calibration from a metrics source, the offer.
const assert=require('node:assert/strict');
const path=require('node:path');
const app=require('../src/extensions/balance-sim/feature.cjs');
const query=require('../src/extensions/balance-sim/query.cjs');
const E=require('../src/extensions/balance-sim/economy.cjs');
const sim=require('../src/extensions/balance-sim/sim.cjs');
const offer=require('../src/extensions/balance-sim/offer.cjs');
const ROOT=path.join(__dirname,'fixtures/balance-sim/project');

// --- Routing -----------------------------------------------------------------------------------------------------------
for(const t of ['сколько дней до 10 уровня у игрока без доната','Сколько дней до 10-го уровня?','симулируй прогрессию по текущим конфигам','смоделируй экономику на 60 дней',
 'за сколько дней игрок накопит 5000 золота','прогони симуляцию баланса для 2000 игроков','монте-карло прогрессии игроков'])assert.equal(query.about(t),'sim',t);
for(const t of ['что будет с экономикой, если поднять награду за победу на 20%','что будет, если снизить цены улучшений на 10%','как изменится прогрессия, если удвоить опыт за победу',
 'что станет с балансом, если поднять ежедневный бонус до 300'])assert.equal(query.about(t),'whatif',t);
for(const t of ['сверь баланс с конфигами','что поменялось в балансе с прошлой версии','проверь конфиги юнитов','какой у меня баланс на карте','баланс работы и жизни',
 'сколько дней до отпуска','какой уровень английского нужен','DAU за неделю','что такое симуляция Монте-Карло','уровень воды в реке','сколько дней до релиза',
 'что будет, если перенести релиз','симулируй собеседование','если поднять зарплату на 20%','ретеншн D1 D7 D30'])assert.equal(query.about(t),null,t);
assert.deepEqual(query.parse('сколько дней до 10 уровня у игрока без доната'),{level:10,earn:null,days:null,players:null,paying:false,change:null});
assert.equal(query.parse('смоделируй прогрессию за 2 месяца для 2 000 игроков').days,60);
assert.equal(query.parse('смоделируй прогрессию за 2 месяца для 2 000 игроков').players,2000);
assert.deepEqual(query.parse('за сколько дней игрок накопит 5 000 золота').earn,{amount:5000,word:'золота'});
assert.ok(query.parse('сколько дней до 20 уровня у игрока с донатом').paying);
const ch=t=>{const c=query.change(t);return c&&[c.words,c.op,Math.round(c.value*1000)/1000];};
assert.deepEqual(ch('если поднять награду за победу на 20%'),['награду за победу','mul',1.2]);
assert.deepEqual(ch('если снизить цены улучшений на 10 процентов'),['цены улучшений','mul',0.9]);
assert.deepEqual(ch('если удвоить опыт за победу'),['опыт за победу','mul',2]);
assert.deepEqual(ch('если поднять ежедневный бонус до 300'),['ежедневный бонус','set',300]);
assert.deepEqual(ch('если уменьшить награду за поражение в 2 раза'),['награду за поражение','mul',0.5]);
assert.equal(query.change('если поднять награду за победу').missing,true);

(async()=>{
 // --- Economy from configs ---------------------------------------------------------------------------------------------
 const {economy}=await E.read([ROOT]);
 const src=economy.sources.map(x=>[x.label,x.trigger,x.resource,x.amount,x.file,x.line]);
 assert.deepEqual(src.sort(),[
  ['dailyLoginGold','daily','gold',200,'Assets/Data/economy.json',2],
  ['lossGold','loss','gold',40,'Assets/Configs/Economy/BattleRewards.asset',11],
  ['lossXp','loss','xp',20,'Assets/Configs/Economy/BattleRewards.asset',13],
  ['winGold','win','gold',120,'Assets/Configs/Economy/BattleRewards.asset',10],
  ['winXp','win','xp',50,'Assets/Configs/Economy/BattleRewards.asset',12]].sort());
 assert.deepEqual(economy.sinks.map(x=>[x.label,x.resource,x.price]),[['Меч 1','gold',300],['Скин «Дракон»','gem',500],['Меч 2','gold',600],['Меч 3','gold',1200],['Меч 4','gold',2400],['Меч 5','gold',4800],['Меч 6','gold',9600]]);
 assert.equal(economy.sinks[0].line,3);
 assert.equal(economy.main,'gold');
 assert.deepEqual(economy.currencies.sort(),['gem','gold']);
 assert.equal(economy.curve.kind,'per-level');assert.equal(economy.curve.levels,30);assert.equal(economy.curve.file,'Assets/Data/levels.json');
 assert.deepEqual(economy.hints.actionsPerDay,{value:8,file:'Assets/Data/economy.json',line:3,field:'battlesPerDay'});
 assert.equal(economy.notes[0].field,'battleEnergyCost','the energy cost of a battle is not a sink');
 assert.ok(!economy.sources.some(x=>/chance/i.test(x.label)),'a drop chance is not a reward');
 assert.deepEqual(E.levels(economy.curve).slice(0,4),[0,100,218,357]);
 assert.deepEqual(E.levels(economy.curve,'cumulative').slice(0,3),[0,100,118],'the other reading of the same table');
 assert.deepEqual(E.thresholds({values:[0,100,250,450]},'cumulative'),[0,100,250,450]);
 assert.deepEqual(E.thresholds({values:[100,150,200]},'per-level'),[0,100,250,450]);
 assert.deepEqual(E.thresholds({rows:[{level:2,xp:100},{level:3,xp:250}],values:null},'cumulative'),[0,100,250]);
 assert.deepEqual(E.tokens('rewards.victory.softCurrency'),['rewards','victory','soft','currency']);
 // Shapes: a JSON object with nested rewards, a list of upgrade levels, an XP array in one object.
 const shaped=E.detect({sets:[
  {objects:[{id:'eco',file:'eco.json',fields:{'rewards.victory.coins':30,'rewards.defeat.coins':10,'rewards.victory.exp':12,'daily.bonus.gems':5,'xpPerLevel':[50,80,120,170]},lines:{'rewards.victory.coins':3}}]},
  {objects:[{id:'u1',name:'Броня 1',file:'up.json',fields:{level:1,costCoins:100},lines:{costCoins:2}},{id:'u2',name:'Броня 2',file:'up.json',fields:{level:2,costCoins:250},lines:{costCoins:3}}]}]});
 assert.deepEqual(shaped.sources.map(x=>[x.trigger,x.resource,x.amount]).sort(),[['daily','gem',5],['loss','coin',10],['win','coin',30],['win','xp',12]].sort());
 assert.deepEqual(shaped.sinks.map(x=>[x.label,x.resource,x.price]),[['Броня 1','coin',100],['Броня 2','coin',250]]);
 assert.equal(shaped.curve.field,'xpPerLevel');assert.equal(shaped.main,'coin');

 // --- Simulation ------------------------------------------------------------------------------------------------------
 const model={sources:economy.sources,sinks:economy.sinks,thresholds:E.levels(economy.curve)};
 const p={players:800,days:30,actionsPerDay:8,winRate:0.5,seed:7};
 const a=sim.run(model,p,{levels:[10],earn:[{resource:'gold',amount:5000}]}),b=sim.run(model,p,{levels:[10],earn:[{resource:'gold',amount:5000}]});
 assert.deepEqual(a,b,'the same seed gives the same numbers');
 assert.notDeepEqual(sim.run(model,{...p,seed:8},{levels:[10]}).level,a.level,'another seed, other draws');
 assert.ok(Math.abs(a.realised.actionsPerDay-8)<0.4,'realised battles per day ≈ the input: '+a.realised.actionsPerDay);
 assert.ok(Math.abs(a.realised.winRate-0.5)<0.02);
 for(const d of a.level)assert.ok(d.p10<=d.p25&&d.p25<=d.p50&&d.p50<=d.p75&&d.p75<=d.p90);
 for(let d=1;d<a.level.length;d++)assert.ok(a.level[d].p50>=a.level[d-1].p50,'levels never go down');
 const lv=a.milestones.find(m=>m.label==='level');assert.ok(lv.p10<=lv.p50&&lv.p50<=lv.p90&&lv.reached===1);
 // Expected XP per day 8 × (0.5·50 + 0.5·20) = 280; level 10 needs 1 909 XP → about 7 days for the median player.
 assert.equal(E.levels(economy.curve)[9],1909);assert.ok(lv.p50>=6&&lv.p50<=9,'median day of level 10: '+lv.p50);
 const earn=a.milestones.find(m=>m.label==='earn');assert.ok(earn.p50>=5&&earn.p50<=8,'5000 gold earned at ≈840 a day: '+earn.p50);
 assert.equal(a.milestones.find(m=>m.label==='sinks').count,6,'gems cannot be earned: the skin is not in «all purchases»');
 assert.equal(a.currency.gem.at(-1).p90,0);
 const none=sim.run(model,{...p,actionsPerDay:0},{levels:[2]});
 assert.equal(none.level.at(-1).p90,1);assert.equal(none.currency.gold.at(-1).p90,0);assert.equal(none.milestones[0].reached,0);assert.equal(none.milestones[0].p50,null);
 const losing=sim.run({...model,sinks:[]},{...p,winRate:0,players:50,days:5},{});
 assert.equal(losing.realised.winRate,0);
 const saving=sim.run(model,{...p,spend:false},{});assert.ok(saving.currency.gold.at(-1).p50>a.currency.gold.at(-1).p50,'without spending the balance only grows');
 // «What if»: +20% to the win gold → more gold, the same levels (XP unchanged).
 const ids=query.targets(economy,'награду за победу').map(x=>x.id);
 assert.deepEqual(query.targets(economy,'награду за победу').map(x=>x.label),['winGold']);
 assert.deepEqual(query.targets(economy,'опыт за победу').map(x=>x.label),['winXp']);
 assert.deepEqual(query.targets(economy,'ежедневный бонус').map(x=>x.label),['dailyLoginGold']);
 assert.deepEqual(query.targets(economy,'цены улучшений').map(x=>x.label).length,7);
 assert.deepEqual(query.targets(economy,'цену Меч 3').map(x=>x.label),['Меч 3']);
 assert.deepEqual(query.targets(economy,'погоду'),[]);
 const up=sim.run(sim.apply(model,{ids,op:'mul',value:1.2}),p,{levels:[10]});
 assert.deepEqual(up.level,sim.run(model,p,{levels:[10]}).level,'XP unchanged: same draws, same levels');
 assert.ok(up.currency.gold.at(-1).p50>a.currency.gold.at(-1).p50);
 assert.deepEqual(sim.expected(model,{actionsPerDay:8,winRate:0.5}),{gold:840,xp:280});

 // --- Turns ------------------------------------------------------------------------------------------------------------
 const make=(folders=[ROOT],extra={})=>{
  const topic={id:'t',title:'Чат',messages:[],projectId:'p'};
  return {topic,s:{settings:{'extension_balance-sim':'true',...extra},requestProgress:{report(){}},
   dialogue:{state:{projects:[{id:'p',name:'Arena',folders}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}}};
 };
 {const {s}=make();s.settings['extension_balance-sim']='false';assert.equal(await app.turn(s,'сколько дней до 10 уровня у игрока без доната'),null,'not added');}
 {const {s}=make();assert.equal(await app.turn(s,'сверь баланс с конфигами'),null,'config-balance phrase');}
 {const {s}=make([]);const r=await app.turn(s,'симулируй прогрессию по текущим конфигам');assert.ok(r.question);assert.match(r.text,/Подключите папку проекта/);}
 {const {s}=make([path.join(__dirname,'fixtures/config-balance/project')]);const r=await app.turn(s,'симулируй прогрессию по текущим конфигам');assert.ok(r.question);assert.match(r.text,/не нашёл наград/);}
 const {s,topic}=make();
 const r=await app.turn(s,'сколько дней до 10 уровня у игрока без доната');
 assert.match(r.text,/^Нашёл в конфигах 5 наград, 7 цен и кривую опыта на 30 уровней\. Проверьте модель цикла — 8 действий в день, побед 50% — и нажмите «Запустить симуляцию»\.$/);
 let card=topic.messages.at(-1).extensionData.simCard;
 assert.equal(card.state,'confirm');assert.equal(card.result,undefined,'nothing runs before the button');
 assert.deepEqual(card.goals,{levels:[10],earn:[]});
 assert.equal(card.params.days,21,'the horizon: ≈7 days at the expected pace × 3');
 assert.deepEqual(card.from.actionsPerDay,{kind:'config',file:'Assets/Data/economy.json',line:3,field:'battlesPerDay'});
 assert.deepEqual(card.from.winRate,{kind:'default'});
 assert.equal(card.canCalibrate,false);
 // The page sends the loop; the numbers are clamped; the economy comes from the stored card.
 const done=await app.run(s,card.id,{actionsPerDay:'8',winRate:0.5,players:99999,days:21,seed:42,spend:true,curveKind:'bogus'});
 assert.equal(done.state,'done');assert.equal(done.params.players,5000);assert.equal(done.params.curveKind,'per-level');
 assert.match(topic.messages.at(-1).text,/^Симуляция 5000 игроков без доната на 21 день: до 10 уровня: медиана \d+ (?:день|дня|дней) \(10% игроков — за \d+ и быстрее, 10% — за \d+ и дольше\)/);
 await assert.rejects(app.run(s,'nope',{}),/не найдена/);
 const twice=[app.run(s,card.id,{}),app.run(s,card.id,{})];await assert.rejects(twice[1],/уже считается/);await twice[0];
 // «What if»: the change and its targets on the card; the base and the variant on the same draws.
 await app.turn(s,'что будет с экономикой, если поднять награду за победу на 20%');
 card=topic.messages.at(-1).extensionData.simCard;
 assert.deepEqual(card.change.labels,['winGold']);assert.equal(card.change.value,1.2);assert.equal(card.params.days,30);
 const w=await app.run(s,card.id,{});
 assert.ok(w.result.variant);
 assert.match(topic.messages.at(-1).text,/^Если поднять награду за победу на 20% \(winGold\), у 1000 игроков за 30 дней: золото на руках к 30-му дню: [\d\s\u00a0\u202f]+ → [\d\s\u00a0\u202f]+ \(\+1\d%\)/);
 assert.match(topic.messages.at(-1).text,/Без изменений: 5 уровень, 10 уровень/);
 // Clarifications before anything: a missing amount, an unknown target (resumed with the user's answer).
 await assert.rejects(app.turn(s,'что будет с экономикой, если поднять награду за победу'),e=>e.name==='InputRequired'&&e.spec.options.length===3);
 try{await app.turn(s,'что будет с экономикой, если поднять награду за победу');}catch(e){const next=await e.resume('На +20%');assert.match(next.text,/Изменение: winGold × 1,2/);}
 let asked=null;try{await app.turn(s,'что будет с экономикой, если поднять награду за квесты на 20%');}catch(e){asked=e;}
 assert.equal(asked?.name,'InputRequired');assert.ok(asked.spec.strictChoices);assert.ok(asked.spec.options.some(o=>o.startsWith('winGold')));
 const resumed=await asked.resume(asked.spec.options.find(o=>o.startsWith('lossGold')));assert.match(resumed.text,/Изменение: lossGold × 1,2/);
 // Paying players are not modelled — said in the answer.
 assert.match((await app.turn(s,'сколько дней до 20 уровня у игрока с донатом')).text,/Покупки за деньги симуляция не моделирует/);

 // --- Calibration from a metrics source -------------------------------------------------------------------------------
 await assert.rejects(app.calibrate(s,card.id),/Нет источника метрик/);
 const DAY=86400000,now=Date.parse('2026-11-09T12:00:00Z');app.deps.now=()=>now;
 let asked2=null;
 app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{events:async()=>[{name:'battle_win'},{name:'battle_lose'},{name:'shop_open'}],
  journeys:async(_,q)=>{asked2=q;return {journeys:[{user:'a',times:{battle_win:[now-DAY,now-DAY+1,now-DAY+2],battle_lose:[now-DAY+3]}},{user:'b',times:{battle_win:[now-2*DAY],battle_lose:[now-2*DAY,now-2*DAY+5,now-3*DAY]}},
   ...Array.from({length:6},(_,i)=>({user:'c'+i,times:{battle_win:[now-DAY,now-DAY+9],battle_lose:[now-DAY+7]}}))]};}}}];
 const cal=await app.calibrate(s,card.id);
 assert.deepEqual(asked2.events.sort(),['battle_lose','battle_win']);
 // player-days: a 4, b on two days 3 and 1, six players 3 each → (4+3+1+18)/9
 assert.equal(cal.actionsPerDay,Math.round(26/9*10)/10);assert.equal(cal.winRate,Math.round(16/26*1000)/1000);assert.equal(cal.players,8);
 app.deps.metrics=[{id:'x',name:'X',source:{events:async()=>[{name:'shop_open'}],journeys:async()=>({journeys:[]})}}];
 await assert.rejects(app.calibrate(s,card.id),/не нашёл боёв/);
 app.deps.metrics=null;app.deps.now=()=>Date.now();

 // --- Offer -----------------------------------------------------------------------------------------------------------
 const offers=require('../src/features/extension-offers.cjs');
 const offered=t=>offers.candidates(t,{offers:[offer],settings:{}}).map(x=>x.offer.id);
 for(const t of ['сколько дней до 10 уровня у игрока без доната','что будет с экономикой, если поднять награду за победу на 20%','симулируй прогрессию по текущим конфигам'])assert.deepEqual(offered(t),['balance-sim'],t);
 for(const t of ['сверь баланс с конфигами','какой у меня баланс на карте','сколько дней до отпуска','DAU за неделю'])assert.deepEqual(offered(t),[],t);
 console.log('Balance simulation: routing and near-misses, what-if parser, economy from configs with file:line (asset, JSON, nested, arrays), XP readings, seeded Monte Carlo (deterministic, pace, percentiles, edges), confirm card then run by id, answer text, what-if before/after, clarifications, calibration from journeys, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
