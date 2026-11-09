const assert=require('node:assert/strict');
const {Learning,duration}=require('../src/learning.cjs');
let now=100000,saved;const make=state=>new Learning({state,now:()=>now,save:s=>saved=structuredClone(s)});
const l=make();assert.deepEqual(l.list().skills,[]);
// A learned command runs its filled-in text as a chat request of its own (an added app may answer it).
const skill=l.put({name:'Таймер',action:'command',patterns:['таймер на {delay} — {message}','через {delay} сообщи: {message}'],output:'Сделай через {delay}: {message}'});
assert.equal(l.preview('Таймер на две минуты — проверить почту!').output,'Сделай через две минуты: проверить почту');
assert.equal(l.execute('почему таймер на две минуты — проверить почту'),null);
assert.deepEqual(l.execute('таймер на две минуты — проверить почту'),{command:'Сделай через две минуты: проверить почту'});
assert.equal(saved.reminders,undefined,'Petya keeps no reminders of its own');
l.put({...skill,enabled:false});assert.equal(l.execute('таймер на 2 минуты — проверить почту'),null);
l.put({...skill,enabled:true});l.put({name:'Дубль',action:'command',patterns:skill.patterns,output:'x'});assert.equal(l.execute('таймер на 2 минуты — проверить почту').error,true);
assert.equal(duration('1 час и 20 минут'),4800000);assert.equal(duration('полчаса'),1800000);assert.equal(duration('0 секунд'),null);assert.equal(duration('366 дней'),null);assert.equal(duration('2 минуты потом'),null);
assert.throws(()=>l.put({name:'Все',action:'answer',patterns:['{query}'],output:'ok'}));
assert.throws(()=>l.put({name:'Код',action:'shell',patterns:['test'],output:'rm'}));
assert.throws(()=>l.put({name:'Пусто',action:'command',patterns:['test {delay}']}),/Укажите текст/);
assert.throws(()=>l.put({name:'Старое',action:'reminder',patterns:['test {delay} {message}'],output:'x'}),/действие/,'the old core action is gone');
// An app's action ("<app>:<action>", src/voice-actions.cjs): the filled-in output goes to the app; the old core ids are gone.
const reads=make();reads.put({name:'Проверка',action:'jira:bugs',patterns:['статус {query}'],output:'сколько багов в {query}'});assert.deepEqual(reads.execute('статус TEST'),{action:'jira:bugs',output:'сколько багов в TEST',slots:{query:'TEST'}});
for(const old of ['bugs','anr'])assert.throws(()=>make().put({name:'Старое',action:old,patterns:['x {query}'],output:'x {query}'}),/действие/,'«'+old+'» is an app action now');
reads.put({name:'Ответ',action:'answer',patterns:['кто такой {query}'],output:'Спросите про {query} у команды'});assert.equal(reads.execute('кто такой Петя').text,'Спросите про Петя у команды');
const fail=new Learning({save:()=>{throw new Error('disk full');}});assert.throws(()=>fail.put(skill));assert.equal(fail.list().skills.length,0);

// Fields Petya no longer owns (an older state) stay untouched until an app takes them, once, with their undo entries.
const old=make({version:1,skills:[{id:'s1',name:'Старый таймер',action:'reminder',patterns:['через {delay} сообщи: {message}'],output:'',enabled:true}],reminders:[{id:'r1',text:'Тест',due:now+60000,state:'pending'}],undoLog:[{id:'u1',at:now,collection:'reminders',itemId:'r1',label:'x',before:null,after:{id:'r1'}}]});
assert.equal(old.take('skills'),undefined,'own fields are never handed out');assert.equal(old.take('nothing'),undefined);
assert.deepEqual(old.take('reminders'),[{id:'r1',text:'Тест',due:now+60000,state:'pending'}]);
assert.equal(old.list().reminders,undefined);assert.equal(old.undoInfo(),null,'undo entries of the taken field are gone');assert.equal(old.take('reminders'),undefined,'only once');
// An app rewrites a learned command in place: same id, valid action, its growth kept, no undo entry.
const xp=old.growth().xp;const rewritten=old.replaceSkill('s1',{action:'command',output:'Напомни через {delay}: {message}'});
assert.equal(rewritten.id,'s1');assert.deepEqual(old.execute('через 5 минут сообщи: чай'),{command:'Напомни через 5 минут: чай'});
assert.equal(old.growth().xp,xp);assert.equal(old.undoInfo(),null);assert.equal(old.replaceSkill('missing',{}),null);
// Undo of an entry whose collection is gone is refused, not a crash.
const stale=make({version:1,skills:[],undoLog:[{id:'u2',at:now,collection:'gone',itemId:'x',label:'x',before:null,after:{id:'x'}}]});
assert.throws(()=>stale.undo('u2'),/нельзя отменить/);
console.log('Learning: commands, previews, take and replaceSkill for apps that took over a kind of data passed');
