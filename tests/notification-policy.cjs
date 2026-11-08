// Notification policy core (src/features/notification-policy.cjs): registration through `provides`, the strongest
// decision wins, broken policies never lose a notification, summaries go to the notification center, the sender's
// source reaches the policies (smart notifications about assignments), and the focus app's holding behaves exactly
// as before the migration (parity with the old gate on the same notifications and session states).
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../src/features/notification-policy.cjs');
const focusApp=require('../src/extensions/focus/feature.cjs');
const hold=require('../src/extensions/focus/hold.cjs');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-policy-'));
const dir=(name,json,files)=>{const d=path.join(tmp,'ext',name);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'extension.json'),JSON.stringify(json));for(const [f,code] of Object.entries(files))fs.writeFileSync(path.join(d,f),code);};

// --- Registration: the real focus app is a policy; a declared file must export decide() ---
const real=core.load();
assert.deepEqual(real.map(p=>p.id),['focus']);
assert.equal(real[0].setting,'extension_focus');
dir('quiet',{id:'quiet',name:'Тихие часы',setting:'extension_quiet',provides:{'notification-policy':'policy.cjs'}},{'policy.cjs':"module.exports={order:20,decide:()=>null};"});
dir('mute',{id:'mute',name:'Без звука',setting:'extension_mute',provides:{'notification-policy':'policy.cjs'}},{'policy.cjs':"module.exports={id:'mute-rules',order:5,decide:()=>null};"});
const loaded=core.load(path.join(tmp,'ext'));
assert.deepEqual(loaded.map(p=>p.id),['mute-rules','quiet'],'ordered by `order`, then id');
dir('broken',{id:'broken',setting:'extension_broken',provides:{'notification-policy':'policy.cjs'}},{'policy.cjs':"module.exports={accept(){}};"});
assert.throws(()=>core.load(path.join(tmp,'ext')),/Invalid notification policy broken\/policy\.cjs/);
fs.rmSync(path.join(tmp,'ext','broken'),{recursive:true});
dir('unknown',{id:'unknown',provides:{'notification-filter':'policy.cjs'}},{'policy.cjs':'module.exports={};'});
assert.throws(()=>core.load(path.join(tmp,'ext')),/Unknown capability notification-filter/);
fs.rmSync(path.join(tmp,'ext','unknown'),{recursive:true});

// --- Decisions: quiet hours summarize, a meeting holds, per-source mute summarizes; hold beats summarize ---
let hour=14,meeting=false;const kept=[];
const policy=(id,order,provider,setting='extension_'+id)=>({id,extension:id,setting,label:id,order,provider:{ready:st=>st[setting]==='true',...provider}});
const policies=[
 policy('mute',5,{decide:(s,n)=>n.source==='assignments'&&s.settings.muteAssignments==='true'&&!n.urgent?{action:'summarize',reason:'Поручения без звука'}:null}),
 policy('meeting',10,{decide:(s,n)=>meeting&&!n.urgent?{action:'hold',reason:'Идёт встреча'}:null,accept:(s,n)=>kept.push(n.body)}),
 policy('quiet',20,{decide:(s,n)=>(hour>=23||hour<8)&&!n.urgent?{action:'summarize',reason:'Тихие часы'}:null}),
 policy('thrower',30,{decide:()=>{throw Error('broken policy');}}),
 policy('no-accept',40,{decide:()=>({action:'hold'})}),
 policy('off',50,{decide:()=>({action:'hold'}),accept:()=>{throw Error('not added: never asked');}})
];
const sent=[];
const s={settings:{extension_mute:'true',extension_meeting:'true',extension_quiet:'true',extension_thrower:'true','extension_no-accept':'true',extension_off:'false',muteAssignments:'false'}};
const p=core.create(s,{policies,send:item=>sent.push(item),now:()=>1000});
const n=(body,extra={})=>({title:'Петя',body,...extra});
assert.equal(p.decide(n('Ответ готов.')).action,'deliver','no policy objects; a throwing one and one that cannot hold are ignored');
assert.equal(p.route(n('Ответ готов.')),false);
hour=23;
assert.deepEqual([p.decide(n('Ответ готов.')).action,p.decide(n('Ответ готов.')).policy],['summarize','quiet']);
assert.equal(p.decide(n('Не удалось проверить поручение')).action,'deliver','urgent passes quiet hours');
meeting=true;
const d=p.decide(n('Создана задача BW-12'));
assert.deepEqual([d.action,d.policy,d.reason],['hold','meeting','Идёт встреча'],'hold beats summarize');
assert.equal(p.route(n('Создана задача BW-12')),true);assert.deepEqual(kept,['Создана задача BW-12']);
meeting=false;
assert.equal(p.route(n('Ответ готов.')),true,'summarized: no system popup');
assert.equal(sent.at(-1).id,'notification-summary');assert.equal(sent.at(-1).busy,false);assert.match(sent.at(-1).text,/^1 · Ответ готов\.$/);
assert.equal(p.summary().length,1);assert.equal(p.summary()[0].policy,'quiet');
p.clear();assert.equal(p.summary().length,0);
// A policy whose accept fails: the notification is shown, never lost.
const lossy=core.create(s,{policies:[policy('meeting',1,{decide:()=>({action:'hold'}),accept:()=>{throw Error('disk full');}})],send(){}});
assert.equal(lossy.route(n('Создана задача BW-14')),false);
// A policy that is not ready (its switch off) is not asked.
s.settings.extension_meeting='false';meeting=true;hour=14;
assert.equal(p.decide(n('Создана задача BW-15')).action,'deliver');
s.settings.extension_meeting='true';meeting=false;

// --- The Notification wrapper and the sender's source (smart notifications about assignments) ---
const shown=[];
class FakeNotification{constructor(o){Object.assign(this,o);}show(){shown.push(this.body);}static isSupported(){return true;}}
assert.equal(core.install({Notification:FakeNotification},x=>p.route(x)),true);
s.settings.muteAssignments='true';
// Exactly what src/agents-setup.cjs does around the task monitor's notify.
const notify=text=>new FakeNotification({title:'Петя',body:text}).show();
core.tag({source:'assignments'},()=>notify('BW-12: исполнитель завершил работу. Результат — в разделе «Агенты».'));
notify('Создана задача BW-16');
assert.deepEqual(shown,['Создана задача BW-16'],'the assignment notice was summarized by its source, the other one shown');
assert.equal(p.summary()[0].source,'assignments');
assert.equal(p.decide(n('x',{petyaSource:'assignments'})).action,'summarize');
core.tag({source:'assignments'},()=>notify('BW-12: нужно ваше решение. Результат — в разделе «Агенты».'));
assert.equal(shown.at(-1),'BW-12: нужно ваше решение. Результат — в разделе «Агенты».','a decision needed is urgent: shown even when muted');
assert.equal(core.describe(new FakeNotification({body:'y'})).source,'petya','no tag → petya');
s.settings.muteAssignments='false';
// The focus app's old module still installs the same single wrapper (replacing the gate).
assert.equal(hold.install({Notification:FakeNotification},()=>true),true);
notify('held by the replaced gate');assert.notEqual(shown.at(-1),'held by the replaced gate');
assert.equal(hold.urgent,core.urgent);

// --- Focus parity: the policy decides exactly what the old gate decided ---
// The old gate (before the migration), verbatim in behaviour: hold when a focus session (not a break) is active and
// the notification is not urgent by the old rule.
const OLD=/нужн\p{L}*\s+(?:ваш\p{L}*\s+)?(?:решени|ответ|внимани|уточн)|требу\p{L}*|ошибк|не\s+удалось|не\s+получилось|сбой|упал|упала|срочн|уточни|ответьте|подтверд|ждёт\s+ответа|ждет\s+ответа|вопрос|встреч\p{L}*\s+(?:через|начина)|через\s+\d+\s+мин\p{L}*\s+встреч|напомина|напоминание/iu;
const oldUrgent=x=>!!x.petyaFocus||String(x.urgency||'')==='critical'||OLD.test(String(x.title||'')+' '+String(x.body||''));
const oldGate=(store,x)=>{const a=store.active;return !(!a||a.kind!=='focus'||oldUrgent(x));};
let clock=Date.parse('2026-11-09T07:00:00Z');
const fs2={dataRoot:fs.mkdtempSync(path.join(os.tmpdir(),'petya-focus-parity-')),settings:{extension_focus:'true'},smoke:true,win:null};
const e=focusApp.engine(fs2,{now:()=>clock});
const policyCore=core.create(fs2,{send(){}});
const samples=[n('Ответ готов.'),n('Создана задача BW-12'),n('BW-12: нужно ваше решение.'),n('Не удалось проверить поручение'),n('Ошибка сборки'),n('Через 5 мин встреча «Daily»'),
 n('Напоминание: позвонить'),n('Есть вопрос по билду'),n('Фокус завершён',{petyaFocus:true}),n('Обычное',{urgency:'critical'}),n('Обычное',{urgency:'low'}),n('Срочно посмотрите'),n('Сводка готова')];
const states={
 none:()=>{},
 focus:()=>e.store.start({minutes:25,label:'карта'},clock),
 paused:()=>e.store.pause(clock),
 resumed:()=>e.store.resume(clock),
 break:()=>{e.store.stop(clock);e.store.takeBreak(5,clock);},
 after:()=>{e.store.stop(clock);}
};
for(const [name,enter] of Object.entries(states)){
 enter();clock+=60000;
 for(const x of samples){
  const before=e.store.held.length;
  const expected=oldGate(e.store,x);
  const held=policyCore.route(new FakeNotification(x));
  assert.equal(held,expected,name+': «'+x.body+'»');
  assert.equal(e.store.held.length-before,expected?1:0,name+': kept by the session');
  if(expected)assert.deepEqual(e.store.held.at(-1),{title:x.title,body:x.body,at:clock});
 }
}
// As before the migration, a running session holds even if the app was switched off meanwhile (it still ends normally).
fs2.settings.extension_focus='false';e.store.start({minutes:25},clock);
assert.equal(policyCore.decide(n('Ответ готов.')).action,'hold');
fs2.settings.extension_focus='true';
assert.deepEqual([policyCore.decide(n('Ответ готов.')).action,policyCore.decide(n('Ответ готов.')).policy],['hold','focus']);
e.store.stop(clock);
fs.rmSync(tmp,{recursive:true,force:true});fs.rmSync(fs2.dataRoot,{recursive:true,force:true});
console.log('Notification policy: registration and order, strongest decision, broken policies never lose a notification, summary item, sender source and smart notifications, focus holding parity passed');
