// Outgoing-message pipeline (src/features/outgoing.cjs): checks registered through `provides`, their order, the
// channel filter, timeouts and failures that never block sending, spans that must match the text, no silent
// edits (checks get a frozen copy, `review` returns the text unchanged, `apply` replaces only a span still there),
// and the Slack «Попроси команду» confirmation with findings: «Отправить» sends the exact text, «Применить правки»
// shows the edited text for a new confirmation, a check that hangs does not delay the confirmation past its budget.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const outgoing=require('../src/features/outgoing.cjs');

(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-outgoing-'));
 const dir=(name,json,files)=>{const d=path.join(tmp,name);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'extension.json'),JSON.stringify(json));for(const [f,code] of Object.entries(files))fs.writeFileSync(path.join(d,f),code);};

 // --- Registration ---
 assert.ok(outgoing.load().some(p=>p.id==='tone-check'),'the tone-check app is a registered check');
 dir('b-check',{id:'b-check',name:'Б',setting:'extension_b-check',provides:{'outgoing-check':'check.cjs'}},{'check.cjs':"module.exports={order:20,check:async()=>[]};"});
 dir('a-check',{id:'a-check',name:'А',setting:'extension_a-check',provides:{'outgoing-check':'check.cjs'}},{'check.cjs':"module.exports={id:'alpha',order:20,check:async()=>[]};"});
 dir('first',{id:'first',name:'Первая',provides:{'outgoing-check':'check.cjs'}},{'check.cjs':"module.exports={order:1,check:async()=>[]};"});
 assert.deepEqual(outgoing.load(tmp).map(p=>p.id),['first','alpha','b-check'],'by order, then id');
 dir('bad',{id:'bad',provides:{'outgoing-check':'check.cjs'}},{'check.cjs':"module.exports={ready:()=>true};"});
 assert.throws(()=>outgoing.load(tmp),/Invalid outgoing check bad\/check\.cjs/);
 fs.rmSync(tmp,{recursive:true,force:true});

 // --- Review: order, channel filter, readiness, spans, timeouts, failures ---
 const calls=[];
 const p=(id,order,provider,setting='extension_'+id)=>({id,extension:id,setting,name:id,order,provider});
 const text='СРОЧНО почините билд, как я уже говорил!!!';
 const providers=[
  p('caps',1,{check:async(s,d)=>{calls.push(['caps',d.channel.service]);return [{severity:'warning',span:{start:0,end:6,text:'СРОЧНО'},message:'Капслок',suggestion:'Срочно'}];}}),
  p('passive',2,{check:async(s,d)=>[
   {severity:'problem',span:{text:'как я уже говорил'},message:'Звучит как упрёк',suggestion:'напоминаю'},
   {severity:'loud',span:{start:40,end:43,text:'!!!'},message:'Много восклицательных знаков',suggestion:'.'},
   {severity:'info',span:{start:0,end:3,text:'nope'},message:'Не на месте',suggestion:'x'},
   {severity:'info',message:'  '},
   {severity:'info',message:'Сообщение без приветствия'},
   {severity:'info',message:'Сообщение без приветствия'}]}),
  p('mutate',3,{check:async(s,d)=>{try{d.text='hacked';}catch{}try{d.channel.audience='direct';}catch{}calls.push(['mutate',d.text,d.channel.audience]);return [];}}),
  p('slow',4,{timeoutMs:300,check:()=>new Promise(r=>setTimeout(()=>r([{message:'late'}]),5000).unref())}),
  p('broken',5,{check:async()=>{throw Error('model down');}}),
  p('junk',6,{check:async()=>'not a list'}),
  p('slack-only',7,{fits:c=>c.service==='slack',check:async()=>[{severity:'info',message:'Только для Slack'}]}),
  p('off',8,{check:async()=>[{message:'never'}]}),
  p('unready',9,{ready:()=>false,check:async()=>[{message:'never'}]})
 ];
 const settings=Object.fromEntries(providers.map(x=>['extension_'+x.id,'true']));settings.extension_off='false';
 const s={settings};
 let clock=0;
 const pipe=outgoing.create(s,{providers,now:()=>clock});
 const started=Date.now();
 const r=await pipe.review({text,channel:{service:'Discord',target:'#general',audience:'public'},context:{app:'Discord',fn:()=>1}});
 assert.ok(Date.now()-started<2000,'a hanging check is cut at its budget');
 assert.equal(r.text,text,'review returns the text it was given');
 assert.deepEqual(r.channel,{service:'discord',target:'#general',audience:'public'});
 assert.equal(r.language,'ru');
 assert.deepEqual(r.checked,['caps','passive','mutate']);
 assert.deepEqual(r.skipped.map(x=>[x.id,x.reason]),[['slow','timeout'],['broken','error'],['junk','error']]);
 assert.deepEqual(calls.find(c=>c[0]==='mutate'),['mutate',text,'public'],'checks get a frozen copy');
 assert.deepEqual(r.findings.map(f=>[f.provider,f.severity,f.span?.text??null,f.message,f.suggestion??null]),[
  ['caps','warning','СРОЧНО','Капслок','Срочно'],
  ['passive','problem','как я уже говорил','Звучит как упрёк','напоминаю'],
  ['passive','warning','!!!','Много восклицательных знаков','.'],
  ['passive','info',null,'Не на месте',null],
  ['passive','info',null,'Сообщение без приветствия',null]
 ],'ordered by check, then by place; a misplaced span loses its suggestion; empty and duplicate findings dropped');
 assert.equal(r.findings[1].span.start,text.indexOf('как я уже говорил'),'a span given by its text is placed');
 // The Slack-only check runs for Slack; unready and not-added ones never.
 const slack=await pipe.review({text,channel:{service:'slack',audience:'nonsense'}});
 assert.ok(slack.findings.some(f=>f.provider==='slack-only'));assert.equal(slack.channel.audience,'team');
 assert.ok(![...r.findings,...slack.findings].some(f=>f.message==='never'));
 assert.deepEqual((await pipe.review({text:'   ',channel:{service:'slack'}})).findings,[]);
 assert.equal(outgoing.language('Hello team, the build is red'),'en');

 // --- No silent edits: only a chosen suggestion changes the text, only where the span still is ---
 const [caps,passive,bang]=r.findings;
 assert.equal(outgoing.apply(text,caps),'Срочно почините билд, как я уже говорил!!!');
 assert.equal(outgoing.apply('Коллеги, '+text,caps),'Коллеги, Срочно почините билд, как я уже говорил!!!','moved but unique: found');
 assert.equal(outgoing.apply('Починили',caps),null,'span gone: nothing applied');
 assert.equal(outgoing.apply('СРОЧНО и СРОЧНО',{...caps,span:{start:20,end:26,text:'СРОЧНО'}}),null,'ambiguous: nothing applied');
 assert.throws(()=>outgoing.apply(text,r.findings[3]),/нет предложенной замены/);
 assert.equal(outgoing.apply(text,{suggestion:'Почините, пожалуйста, билд.',span:null}),'Почините, пожалуйста, билд.','a whole-text rewrite replaces all');
 const all=outgoing.applyAll(text,r.findings);
 assert.equal(all.text,'Срочно почините билд, напоминаю.');assert.deepEqual(all.applied,[caps.id,passive.id,bang.id]);
 assert.match(outgoing.confirmation(r),/^Проверка перед отправкой:\n• «СРОЧНО» — Капслок → «Срочно»/);
 assert.equal(outgoing.confirmation({findings:[]}),'');
 // Before the feature is set up the module-level review finds nothing and never throws.
 assert.deepEqual((await outgoing.review({text:'x'})).findings,[]);

 // --- Slack «Попроси команду»: the confirmation shows findings; nothing changes without the user ---
 const {SlackRequest}=require('../src/slack-request.cjs');
 const {InputRequired}=require('../src/input-required.cjs');
 const posted=[];
 const channels=[{id:'C1',name:'jw-bw-dev',is_member:true,is_private:false}];
 const request=async(url,options)=>{
  if(url.includes('conversations.list'))return {ok:true,channels,response_metadata:{next_cursor:''}};
  if(url.includes('chat.postMessage')){const body=JSON.parse(options.body);posted.push(body.text);return {ok:true,channel:'C1',ts:'1700000000.000100'};}
  return {ok:true};
 };
 let review=async d=>({text:d.text,findings:d.text.includes('СРОЧНО')?[{id:'caps:0',provider:'caps',severity:'warning',span:{start:d.text.indexOf('СРОЧНО'),end:d.text.indexOf('СРОЧНО')+6,text:'СРОЧНО'},message:'Капслок читается как крик',suggestion:'срочно'}]:[]});
 const seen=[];
 const make=()=>new SlackRequest({preview:true,state:{},save(){},settings:()=>({slackToken:'t'}),enabled:()=>true,request,
  context:()=>({id:'chat',projectId:'p',projectMemoryId:'m',projectChannels:[{id:'C1',name:'jw-bw-dev'}],hasSavedChannels:true}),
  review:d=>{seen.push(d);return review(d);},reply:(text,extra={})=>({handled:true,text,...extra})});
 const ask=async promise=>{try{await promise;}catch(e){if(e instanceof InputRequired)return e;throw e;}assert.fail('expected a confirmation');};
 let slackReq=make();
 let q=await ask(slackReq.turn('попроси #jw-bw-dev СРОЧНО посмотрите билд'));
 assert.match(q.spec.text,/^Отправить в #jw-bw-dev\?\nКоллеги, просьба: СРОЧНО посмотрите билд\n\nПроверка перед отправкой:\n• «СРОЧНО» — Капслок читается как крик → «срочно»$/);
 assert.deepEqual(q.spec.options,['Отправить','Применить правки','Отмена']);
 assert.deepEqual(seen.at(-1).channel,{service:'slack',target:'#jw-bw-dev',audience:'public'});
 assert.equal(posted.length,0,'nothing sent before the answer');
 // «Отправить» sends exactly the text the user saw.
 let done=await q.resume('Отправить');
 assert.deepEqual(posted,['Коллеги, просьба: СРОЧНО посмотрите билд']);assert.match(done.text,/^Отправил поручение в #jw-bw-dev/);
 // «Применить правки»: a new confirmation with the edited text; sent only after «Отправить».
 slackReq=make();
 q=await ask(slackReq.turn('попроси #jw-bw-dev СРОЧНО проверьте логи'));
 const edited=await ask(q.resume('Применить правки'));
 assert.equal(edited.spec.text,'Отправить в #jw-bw-dev?\nКоллеги, просьба: срочно проверьте логи');
 assert.deepEqual(edited.spec.options,['Отправить','Отмена']);
 assert.equal(posted.length,1,'applying is not sending');
 done=await edited.resume('Отправить');
 assert.equal(posted.at(-1),'Коллеги, просьба: срочно проверьте логи');
 // A review that fails or hangs never blocks the confirmation.
 review=async()=>{throw Error('down');};
 slackReq=make();
 q=await ask(slackReq.turn('попроси #jw-bw-dev глянуть тред'));
 assert.equal(q.spec.text,'Отправить в #jw-bw-dev?\nКоллеги, просьба: глянуть тред');assert.deepEqual(q.spec.options,['Отправить','Отмена']);
 review=()=>new Promise(()=>{});
 slackReq=make();slackReq.reviewBudget=200;
 const t0=Date.now();q=await ask(slackReq.turn('попроси #jw-bw-dev проверить сборку'));
 assert.ok(Date.now()-t0<1500,'confirmation shown within the review budget');
 assert.deepEqual(q.spec.options,['Отправить','Отмена']);
 console.log('Outgoing pipeline: registration and order, channel filter, timeouts and failures never block, spans, frozen drafts, no silent edits, Slack confirmation with findings and «Применить правки» passed');
})().catch(e=>{console.error(e);process.exit(1);});
