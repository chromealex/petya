const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Learning}=require('../src/learning.cjs');
const {MailRules:MailSkill,store,validate,defaults}=require('../src/extensions/mail/rules.cjs');
const {Gmail,clientConfig}=require('../src/extensions/mail/gmail.cjs');
(async()=>{
 // The rules are the «Почта» app's own file (rules.json), not Petya's learned-skills state.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-mail-rules-')),file=path.join(dir,'rules.json');let reads=0;
 const skill=new MailSkill({store:store(file),gmail:{read:async()=>{reads++;return {at:Date.now(),messages:[{from:'Polina',subject:'Release',text:'Check tomorrow'}],partial:true};}},model:async(system,data,format)=>format?({...defaults,days:7,priority:['Полина'],unsupported:''}):'Polina — Release: проверить завтра.'});
 assert.throws(()=>validate({...defaults,days:0}));assert.throws(()=>validate({...defaults,priority:['']}));
 assert.match((await skill.turn('Научись проверять почту')).text,/Какие/);assert.equal(reads,0);
 assert.match((await skill.turn('непрочитанные за три дня, Полина важная')).text,/3 дн/);
 assert.match((await skill.turn('сохрани')).text,/Сначала/);assert.equal(skill.list().length,0);
 assert.match((await skill.turn('попробуй')).text,/выборка/);assert.equal(reads,1);
 await skill.turn('сохрани');assert.equal(skill.list().length,1);assert.equal(skill.draft(),null);
 assert.equal(store(file).read().rules[0].days,3,'saved in the app file');assert.ok(Number.isFinite(skill.list()[0].at));
 await skill.turn('Что там в почте');assert.equal(reads,2);
 assert.equal(await skill.turn('не проверяй почту'),null);assert.equal(reads,2);
 skill.put({...skill.list()[0],enabled:false});await skill.turn('Что там в почте');assert.equal(reads,2);
 const removed=skill.remove(skill.list()[0].id);assert.equal(skill.list().length,0);skill.restore(removed);assert.equal(skill.list()[0].enabled,false,'«Отменить» brings the rule back as it was');skill.put({...skill.list()[0],enabled:true});
 await skill.turn('Научись проверять почту');await skill.turn('отмени обучение');assert.equal(skill.draft(),null);
 assert.match((await skill.turn('Научись управлять телевизором')).text,/инструмент/);
 assert.throws(()=>clientConfig('{"web":{}}'));
 const client=clientConfig(JSON.stringify({installed:{client_id:'123.apps.googleusercontent.com',client_secret:'secret'}}));
 let state={client},opened='',enabled=true,calls=[];
 const gmail=new Gmail({load:()=>state,save:s=>state=s,enabled:()=>enabled,open:async u=>opened=u,fetcher:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>url.includes('/token')?{access_token:'test',refresh_token:'refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.readonly'}:url.endsWith('/profile')?{emailAddress:'first@gmail.com'}:url.includes('?q=')?{messages:[{id:'abc'}],nextPageToken:'next'}:{id:'abc',payload:{headers:[{name:'From',value:'Polina'},{name:'Subject',value:'Test'}],mimeType:'text/plain',body:{data:Buffer.from('body').toString('base64url')}}}};
 }});
 await gmail.start();const auth=new URL(opened);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('scope'),'https://www.googleapis.com/auth/gmail.readonly');
 const callback=auth.searchParams.get('redirect_uri');const bad=await fetch(callback+'?state=wrong&code=x');assert.equal(bad.status,400);assert.equal(calls.length,0);
 await fetch(callback+'?'+new URLSearchParams({state:auth.searchParams.get('state'),code:'test'}));assert.equal(state.tokens.refresh_token,'refresh');
 const data=await gmail.read({...defaults,priority:['polina']});assert.equal(data.messages[0].text,'body');assert.equal(data.messages[0].priority,true);assert.equal(data.partial,true);
 assert(calls.filter(c=>c.url.includes('gmail.googleapis')).every(c=>!c.options.method));
 enabled=false;await assert.rejects(()=>gmail.read(defaults),/Включите/);enabled=true;
 state.tokens.expiresAt=0;await gmail.access();assert.equal(state.tokens.access_token,'test');
 gmail.disconnect();assert.equal(state.tokens,undefined);await assert.rejects(()=>gmail.read(defaults),/Подключите/);
 // «Проверь почту» without a skill offers the standard one with buttons; declining opens the mail in the browser.
 {const M=MailSkill;let own=store(null);const browsed=[];
  const m=new M({store:own,gmail:{accounts:()=>[],read:async()=>({messages:[],at:Date.now()})},model:async()=>({}),browse:async c=>{browsed.push(c);return {handled:true,serviceBrowser:{}};}});
  const ask=await m.turn('Проверь почту').then(()=>null,e=>e);assert.equal(ask?.name,'InputRequired');assert.deepEqual(ask.spec.options,['Добавить и проверить','Открыть почту в браузере']);
  assert.match((await ask.resume('Добавить и проверить')).text,/Проверено/);assert.equal(m.list().length,1);
  own.write({version:1,rules:[],draft:null});const again=await m.turn('Проверь почту').then(()=>null,e=>e);assert.ok((await again.resume('Открыть почту в браузере')).serviceBrowser);assert.deepEqual(browsed,['Проверь почту']);assert.equal(m.list().length,0);}
 // Migration: the rules and the teaching draft Petya's core kept in the learned-skills state move into the app once;
 // nothing is lost, the growth points stay, and a rule that cannot move keeps the old state as it was.
 {const migrate=require('../src/extensions/mail/migrate.cjs').migrate,growthSource=require('../src/extensions/mail/growth-source.cjs');
  const rule={...validate({...defaults,id:'r1',name:'Входящие',phrases:['что в почте'],days:3,priority:['Полина']})},draft={recipe:validate({...defaults,id:'d1'}),tested:false};
  let state={version:1,skills:[],recipes:[rule],mailDraft:draft};const growth=require('../src/growth.cjs');
  // How the core recorded the rule before 0.16 (collection «recipes», 40 points).
  growth.initialize(state);state.growth.events.push({key:growth.key('recipes',growthSource.content(rule)),collection:'recipes',itemId:'r1',at:5,title:'Входящие',points:40,learned:'старый текст',previous:null,reason:'x',source:'Обучение работе с почтой'});
  const learning=new Learning({state,save:s=>{state=structuredClone(s);}});
  const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'petya-mail-migrate-')),f2=path.join(dir2,'rules.json');
  const m=new MailSkill({store:store(f2),gmail:{accounts:()=>[]},model:async()=>''});
  const result=migrate({learning},m);
  assert.deepEqual([result.moved,result.left.length,result.draft],[1,0,true]);
  assert.deepEqual(m.list().map(r=>[r.id,r.name,r.days,r.priority[0]]),[['r1','Входящие',3,'Полина']]);assert.equal(m.draft().recipe.id,'d1');
  assert.equal('recipes' in learning.list(),false);assert.equal('mailDraft' in learning.list(),false);assert.equal(store(f2).read().rules.length,1,'on disk before the old state let go');
  assert.equal(migrate({learning},m),null,'once');
  const extra=growthSource.items({mail:{rules:()=>m.list()}});
  const g=learning.growth(extra);assert.equal(g.xp,40,'the 40 points earned before the move stay');assert.deepEqual(g.events.map(e=>[e.at,e.active]),[[5,true]],'the same event, not a new one');
  assert.equal(learning.growth(growthSource.items({mail:{rules:()=>[]}})).xp,0,'without the app the rule does not count');
  // A broken write: nothing is taken from the old state.
  let kept={version:1,skills:[],recipes:[rule]};const l2=new Learning({state:kept,save:s=>{kept=structuredClone(s);}});
  const failing=new MailSkill({store:{read:()=>({version:1,rules:[],draft:null}),write(){throw Error('disk full');}},gmail:{},model:async()=>''});
  assert.throws(()=>migrate({learning:l2},failing),/disk full/);assert.equal(l2.list().recipes.length,1,'a failed write loses nothing');
  // A full store (20 rules) keeps the old state too.
  const full=new MailSkill({store:store(null),gmail:{},model:async()=>''});for(let i=0;i<20;i++)full.put({...defaults,name:'R'+i});
  assert.equal(migrate({learning:l2},full).left.length,1);assert.equal(l2.list().recipes.length,1);
  // The engine is gone from Petya's core.
  assert.equal(fs.existsSync(path.join(__dirname,'../src/mail-skill.cjs')),false);}
 console.log('Mail skills: teaching, persistence, undo, trial, read-only Gmail, OAuth state/PKCE, refresh and disconnect passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
