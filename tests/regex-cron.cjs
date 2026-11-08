// «Регулярки и cron»: cron parsing, description and next runs; safe regex tests with a time limit;
// drafted patterns shown only after their own examples; chat turns with card data; the offer when not added.
const assert=require('node:assert/strict');
const cron=require('../src/extensions/regex-cron/cron.cjs');
const regex=require('../src/extensions/regex-cron/regex.cjs');
const app=require('../src/extensions/regex-cron/feature.cjs');
(async()=>{
 // Cron: fields, aliases, ranges with steps, names, OR between day of month and weekday.
 const weekdays=cron.parse('*/15 9-18 * * 1-5');
 assert.equal(cron.describe(weekdays),'каждые 15 мин с 09:00 до 18:45 по будням');
 assert.equal(cron.describe(cron.parse('30 9 * * 1-5')),'в 09:30 по будням');
 assert.equal(cron.describe(cron.parse('@daily')),'в 00:00');
 assert.equal(cron.describe(cron.parse('*/5 * * * *')),'каждые 5 мин');
 assert.equal(cron.describe(cron.parse('0 3 1 * *')),'в 03:00 1-го числа');
 assert.equal(cron.describe(cron.parse('0 10 * jan,dec sun')),'в 10:00 в воскресенье в январе, декабре');
 const from=new Date(2026,10,8,22,40);// Sunday 8 Nov 2026, 22:40
 assert.deepEqual(cron.next(cron.parse('30 9 * * 1-5'),from,3).map(d=>[d.getDate(),d.getHours(),d.getMinutes()]),[[9,9,30],[10,9,30],[11,9,30]]);
 assert.deepEqual(cron.next(cron.parse('0 0 13 * 5'),new Date(2026,10,1),2).map(d=>d.getDate()),[6,13],'day of month OR weekday');
 assert.equal(cron.next(cron.parse('0 0 29 2 *'),from,1)[0].getFullYear(),2028,'leap day is found years ahead');
 assert.throws(()=>cron.parse('0 9 * *'),/5 полей/);assert.throws(()=>cron.parse('0 25 * * *'),/часы/);assert.throws(()=>cron.parse('0 0 9 * * *'),/6 полей/);
 assert.equal(cron.find('что значит */15 9-18 * * 1-5 в кроне?'),'*/15 9-18 * * 1-5');
 assert.equal(cron.find('крон @hourly'),'@hourly');assert.equal(cron.find('просто текст про крон'),null);
 // Regex: literal, backticks, samples, matches with positions and groups.
 assert.deepEqual(regex.extract('проверь /^(\\d{3})-\\d{2}$/i на строках'),{pattern:'^(\\d{3})-\\d{2}$',flags:'i'});
 assert.deepEqual(regex.extract('объясни регулярку `\\bfoo\\b`'),{pattern:'\\bfoo\\b',flags:''});
 assert.equal(regex.extract('напиши регулярку для email'),null);
 assert.deepEqual(regex.samples('проверь /x/ на строках: «123-45», «12-345»'),['123-45','12-345']);
 assert.deepEqual(regex.samples('проверь на строках:\n- abc\n- 42'),['abc','42']);
 const rows=regex.test('(\\d)+','',['a12b','none']);
 assert.equal(rows[0].matches[0].text,'12');assert.equal(rows[0].matches[0].index,1);assert.deepEqual(rows[0].matches[0].groups,['2']);assert.equal(rows[1].matches.length,0);
 assert.throws(()=>regex.test('(a+)+$','',['a'.repeat(40)+'!'],{timeout:50}),/катастрофическ/,'catastrophic backtracking is stopped');
 assert.throws(()=>regex.compile('(abc'),/не компилируется/);
 assert.equal(regex.risky('(a+)+'),true);assert.equal(regex.risky('a+b*'),false);
 // Chat turns: not added → no answer here (the offer handles it); added → card data.
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];
 const s={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options){const body=JSON.parse(options.body);const next=model.shift();assert.ok(next,'unexpected model call: '+body.messages.at(-1).content);return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}};
 assert.equal(await app.turn(s,'объясни регулярку /^a$/'),null,'not added: nothing here');
 s.settings['extension_regex-cron']='true';
 assert.equal(await app.turn(s,'регулярно созваниваемся по понедельникам'),null,'«регулярно» is not about regex');
 const tested=await app.turn(s,'проверь регулярку /^\\d{3}-\\d{2}$/ на строках: «123-45», «12-345»');
 assert.equal(tested.text,'Совпадает 1 из 2 строк.');
 assert.equal(topic.messages.at(-1).extensionData.regexCard.rows[0].matches[0].text,'123-45');
 assert.equal(topic.messages.at(-1).by,'Регулярки и cron');
 model=[{summary:'Три цифры в начале строки.',parts:[{part:'^',meaning:'начало строки'},{part:'\\d{3}',meaning:'три цифры'},{part:'(?<x>',meaning:'выдумано'}]}];
 const explained=await app.turn(s,'объясни регулярку /^\\d{3}/');
 assert.deepEqual(explained.extensionData.regexCard.parts.map(p=>p.part),['^','\\d{3}'],'invented parts are dropped');
 // Drafting: a first draft that fails its own examples is retried with the failures.
 model=[{pattern:'\\d+',flags:'',explanation:'числа',shouldMatch:['12'],shouldNotMatch:['a1']},
  body=>{assert.match(body.messages.at(-1).content,/ошибся на: a1/);return {pattern:'^\\d+$',flags:'',explanation:'только цифры',shouldMatch:['12','7'],shouldNotMatch:['a1','']};}];
 const drafted=await app.turn(s,'напиши регулярку, которая ловит только цифры');
 assert.match(drafted.text,/^Составил и проверил на примерах: \/\^\\d\+\$\//);assert.equal(drafted.extensionData.regexCard.verified,true);
 // Cron in the chat: parsed by code; drafted by the model only when no expression is given, then checked.
 const explainedCron=await app.turn(s,'что значит cron 30 9 * * 1-5');
 assert.equal(explainedCron.text,'«30 9 * * 1-5» — в 09:30 по будням.');assert.equal(explainedCron.extensionData.cronCard.runs.length,5);
 model=[{expression:'0 10 * * 6,0'}];
 const draftCron=await app.turn(s,'составь крон: по выходным в 10 утра');
 assert.equal(draftCron.text,'Составил: 0 10 * * 6,0 — в 10:00 по выходным.');
 model=[{expression:'0 10 * *'}];
 const broken=await app.turn(s,'составь cron на каждое утро');
 assert.equal(broken.error,true);assert.match(broken.text,/5 полей/,'a wrong drafted expression is reported, not shown as valid');
 // Without a model: testing still works, drafting says what is missing.
 s.settings.model='';
 assert.match((await app.turn(s,'напиши регулярку для email')).text,/выберите локальную модель/);
 assert.equal((await app.turn(s,'проверь регулярку `a+` на строках: «aa»')).text,'Совпадает 1 из 1 строки.');
 console.log('Regex and cron: cron fields/aliases/OR days/next runs, safe regex tests with timeout, invented parts dropped, verified drafts with retry, offer gate passed');
})().catch(e=>{console.error(e);process.exit(1);});
