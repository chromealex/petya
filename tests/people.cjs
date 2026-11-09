// People records foundation: one record per «Команда» member (no second list), typed absences with dedupe and limits,
// people sources (ready, added, failing, unknown people, the calendar switch) merged with typed ones, 1:1 notes and
// follow-ups, a Jira account added to a card later does not orphan the record, drafts, encryption at rest, file modes,
// wipe of notes only and of everything, the chat phrase parser (incl. a weekday and a day off) and the calendar app's
// source over a stubbed Google Calendar (title names, out-of-office event type, the user's own event). Fake clock.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const people=require('../src/features/people.cjs');
const text=require('../src/people/text.cjs');
const NOW=new Date('2026-11-09T10:00:00Z').getTime();
const TEAM=[{name:'Маша Петрова',aliases:'Маша',role:'Клиент',email:'masha@studio.com'},{name:'Олег Смирнов',aliases:'Олег',role:'Сервер',jiraId:'u-oleg',email:'oleg@studio.com',birthday:'1990-11-20'},{name:'Олег Кузнецов',role:'QA'},{name:'Иван Козлов',aliases:'Ваня',email:'ivan@studio.com'}];
const dirs=[];process.on('exit',()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'petya-people-'));dirs.push(d);return d;};

(async()=>{
 // --- The phrase parser and names ------------------------------------------------------------------------------------
 const now=new Date(NOW);
 assert.deepEqual(text.parseNote('Маша в отпуске с 10 по 20',now),{who:'Маша',from:'2026-11-10',to:'2026-11-20',kind:'vacation'});
 assert.deepEqual(text.parseNote('Ваня взял отгул в пятницу',now),{who:'Ваня',from:'2026-11-13',to:'2026-11-13',kind:'dayoff'});
 assert.equal(text.parseNote('Олег на больничном до 20-го',now).kind,'sick');
 assert.equal(text.parseNote('отпуск в Турции',now),null);assert.equal(text.parseNote('Маша в отпуске',now),null);
 assert.equal(text.member('Маши',TEAM).name,'Маша Петрова');
 assert.equal(text.member('Олегу',TEAM),null,'two Олегов: no guess');
 assert.deepEqual(text.mentioned('подготовь 1:1 с Олегом',TEAM).many.map(m=>m.name),['Олег Смирнов','Олег Кузнецов']);
 assert.equal(text.mentioned('подготовь 1:1 с Олегом Смирновым',TEAM).member.name,'Олег Смирнов');
 assert.equal(text.mentioned('что я обещал маме',TEAM),null);

 // --- Records -------------------------------------------------------------------------------------------------------
 const dir=tmp();let clock=NOW;
 const settings={teamMembers:JSON.stringify(TEAM),extension_calendar:'true'};
 let failing=false;const asked=[];
 const sources=()=>[
  {id:'calendar',name:'Календарь',setting:'extension_calendar',source:{ready:()=>true,absences:async(s,q)=>{asked.push(q);return [{member:'u-oleg',from:'2026-11-16',to:'2026-11-20',kind:'vacation',title:'Отпуск Олег'},{email:'IVAN@studio.com',from:'2026-11-12',to:'2026-11-12',kind:'sick'},{name:'Пётр',from:'2026-11-12',to:'2026-11-12'},{member:'u-oleg',from:'bad',to:'2026-11-12'}];}}},
  {id:'hr',name:'HR',setting:'extension_hr',source:{ready:()=>true,absences:async()=>{throw Error('нет доступа');}}},
  {id:'off',name:'Не готов',setting:'',source:{ready:()=>false,absences:async()=>{throw Error('не должен вызываться');}}}];
 const crypt={encrypt:v=>Buffer.from(Buffer.from(v,'utf8').toString('base64').split('').reverse().join('')),decrypt:b=>Buffer.from(b.toString().split('').reverse().join(''),'base64').toString('utf8')};
 const s={settings,dataRoot:dir};
 const p=people.create(s,{now:()=>clock,dir,sources,crypt});
 assert.deepEqual(p.members().map(m=>m.key),['masha@studio.com','u-oleg','Олег Кузнецов','ivan@studio.com'],'the keys come from «Команда»');
 assert.equal(p.status().people,0);
 assert.throws(()=>p.addAbsence('Пётр',{from:'2026-11-10',to:'2026-11-11'}),/нет в «Команде»/);
 assert.throws(()=>p.addAbsence('masha@studio.com',{from:'2026-11-20',to:'2026-11-10'}),/даты/);
 assert.throws(()=>p.addAbsence('masha@studio.com',{from:'2026-11-10',to:'2027-05-10'}),/120 дней/);
 const a=p.addAbsence('masha@studio.com',{from:'2026-11-10',to:'2026-11-20',kind:'vacation',note:'Маша в отпуске с 10 по 20',draft:'draft-1'});
 assert.equal(a.name,'Маша Петрова');assert.equal(p.addAbsence('masha@studio.com',{from:'2026-11-10',to:'2026-11-20'}).existed,true,'the same days are not stored twice');
 assert.equal(p.draft('draft-1'),true);assert.equal(p.draft('draft-2'),false);
 // Stored + sources; the calendar row for Иван by email, unknown people and broken dates dropped, a failing source reported.
 const r=await p.absences({from:'2026-11-09',to:'2026-11-22'});
 assert.deepEqual(r.rows.map(x=>[x.name,x.from,x.to,x.source,x.removable]),[['Маша Петрова','2026-11-10','2026-11-20','chat',true],['Иван Козлов','2026-11-12','2026-11-12','calendar',false],['Олег Смирнов','2026-11-16','2026-11-20','calendar',false]]);
 assert.deepEqual(r.notes,[],'the HR source is not added');
 settings.extension_hr='true';
 assert.match((await p.absences({from:'2026-11-09'})).notes[0],/^HR: нет доступа/);
 assert.equal(asked.at(-1).to.toISOString(),'2026-11-23T00:00:00.000Z','without «to» two weeks are read');
 settings.peopleCalendar='false';
 assert.deepEqual((await p.absences({from:'2026-11-09',to:'2026-11-22'})).rows.map(x=>x.source),['chat'],'the calendar switch');
 delete settings.peopleCalendar;delete settings.extension_hr;
 assert.deepEqual((await p.absences({from:'2026-11-09',key:'u-oleg'})).rows.map(x=>x.name),['Олег Смирнов']);
 await assert.rejects(p.absences({from:'9 ноября'}),/период/);
 // Remove and restore (the card's «Отменить»).
 const removed=p.removeAbsence('masha@studio.com',a.id);assert.equal(p.stored().length,0);
 assert.throws(()=>p.removeAbsence('masha@studio.com',a.id),/уже удалена/);
 p.restoreAbsence('masha@studio.com',removed);assert.equal(p.stored().length,1);

 // --- 1:1 notes and follow-ups -------------------------------------------------------------------------------------
 const saved=p.addNote('u-oleg',{text:'Обсудили SDK. Я обещал выбить бюджет.',date:'2026-11-09',followups:[{text:'Выбить бюджет',owner:'me',due:'2026-11-13'},{text:'Ревью архитектуры',owner:'them',due:'bad'},{text:'  ',owner:'me'}],draft:'note-1'});
 assert.equal(saved.followups.length,2);assert.equal(saved.followups[1].due,'');
 assert.throws(()=>p.addNote('u-oleg',{text:'x',draft:'note-1'}),/уже сохранены/);
 assert.throws(()=>p.addNote('u-oleg',{text:'  '}),/Пустая/);
 clock+=86400000;p.addNote('u-oleg',{text:'Короткий синк',date:'2026-11-10'});
 assert.deepEqual(p.notes('u-oleg').map(n=>n.date),['2026-11-10','2026-11-09'],'newest first');
 assert.deepEqual(p.followups({owner:'me'}).map(f=>[f.name,f.text]),[['Олег Смирнов','Выбить бюджет']]);
 const done=p.setFollowup('u-oleg',saved.followups[0].id,true);assert.equal(done.done,true);assert.equal(done.doneAt,clock);
 assert.equal(p.followups({member:'u-oleg'}).length,1,'closed ones are not open');
 assert.equal(p.followups({member:'u-oleg',open:false}).length,2);
 // Birthdays from the card, anniversaries from the record.
 p.setAnniversary('Иван Козлов','2024-03-01');
 assert.deepEqual(p.dates().map(d=>[d.name,d.birthday,d.anniversary]),[['Олег Смирнов','1990-11-20',''],['Иван Козлов','','2024-03-01']]);
 assert.throws(()=>p.setAnniversary('Иван Козлов','1 марта'),/ГГГГ/);

 // --- A Jira account added to Маша's card later keeps her record -------------------------------------------------------
 settings.teamMembers=JSON.stringify(TEAM.map(m=>m.name==='Маша Петрова'?{...m,jiraId:'u-masha'}:m));
 assert.deepEqual(p.stored().map(x=>[x.member,x.name]),[['u-masha','Маша Петрова']]);
 p.addAbsence('u-masha',{from:'2026-12-01',to:'2026-12-02',kind:'dayoff'});
 assert.equal(p.stored().length,2);assert.equal(Object.keys(JSON.parse(crypt.decrypt(Buffer.from(fs.readFileSync(path.join(dir,'people.json'),'utf8').slice(4),'base64'))).people).filter(k=>/masha/.test(k)).length,1,'one record, re-keyed');

 // --- At rest: encrypted, private file modes; nothing outside the folder -----------------------------------------------
 const file=fs.readFileSync(path.join(dir,'people.json'),'utf8');
 assert.ok(file.startsWith('enc:'));for(const word of ['Маша','бюджет','Олег','SDK'])assert.ok(!file.includes(word),word);
 if(process.platform!=='win32'){assert.equal(fs.statSync(path.join(dir,'people.json')).mode&0o777,0o600);assert.equal(fs.statSync(dir).mode&0o777,0o700);}
 const st=p.status();assert.deepEqual([st.people,st.absences,st.notes,st.followups,st.encrypted],[3,2,2,2,true]);
 assert.deepEqual(st.sources.map(x=>x.id),['calendar']);
 // The team context the model sees never carries notes.
 assert.ok(!require('../src/team.cjs').context(settings,'Олег').includes('бюджет'));
 // Without the keychain the encrypted file is unreadable (empty), not an error.
 assert.equal(people.create(s,{now:()=>clock,dir,sources}).status().people,0);
 // Wipe notes only, then everything.
 p.wipe('notes');assert.deepEqual([p.status().notes,p.status().followups,p.status().absences],[0,0,2]);
 assert.throws(()=>p.wipe('x'),/Некорректная/);
 p.wipe();assert.equal(fs.existsSync(dir),false);assert.equal(p.status().people,0);
 // Without a company folder nothing is written.
 assert.throws(()=>people.create({settings},{dir:()=>''}).addAbsence('ivan@studio.com',{from:'2026-11-10',to:'2026-11-10'}),/Нет папки/);
 // Settings validation and the registry kind.
 assert.throws(()=>people.validate({peopleCalendar:'yes'}),/peopleCalendar/);
 assert.ok(require('../src/features/app-links.cjs').REGISTRIES.includes('people-source'));
 assert.deepEqual(people.load().map(x=>x.id),['calendar'],'the calendar app provides the first people source');

 // --- The calendar app's source over a stubbed Google Calendar ------------------------------------------------------
 const source=require('../src/extensions/calendar/people-source.cjs');
 const calSettings={extension_calendar:'true',gmailCredential:JSON.stringify({accounts:[{id:'a1',email:'lead@studio.com',tokens:{scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'}}]})};
 assert.equal(source.ready(calSettings),true);assert.equal(source.ready({extension_calendar:'true'}),false);
 const members=TEAM.concat({name:'Я Руководитель',email:'lead@studio.com'}).map(m=>({...m,key:text.memberKey(m)}));
 const fetcher=async url=>{assert.match(url,/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/);return {ok:true,json:async()=>({items:[
  {id:'e1',summary:'Отпуск Маша',start:{date:'2026-11-16'},end:{date:'2026-11-21'}},
  {id:'e2',summary:'Не на месте',eventType:'outOfOffice',start:{dateTime:'2026-11-12T00:00:00Z'},end:{dateTime:'2026-11-12T23:59:00Z'},organizer:{email:'ivan@studio.com'}},
  {id:'e3',summary:'Больничный',start:{date:'2026-11-11'},end:{date:'2026-11-12'},organizer:{email:'lead@studio.com',self:true}},
  {id:'e4',summary:'Планирование',start:{dateTime:'2026-11-10T10:00:00Z'},end:{dateTime:'2026-11-10T11:00:00Z'}},
  {id:'e5',summary:'Отпуск',start:{date:'2026-11-18'},end:{date:'2026-11-19'},attendees:[{email:'lead@studio.com',self:true,responseStatus:'declined'}]}]})};};
 const rows=await source.absences({settings:calSettings,mailAccounts:{google:{client:()=>({access:async()=>'g-token'})}}},{from:new Date('2026-11-09'),to:new Date('2026-11-23'),members,fetcher});
 assert.deepEqual(rows.map(x=>[x.member,x.from,x.to,x.kind]),[['lead@studio.com','2026-11-11','2026-11-11','sick'],['ivan@studio.com','2026-11-12','2026-11-12','vacation'],['masha@studio.com','2026-11-16','2026-11-20','vacation']]);
 await assert.rejects(source.absences({settings:calSettings},{from:new Date(),to:new Date(),members,fetcher}),/загружается/);
 console.log('People records: team keys, typed absences, sources merged and failing apart, calendar switch, 1:1 notes and follow-ups, re-keying, drafts, encryption, wipe, the phrase parser and the calendar source passed');
})().catch(e=>{console.error(e);process.exit(1);});
