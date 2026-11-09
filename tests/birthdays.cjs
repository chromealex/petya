// «Дни рождения»: answers about colleagues' birthdays only while added, near-misses go elsewhere, the one-time switch
// for teams that already keep birthdays, the person field declared by the app (not the core), the value kept in the
// person record without the app, and the morning note only while added.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/birthdays/feature.cjs');
const team=require('../src/team.cjs');
(async()=>{
 const members=[{name:'Маша Иванова',role:'QA',birthday:'1996-05-14'},{name:'Олег Петров',aliases:'Олежка',birthday:'--05-20'},{name:'Иван Сидоров',birthday:''}];
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{extension_birthdays:'true',teamMembers:JSON.stringify(members)},dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[]}}};
 // Upcoming dates from a fixed day.
 const up=app.upcoming(team.members(s.settings),new Date(2026,4,12,10));
 assert.deepEqual(up.map(p=>[p.name,p.days,p.age]),[['Маша Иванова',2,30],['Олег Петров',8,null]]);
 // Requests: near-misses return null.
 for(const t of ['напомни про день рождения Маши','придумай поздравление с днём рождения','какой ивент провести на Рождество','когда день рождения компании','день рождения','привет'])assert.equal(await app.turn(s,t),null,t);
 const list=await app.turn(s,'у кого день рождения в этом месяце?');assert.ok(list.handled);assert.match(list.text,/Маша Иванова/);
 const one=await app.turn(s,'Когда день рождения у Маши?');assert.match(one.text,/Маша Иванова/);assert.doesNotMatch(one.text,/Олег/);
 const alias=await app.turn(s,'когда у Олежки днюха');assert.match(alias.text,/Олег Петров/);
 assert.match((await app.turn(s,'когда день рождения у Ивана')).text,/не указан/);
 assert.match((await app.turn(s,'когда день рождения у Феди')).text,/Не нашёл/);
 // Not added: nothing.
 assert.equal(await app.turn({...s,settings:{...s.settings,extension_birthdays:'false'}},'у кого день рождения на этой неделе'),null);

 // The one-time switch: added where someone already has a birthday, not where nobody has one, never twice.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-bd-switch-'));
 const make=(dir,list)=>({smoke:true,dataRoot:dir,settings:{extension_birthdays:'false',teamMembers:JSON.stringify(list)},saveSettings(p){Object.assign(this.settings,p);},dialogue:{state:{topics:[],projects:[]},persist(){}}});
 const withDates=make(path.join(root,'a'),members);app.setup(withDates);assert.equal(withDates.settings.extension_birthdays,'true');
 const none=make(path.join(root,'b'),[{name:'Иван'}]);const service=app.setup(none).birthdays;assert.equal(none.settings.extension_birthdays,'false');
 assert.equal(service.run(new Date(2026,4,14,10)),null,'no morning note while not added');
 withDates.settings.extension_birthdays='false';require('../src/extension-cache.cjs').reset();app.setup(withDates);assert.equal(withDates.settings.extension_birthdays,'false','the switch happens once: a removal stays');
 fs.rmSync(root,{recursive:true,force:true});

 // The field is the app's (extension.json personFields), the core team page names no birthday.
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/extensions/birthdays/extension.json'),'utf8'));
 assert.deepEqual(d.ui.personFields.map(f=>[f.key,f.title]),[['birthday','День рождения']]);
 assert.equal(d.setting,'extension_birthdays');
 for(const file of ['src/ui/team.js','src/ui/ux-pass.css','src/ui/style.css','src/ui/person-fields.js','src/ui/extension-places.js'])
  assert.ok(!/birthday|рожден/i.test(fs.readFileSync(path.join(__dirname,'..',file),'utf8')),file+' has birthday logic or text');
 // The value stays in the person record (Slack fills it, «Люди» reads it), and apps' own fields round-trip.
 const saved=team.validate([{name:'Маша',birthday:'14.05.1996',fields:JSON.stringify({shoeSize:'38',name:'x',bad:{}})}])[0];
 assert.equal(saved.birthday,'1996-05-14');assert.deepEqual(saved.fields,{shoeSize:'38'});
 assert.equal(team.validate([{name:'Маша',fields:''}])[0].fields,undefined);
 // Offers: the app's own questions.
 const offers=require('../src/features/extension-offers.cjs');
 const offered=t=>offers.decide(offers.candidates(t,{offers:offers.load(),settings:{}}))?.one?.offer.id||null;
 assert.equal(offered('у кого день рождения на этой неделе'),'birthdays');
 assert.equal(offered('напомни про день рождения Ивана')==='birthdays',false);
 console.log('Birthdays: answers while added, near-misses, one-time switch, field declared by the app, value kept in the person record, offers passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
