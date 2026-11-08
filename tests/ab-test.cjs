// «A/B-тесты»: statistics against textbook / SciPy reference values, parsing of requests, tables and CSV,
// routing incl. near-misses (CI tests, code tests, regex tests), not added → null, verdicts (рано / лучше /
// разницы не видно / SRM), Holm correction, seeded bootstrap, sample size with a clarification, «Сколько ещё
// ждать?» with a clarification for the traffic, the model extraction guard (no invented numbers) and the offer.
// No network, no model unless stubbed.
const assert=require('node:assert/strict');
const st=require('../src/extensions/ab-test/stats.cjs');
const parse=require('../src/extensions/ab-test/parse.cjs');
const {analyze,plan}=require('../src/extensions/ab-test/analyze.cjs');
const app=require('../src/extensions/ab-test/feature.cjs');
const offer=require('../src/extensions/ab-test/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const close=(a,b,eps,msg)=>assert.ok(Math.abs(a-b)<=eps,(msg||'')+': '+a+' vs '+b);

function services({model=null,files=[]}={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const pending=new Map(files.map(f=>[f.id,f]));
 const calls=[];
 const s={settings:{model:model?'qwen':'',ollamaUrl:'http://127.0.0.1:11434/api/chat','extension_ab-test':'true'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  attachments:{pending,list:()=>[...pending.values()].map(f=>({id:f.id,name:f.name})),take:ids=>ids.map(id=>pending.get(id)),info:f=>({id:f.id,name:f.name}),remove:id=>pending.delete(id)},
  async request(url,options){calls.push({url,body:JSON.parse(options.body)});if(!model)throw Error('no model');return {message:{content:JSON.stringify(model)}};}};
 return {s,topic,calls};
}

(async()=>{
 // --- Distributions against SciPy (scipy.stats 1.18) ---
 close(st.normCdf(1.96),0.9750021048517795,1e-12,'Φ(1.96)');
 close(st.normCdf(-8),6.22096057427174e-16,1e-25,'Φ(−8)');
 close(st.normInv(0.975),1.959963984540054,1e-9,'z 0.975');
 close(st.normInv(0.8),0.8416212335729143,1e-9,'z 0.8');
 close(st.tTwoSided(2,10),0.07338803477074037,1e-10,'t p');
 close(st.tInv(0.975,10),2.228138851986274,1e-8,'t quantile');
 close(st.chiSquareSf(3.841458820694124,1),0.05,1e-12,'χ² 1 df');
 close(st.chiSquareSf(10,3),0.01856613546304325,1e-12,'χ² 3 df');
 // Wilson interval: Newcombe (1998) example 81/263 → 0.2553–0.3662.
 const w=st.wilson(81,263);close(w.low,0.2552885198782742,1e-9,'Wilson low');close(w.high,0.36620957698280004,1e-9,'Wilson high');
 // Welch: the Wikipedia «Welch's t-test» example A1/A2 → t=2.4554, df=24.99, p=0.0214 (scipy.stats.ttest_ind equal_var=False).
 const A1=[27.5,21.0,19.0,23.6,17.0,17.9,16.9,20.1,21.9,22.6,23.1,19.6,19.0,21.7,21.4],A2=[27.1,22.0,20.8,23.4,23.4,23.5,25.8,22.0,24.8,20.2,21.9,22.1,22.9,20.5,24.4];
 const s1=st.summary(A1),s2=st.summary(A2),welch=st.welch(s1,s2);
 close(welch.t,2.455356398286006,1e-9,'Welch t');close(welch.df,24.988529290231416,1e-8,'Welch df');close(welch.p,0.021378001462866992,1e-9,'Welch p');
 // Two proportions: the brief's example A 120/1000, B 141/980 → z=1.5703, p=0.1163 (pooled).
 const tp=st.twoProportions(120,1000,141,980);close(tp.z,1.5702804461261355,1e-9,'z');close(tp.p,0.11634988123476275,1e-9,'p');
 assert.ok(tp.lift.low<0&&tp.lift.high>0,'lift CI covers zero');
 // Sample size (Fleiss, no continuity correction): 10% → 12% at α=0.05, power 0.8 → 3841 per group.
 assert.equal(st.sampleSizeProportions(0.10,0.20),3841);
 close(st.powerProportions(0.10,0.12,3841),0.8,0.002,'power at the planned n');
 close(st.mdeProportions(0.10,3841),0.20,0.001,'MDE at the planned n');
 // Holm: p=[.01,.04,.03,.005] → [.03,.06,.06,.02].
 assert.deepEqual(st.holm([0.01,0.04,0.03,0.005]).map(x=>+x.toFixed(10)),[0.03,0.06,0.06,0.02]);
 // SRM: 50 000 vs 49 000 at 50/50 → χ²=10.101, p=0.00148 (scipy.stats.chisquare).
 const srm=st.srm([50000,49000]);close(srm.chi2,10.1010101010101,1e-9,'SRM χ²');close(srm.p,0.0014818807747203882,1e-12,'SRM p');
 // Bootstrap: fixed seed gives the same interval; it covers the true difference of heavy-tailed data.
 const rand=st.mulberry32(7),pay=m=>Array.from({length:3000},()=>rand()<0.05?Math.exp(rand()*3)*m:0);
 const ra=pay(2),rb=pay(2.6);
 const b1=st.bootstrap(ra,rb,{rounds:400}),b2=st.bootstrap(ra,rb,{rounds:400});
 assert.deepEqual(b1,b2,'same seed, same result');
 const diff=st.summary(rb).mean-st.summary(ra).mean;assert.ok(b1.diff.low<diff&&diff<b1.diff.high);

 // --- Parsing ---
 assert.deepEqual(parse.fromText('A: 1000 игроков 120 конверсий, B: 980 и 141').variants,[{name:'A',users:1000,conversions:120},{name:'B',users:980,conversions:141}]);
 assert.deepEqual(parse.fromText('контроль — 120 из 1000, тест — 141 из 980').variants.map(v=>[v.name,v.users,v.conversions]),[['A',1000,120],['B',980,141]]);
 assert.deepEqual(parse.fromText('A: 12 000 игроков, 1 450 конверсий; B: 12 100 игроков, 1 580 конверсий').variants.map(v=>v.users),[12000,12100]);
 assert.deepEqual(parse.fromText('A: 5000 / 4,1%, B: 5100 / 4,6%').variants.map(v=>v.conversions),[205,235]);
 assert.deepEqual(parse.fromText('A 1000/120, B 980/141').variants.map(v=>[v.users,v.conversions]),[[1000,120],[980,141]]);
 assert.equal(parse.fromText('A 50000, B 49000 есть ли SRM').metric,'assignment');
 assert.equal(parse.fromText('в 10 утра встреча, в 12 обед'),null,'Cyrillic «в» before a number is not a group');
 assert.equal(parse.fromText('A: среднее 5.2, sd 3.1, n 500; B: среднее 5.6, sd 3.3, n 520').metric,'mean');
 assert.deepEqual(parse.fromTable('variant\tusers\tconversions\nA\t1000\t120\nB\t980\t141').variants[1],{name:'B',users:980,conversions:141});
 assert.deepEqual(parse.fromTable('| вариант | игроки | конверсии |\n|---|---|---|\n| A | 1000 | 120 |\n| B | 980 | 141 |').variants.length,2,'markdown table');
 assert.equal(parse.fromTable('group,converted_flag\nA,0\nA,1\nB,1\nB,1').metric,'conversion','0/1 per-user rows are conversions');
 const x=parse.extras('тест идёт 7 дней, сплит 90/10, в день 800 игроков, MDE 5%, каждый день смотрю');
 assert.deepEqual(x,{split:[90,10],dailyTraffic:800,days:7,mde:0.05,peeking:true});

 // --- Verdicts ---
 const early=analyze(parse.fromText('A: 1000 игроков 120 конверсий, B: 980 и 141'));
 assert.equal(early.verdict.kind,'early');assert.equal(early.verdict.label,'рано');
 assert.equal(early.power.required,12004,'12% → 13.2% needs 12 004 per group');
 assert.match(early.summary,/^Рано делать вывод\. B против A: \+19,9%, p=0,12\. Для эффекта \+10% нужно ~12\s004 игроков на группу, сейчас 980\.$/);
 const better=analyze({metric:'conversion',variants:[{name:'A',users:20000,conversions:2000},{name:'B',users:20000,conversions:2300}]});
 assert.equal(better.verdict.kind,'better');assert.equal(better.verdict.label,'B лучше');assert.match(better.verdict.detail,/^p<0,0001, \+15% \[\+8,\d%; \+21,\d%\]$/);
 const nodiff=analyze({metric:'conversion',variants:[{name:'A',users:30000,conversions:3000},{name:'B',users:30000,conversions:3010}]});
 assert.equal(nodiff.verdict.kind,'nodiff');assert.equal(nodiff.verdict.label,'разницы не видно');
 const bad=analyze({metric:'conversion',variants:[{name:'A',users:50000,conversions:5000},{name:'B',users:47000,conversions:5100}]});
 assert.equal(bad.verdict.kind,'srm');assert.equal(bad.verdict.label,'SRM — проверьте разбиение');assert.match(bad.warnings[0],/разделились не так/);
 // A planned 90/10 split is not an SRM.
 assert.equal(analyze({metric:'conversion',split:[90,10],variants:[{name:'A',users:9000,conversions:900},{name:'B',users:1000,conversions:100}]}).srm.flagged,false);
 // Significance before the planned sample: a peeking warning.
 const peek=analyze({metric:'conversion',mde:0.05,variants:[{name:'A',users:3000,conversions:300},{name:'B',users:3000,conversions:390}]});
 assert.equal(peek.verdict.kind,'better');assert.ok(peek.warnings.some(w=>/до набора выборки/.test(w)));
 // Three variants: Holm-adjusted p-values and a note.
 const three=analyze({metric:'conversion',variants:[{name:'A',users:10000,conversions:1000},{name:'B',users:10000,conversions:1080},{name:'C',users:10000,conversions:1150}]});
 assert.equal(three.comparisons.length,2);assert.ok(three.comparisons.every(c=>c.pAdjusted>=c.p));assert.ok(three.warnings.some(w=>/Холма/.test(w)));
 assert.equal(three.verdict.variant,'C');
 // Means from summaries: Welch.
 const means=analyze(parse.fromText('A: среднее 5.2, sd 3.1, n 500; B: среднее 5.6, sd 3.3, n 520'));
 assert.equal(means.comparisons[0].method,'welch');
 // Heavy-tailed per-user revenue: bootstrap with a fixed seed, reproducible.
 const csv='user,variant,revenue\n'+ra.slice(0,1500).map((v,i)=>i+',A,'+v.toFixed(2)).join('\n')+'\n'+rb.slice(0,1500).map((v,i)=>i+',B,'+v.toFixed(2)).join('\n');
 const boot=analyze(parse.fromTable(csv),{rounds:300});
 assert.equal(boot.comparisons[0].method,'bootstrap');assert.equal(boot.comparisons[0].seed,42);assert.equal(boot.heavy,true);
 assert.deepEqual(analyze(parse.fromTable(csv),{rounds:300}).comparisons[0].diff,boot.comparisons[0].diff,'reproducible');
 // Bad input is refused, not guessed.
 assert.throws(()=>analyze({metric:'conversion',variants:[{name:'A',users:100,conversions:120},{name:'B',users:100,conversions:10}]}),/конверсий больше/);
 // Plan.
 const p=plan({baseline:0.1,mde:0.2,dailyTraffic:1000});assert.equal(p.required,3841);assert.equal(p.total,7682);assert.equal(p.days,8);

 // --- Routing ---
 const {s:probe}=services();
 for(const t of ['значим ли тест','посчитай A/B','сколько нужно игроков для теста','есть ли SRM','A: 1000 игроков 120 конверсий, B: 980 и 141','значим ли результат: контроль 120 из 1000, тест 141 из 980'])assert.ok(app.intent(probe,t),'should trigger: '+t);
 for(const t of ['тест упал','напиши тесты','проверь тест на регулярку','упали тесты в CI','A/B тест упал в CI','запусти тесты','значимые задачи спринта','посчитай 2+2','что такое A/B-тест','DAU за неделю','ретеншн D1 D7 D30','крэши за неделю',''])assert.equal(app.intent(probe,t),null,'should not trigger: '+t);

 // Not added → null.
 let {s,topic,calls}=services();
 s.settings['extension_ab-test']='false';
 assert.equal(await app.turn(s,'посчитай A/B: A 1000/120, B 980/141'),null);
 s.settings['extension_ab-test']='true';
 // Happy path, model-free.
 let r=await app.turn(s,'значим ли тест? A: 1000 игроков 120 конверсий, B: 980 и 141');
 assert.equal(r.by,'A/B-тесты');assert.equal(r.extensionData.abTestCard.verdict.kind,'early');assert.equal(calls.length,0,'no model for parsed numbers');
 assert.match(r.extensionData.abTestCard.report,/B против A: \+19,9% \[−4,4%; \+50,4%\], p=0,12 · z-тест двух долей/);
 // No numbers → a question, not a guess.
 r=await app.turn(s,'посчитай A/B');assert.equal(r.question,true);assert.match(r.text,/Пришлите числа по группам/);
 // SRM only.
 r=await app.turn(s,'есть ли SRM: A 50000, B 49000');assert.equal(r.extensionData.abTestCard.metric,'assignment');assert.match(r.text,/SRM не видно/);
 r=await app.turn(s,'есть ли SRM: A 50000, B 48000');assert.equal(r.extensionData.abTestCard.verdict.kind,'srm');
 // «Сколько ещё ждать?» after a card: the traffic is asked through the shared question panel, then computed.
 await app.turn(s,'значим ли тест? A: 1000 игроков 120 конверсий, B: 980 и 141');
 let pending=null;try{await app.turn(s,'Сколько ещё ждать A/B-тест?');}catch(e){pending=e;}
 assert.ok(pending instanceof InputRequired,'asks for daily traffic');assert.match(pending.spec.text,/Сколько игроков в день/);
 r=await pending.resume('800');
 assert.equal(r.extensionData.abTestCard.power.waitDays,Math.ceil((12004*2-1980)/800));assert.match(r.text,/при 800 в день это ~28 дней/);
 r=await pending.resume('много');assert.equal(r.question,true,'invalid answer → ask again');
 // Traffic in the request: no question.
 r=await app.turn(s,'сколько ещё ждать тест, в день 1000 игроков');assert.equal(r.extensionData.abTestCard.power.waitDays,23);
 // Sample size: baseline asked when missing.
 pending=null;try{await app.turn(s,'сколько нужно игроков для теста');}catch(e){pending=e;}
 assert.ok(pending instanceof InputRequired);r=await pending.resume('10%');assert.equal(r.extensionData.abTestCard.mode,'plan');assert.equal(r.extensionData.abTestCard.required,14751);
 r=await app.turn(s,'сколько нужно игроков для теста при конверсии 10% и MDE 20%, в день 1000 игроков');assert.equal(r.extensionData.abTestCard.required,3841);assert.equal(r.extensionData.abTestCard.days,8);
 // Attached CSV, moved into the chat.
 ({s,topic}=services({files:[{id:'f1',name:'ab.csv',text:'variant,users,conversions\nA,20000,2000\nB,20000,2300\n'}]}));
 r=await app.turn(s,'значим ли тест по файлу?');assert.equal(r.extensionData.abTestCard.verdict.kind,'better');assert.equal(r.extensionData.abTestCard.file,'ab.csv');
 assert.equal(s.attachments.list().length,0,'attachment adopted');assert.equal(topic.attachments.length,1);
 // Free-form text: the model extracts, every number must be in the text.
 const free='Значим ли тест: в контроле было две тысячи... точнее 2000 игроков и 230 оплат, во второй ветке 2050 игроков и 290 оплат';
 ({s,calls}=services({model:{metric:'conversion',variants:[{name:'контроль',users:2000,conversions:230},{name:'B',users:2050,conversions:290}]}}));
 r=await app.turn(s,free);assert.equal(calls.length,1);assert.equal(r.extensionData.abTestCard.variants[0].name,'A');assert.equal(r.extensionData.abTestCard.variants[1].conversions,290);
 assert.equal(calls[0].body.options.temperature,0);
 ({s,calls}=services({model:{metric:'conversion',variants:[{name:'A',users:2000,conversions:231},{name:'B',users:2050,conversions:290}]}}));
 r=await app.turn(s,free);assert.equal(r.question,true,'an invented number (231) is refused');assert.equal(r.extensionData,undefined);
 // Without a model the same text gets a question.
 ({s,calls}=services());r=await app.turn(s,free);assert.equal(r.question,true);assert.equal(calls.length,0);

 // --- Offer ---
 const all=offers.load();assert.ok(all.some(o=>o.id==='ab-test'));
 const offered=t=>{const d=offers.decide(offers.candidates(t,{offers:all,settings:{}}));return d?.one?.offer.id||null;};
 for(const t of ['значим ли тест','посчитай A/B','сколько нужно игроков для теста','есть ли SRM'])assert.equal(offered(t),'ab-test',t);
 for(const t of ['тест упал','напиши тесты','упали тесты в CI'])assert.notEqual(offered(t),'ab-test',t);
 assert.equal(offer.ready({'extension_ab-test':'true'}),true);
 console.log('A/B tests: SciPy/textbook statistics, parsing, verdicts, SRM, Holm, seeded bootstrap, plan and wait clarifications, model guard, routing and offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
