// «Проверка тона»: the rules (harsh words, passive aggression, ultimatums, shouting, «!!!», missing context for the
// audience, unclear text) by sensitivity; model suggestions with a stubbed model kept only when grounded (same
// facts, same language, not much longer); the outgoing check through the real pipeline (channels setting, not
// added, model budget); chat routing with near-misses; model-free behaviour; settings validation.
const assert=require('node:assert/strict');
const rules=require('../src/extensions/tone-check/rules.cjs');
const {grounded,soften}=require('../src/extensions/tone-check/soften.cjs');
const app=require('../src/extensions/tone-check/feature.cjs');
const offer=require('../src/extensions/tone-check/offer.cjs');
const outgoing=require('../src/features/outgoing.cjs');
const {InputRequired}=require('../src/input-required.cjs');

(async()=>{
 const kinds=(text,o)=>rules.findings(text,o).map(f=>[f.kind,f.severity,f.span?.text??null,f.suggestion??null]);
 // --- Rules ---
 assert.deepEqual(kinds('КТО ОПЯТЬ СЛОМАЛ БИЛД?!'),[['caps','problem','КТО ОПЯТЬ СЛОМАЛ БИЛД','Кто опять сломал билд'],['punctuation','info','?!','?']]);
 assert.deepEqual(kinds('Билд упал, СРОЧНО посмотрите'),[['caps','warning','СРОЧНО','срочно']]);
 assert.deepEqual(kinds('Проверьте API и SDK в QA, PR BW-123 готов, ASAP'),[],'acronyms and task keys are not shouting');
 assert.deepEqual(kinds('Как я уже говорил, ревью нужно до пятницы!!!'),[['passive','warning','Как я уже говорил','Напомню'],['punctuation','info','!!!','!']]);
 assert.deepEqual(kinds('Если до вечера не почините, иначе будем откатывать. Это не обсуждается'),[['ultimatum','problem','иначе будем',null],['ultimatum','problem','Это не обсуждается',null]]);
 assert.deepEqual(kinds('Что за бред вы написали в конфиге'),[['harsh','problem','бред',null]]);
 assert.deepEqual(kinds('Кто это сделал? Вы опять ничего не проверили'),[['harsh','problem','Кто это сделал',null],['harsh','problem','Вы опять ничего не проверили',null]]);
 assert.deepEqual(kinds('As I said, this is garbage'),[['passive','warning','As I said','To recap'],['harsh','problem','garbage',null]]);
 assert.deepEqual(kinds('Привет! Посмотри, пожалуйста, тред про релиз 1.4.2, когда будет минутка. Спасибо!'),[],'a polite message has no findings');
 // Sensitivity.
 const text='Как я уже говорил, СРОЧНО нужен фикс. Ужасно!!!';
 assert.deepEqual(kinds(text,{sensitivity:'low'}),[],'low: only harsh words, ultimatums and multi-word shouting');
 assert.deepEqual(kinds(text,{sensitivity:'medium'}).map(k=>k[0]),['passive','caps','harsh','punctuation']);
 assert.deepEqual(kinds('ЭТО НЕ РАБОТАЕТ',{sensitivity:'low'}).map(k=>k[0]),['caps']);
 // Audience: context and @channel matter for a public channel, internal task keys for a customer.
 assert.deepEqual(kinds('Как договорились, выкатываем',{audience:'team'}),[]);
 assert.deepEqual(kinds('Как договорились, выкатываем',{audience:'public'}).map(k=>[k[0],k[2]]),[['context','Как договорились']]);
 assert.deepEqual(kinds('@channel билд готов',{audience:'public'}).map(k=>[k[0],k[2]]),[['context','@channel']]);
 assert.deepEqual(kinds('Исправим в BW-123, спасибо за отзыв',{audience:'customer'}).map(k=>[k[0],k[2]]),[['context','BW-123']]);
 assert.deepEqual(kinds('Глянь',{audience:'public',sensitivity:'high'}).map(k=>[k[0],k[2]]),[['unclear',null]]);
 assert.deepEqual(kinds('Глянь',{audience:'public'}),[],'unclear only at high');
 const findings=rules.findings(text);for(const f of findings)assert.equal(text.slice(f.span.start,f.span.end),f.span.text,'spans point at real words');

 // --- Grounding ---
 assert.equal(grounded('иначе будем откатывать','если не успеем, откатим релиз','Если до вечера не почините, иначе будем откатывать','ru'),true);
 assert.equal(grounded('до 18:00','до вечера','Почините до 18:00','ru'),false,'a time must stay');
 assert.equal(grounded('бред','в релизе 2.0 это ошибка','Что за бред','ru'),false,'no new facts');
 assert.equal(grounded('бред','this is wrong','Что за бред','ru'),false,'same language');
 assert.equal(grounded('бред','бред','Что за бред','ru'),false,'must change something');
 assert.equal(grounded('бред','x'.repeat(200),'Что за бред','ru'),false,'not much longer');
 assert.equal(grounded('@oleg СРОЧНО','@oleg, посмотри, пожалуйста','@oleg СРОЧНО','ru'),true,'mentions kept');

 // --- Model suggestions with a stubbed model ---
 const asked=[];
 let answer={replacements:[],rewrite:''};
 const s={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434','extension_tone-check':'true',toneCheckSensitivity:'medium'},
  request:async(url,options)=>{asked.push(JSON.parse(options.body));if(typeof answer==='function')return answer();return {message:{content:JSON.stringify(answer)}};}};
 const draft='Если до 18:00 не почините, иначе будем откатывать. Что за бред в конфиге!!!';
 const fs=rules.findings(draft,{audience:'team'});
 answer={replacements:[{index:fs.findIndex(f=>f.span.text==='иначе будем'),replacement:'то, скорее всего, будем'},{index:fs.findIndex(f=>f.span.text==='бред'),replacement:'ошибка в версии 3'},{index:99,replacement:'x'}],rewrite:'Если до 18:00 не получится починить, будем откатывать. Похоже, в конфиге ошибка!'};
 const soft=await soften(s,{text:draft,findings:fs,audience:'team',rewrite:true});
 assert.deepEqual([...soft.suggestions.values()],['то, скорее всего, будем'],'the invented «версии 3» is dropped');
 assert.equal(soft.rewrite,'Если до 18:00 не получится починить, будем откатывать. Похоже, в конфиге ошибка!');
 const prompt=asked.at(-1);
 assert.equal(prompt.model,'qwen3:8b');assert.match(prompt.messages[0].content,/на том же языке \(ru\)/);
 assert.deepEqual(JSON.parse(prompt.messages[1].content).issues.map(i=>i.fragment),['иначе будем','бред'],'only findings without a mechanical fix go to the model');
 answer={replacements:[],rewrite:'Fix it by 18:00 please'};
 assert.equal((await soften(s,{text:draft,findings:fs,rewrite:true})).rewrite,'','a rewrite in another language is dropped');

 // --- The outgoing check through the real pipeline ---
 answer={replacements:[{index:0,replacement:'то, скорее всего, будем'}],rewrite:''};
 const pipe=outgoing.create(s);
 let r=await pipe.review({text:'Если до вечера не почините, иначе будем откатывать',channel:{service:'discord',target:'#general',audience:'public'}});
 assert.deepEqual(r.checked,['tone-check']);
 assert.deepEqual(r.findings.map(f=>[f.provider,f.severity,f.span.text,f.suggestion]),[['tone-check','problem','иначе будем','то, скорее всего, будем']]);
 assert.equal(outgoing.apply(r.text,r.findings[0]),'Если до вечера не почините, то, скорее всего, будем откатывать');
 // Channels setting: Discord off → not checked; unknown services count as «other».
 s.settings.toneCheckChannels='slack,mail';
 assert.deepEqual((await pipe.review({text:'СРОЧНО ВСЕ СЮДА',channel:{service:'discord'}})).checked,[]);
 assert.deepEqual((await pipe.review({text:'СРОЧНО ВСЕ СЮДА',channel:{service:'slack'}})).checked,['tone-check']);
 assert.deepEqual((await pipe.review({text:'СРОЧНО ВСЕ СЮДА',channel:{service:'telegram'}})).checked,[]);
 s.settings.toneCheckChannels='other';assert.deepEqual((await pipe.review({text:'СРОЧНО ВСЕ СЮДА',channel:{service:'telegram'}})).checked,['tone-check']);
 s.settings.toneCheckChannels='none';assert.deepEqual((await pipe.review({text:'СРОЧНО ВСЕ СЮДА',channel:{service:'slack'}})).checked,[]);
 delete s.settings.toneCheckChannels;
 // A slow model: the rules' findings arrive within the check's own budget, the mechanical suggestions stay.
 answer=()=>new Promise(()=>{});
 const t0=Date.now();
 r=await pipe.review({text:'КТО ОПЯТЬ СЛОМАЛ БИЛД, иначе будем откатывать',channel:{service:'slack',audience:'public'}});
 assert.ok(Date.now()-t0<5000,'model budget 3.5 s inside the 6 s check budget');
 assert.deepEqual(r.findings.map(f=>[f.span.text,f.suggestion??null]),[['КТО ОПЯТЬ СЛОМАЛ БИЛД','Кто опять сломал билд'],['иначе будем',null]]);
 // Not added → not asked.
 s.settings['extension_tone-check']='false';
 assert.deepEqual((await pipe.review({text:'КТО ОПЯТЬ СЛОМАЛ БИЛД',channel:{service:'slack'}})).checked,[]);

 // --- Chat turns ---
 const topic={id:'t',title:'Чат',messages:[]};
 const chat={settings:{'extension_tone-check':'false',model:''},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 assert.equal(await app.turn(chat,'как это звучит: СРОЧНО ПОЧИНИТЕ'),null,'not added: the offer handles it');
 assert.equal(offer.ready(chat.settings),false);
 chat.settings['extension_tone-check']='true';assert.equal(offer.ready(chat.settings),true);
 const near=['тон голоса Пети','поменяй тон голоса','проверь тон голоса','проверь орфографию в письме','проверь орфографию: превет','тонкий клиент','проверь тонкий клиент','как звучит голос Пети','какая тональность отзывов','что пишут в отзывах','отправь в Discord: сервер перезапустится','попроси команду проверить билд','как дела?','смягчи свет в сцене'];
 for(const t of near)assert.equal(await app.turn(chat,t),null,t);
 const yes={'как это звучит: СРОЧНО ПОЧИНИТЕ БИЛД':['check','СРОЧНО ПОЧИНИТЕ БИЛД'],'Петя, как звучит «Как я уже писал, нужен отчёт»?':['check','Как я уже писал, нужен отчёт'],
  'смягчи сообщение: кто это сделал?!':['soften','кто это сделал?!'],'сделай помягче: это бред':['soften','это бред'],'проверь тон: если не успеете, иначе будут последствия':['check','если не успеете, иначе будут последствия'],
  'не слишком резко: ревью нужно до пятницы, без вариантов':['check','ревью нужно до пятницы, без вариантов'],'как это звучит для канала: @channel релиз отложен':['check','@channel релиз отложен'],'перепиши помягче: Опять забыли обновить доку':['soften','Опять забыли обновить доку']};
 for(const [t,[mode,text]] of Object.entries(yes)){const w=app.parse(t);assert.equal(w?.mode,mode,t);assert.equal(w.text,text,t);}
 assert.equal(app.parse('как это звучит для канала: @channel релиз отложен').audience,'public');
 assert.equal(app.parse('проверь тон ответа игроку: исправим в BW-1').audience,'customer');
 // No model: the rules and the mechanical fixes still answer.
 let reply=await app.turn(chat,'как это звучит: КТО ОПЯТЬ СЛОМАЛ БИЛД?!');
 assert.equal(reply.by,'Проверка тона');
 assert.equal(reply.text,'Может прозвучать резко: капслок, много «!» — 2 замечания.');
 const card=reply.extensionData.toneCard;
 assert.equal(card.mode,'check');assert.equal(card.text,'КТО ОПЯТЬ СЛОМАЛ БИЛД?!');assert.equal(card.model,false);
 assert.deepEqual(card.findings.map(f=>f.suggestion),['Кто опять сломал билд','?']);
 reply=await app.turn(chat,'как это звучит: Привет! Посмотри, пожалуйста, тред про релиз.');
 assert.equal(reply.text,'Звучит спокойно и понятно — замечаний нет.');assert.deepEqual(reply.extensionData.toneCard.findings,[]);
 reply=await app.turn(chat,'смягчи сообщение: Вы опять ничего не проверили');
 assert.equal(reply.text,'Отметил, что смягчить. Для переписанного целиком варианта выберите локальную модель в настройках.');
 // With a model: «смягчи» writes the softer whole message (grounded).
 chat.settings.model='qwen3:8b';chat.settings.ollamaUrl='http://127.0.0.1:11434';
 chat.request=async()=>({message:{content:JSON.stringify({replacements:[{index:0,replacement:'Похоже, проверку пропустили'}],rewrite:'Похоже, проверку пропустили — давайте посмотрим вместе?'})}});
 reply=await app.turn(chat,'смягчи сообщение: Вы опять ничего не проверили');
 assert.equal(reply.text,'Мягче: Похоже, проверку пропустили — давайте посмотрим вместе?');
 assert.equal(reply.extensionData.toneCard.findings[0].suggestion,'Похоже, проверку пропустили');
 // No text: one question in the shared panel, then the check of the answer.
 let q;try{await app.turn(chat,'как это звучит?');}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.equal(q.spec.text,'Какое сообщение проверить? Вставьте текст.');
 chat.settings.model='';
 reply=await q.resume('Это не обсуждается');
 assert.equal(reply.extensionData.toneCard.text,'Это не обсуждается');assert.ok(reply.extensionData.toneCard.findings.some(f=>f.kind==='ultimatum'));
 try{await app.turn(chat,'смягчи сообщение');}catch(e){q=e;}assert.equal(q.spec.text,'Какое сообщение смягчить? Вставьте текст.');

 // --- Settings ---
 assert.doesNotThrow(()=>app.validate({toneCheckSensitivity:'high',toneCheckChannels:'slack,discord,other'}));
 assert.doesNotThrow(()=>app.validate({toneCheckChannels:'none'}));
 assert.throws(()=>app.validate({toneCheckSensitivity:'max'}),/чувствительность/);
 assert.throws(()=>app.validate({toneCheckChannels:'slack,fax'}),/каналов/);
 assert.equal(app.defaults['extension_tone-check'],'false');
 console.log('Tone check: rules by sensitivity and audience, grounded model suggestions, outgoing check with channels and model budget, chat routing with near-misses, model-free answers, settings passed');
})().catch(e=>{console.error(e);process.exit(1);});
