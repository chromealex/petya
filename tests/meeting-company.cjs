// A meeting is recorded in the company whose «Команда» has clearly the most of its participants
// (src/meeting-company.cjs): the switch happens before recording; no names, no match or a tie keeps the current one.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const mc=require('../src/meeting-company.cjs');
const {LocalMeeting}=require('../src/local-meeting.cjs');
(async()=>{
 const A={id:'default',name:'Студия',members:[{name:'Иван Петров',aliases:'Ваня'},{name:'Анна Смирнова',aliases:'Аня',email:'anna.s@studio.dev'},{name:'Олег'}]};
 const B={id:'b',name:'Агентство',members:[{name:'Мария Козлова',meetingName:'Maria K'},{name:'Олег Сидоров'},{name:'Павел'}]};
 // Matching: full names in any order, «Имя на встречах», email names, one-word first names only when unique.
 assert.equal(mc.match(['Петров Иван','Anna S'],[A,B]).id,'default');
 assert.deepEqual(mc.match(['Maria K','Павел','Иван Петров'],[A,B]).people,['Maria K','Павел']);
 assert.equal(mc.match(['Олег'],[A,B]),null,'one «Олег» in each company: a tie');
 assert.equal(mc.match(['Zoom user','Guest 1'],[A,B]),null,'nobody known');
 assert.equal(mc.match([],[A,B]),null);
 assert.equal(mc.match(['Иван (Host)','Аня'],[A,B]).id,'default','labels like (Host) are ignored');
 // Each company's team comes from its own settings file.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-mc-'));fs.mkdirSync(path.join(root,'companies','b'),{recursive:true});
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64'),decrypt=b=>Buffer.from(b,'base64').toString();
 fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({teamMembers:enc(A.members)}));
 fs.writeFileSync(path.join(root,'companies','b','settings.json'),JSON.stringify({teamMembers:enc(B.members)}));
 const companies={list:()=>({companies:[{id:'default',name:A.name},{id:'b',name:B.name}]}),directory:id=>id==='default'?root:path.join(root,'companies',id)};
 assert.equal(mc.teams(companies,decrypt)[1].members.length,3);
 // place(): another company's meeting switches to it before recording; there it is recorded with a note.
 const switched=[];let fail=null;
 const services=id=>({companyId:id,companies,switchCompany:async to=>{if(fail)throw Error(fail);switched.push(to);return {switching:true};}});
 mc.reset();
 assert.deepEqual(await mc.place(services('default'),{participants:['Maria K','Павел']},{decrypt}),{record:false});
 assert.deepEqual(switched,['b']);
 const there=await mc.place(services('b'),{participants:['Maria K','Павел']},{decrypt});
 assert.equal(there.record,true);assert.match(there.note,/Maria K, Павел — записываю в компанию «Агентство»/);
 assert.deepEqual(await mc.place(services('default'),{participants:['Maria K']},{decrypt}),{record:true,note:''},'asked again in the old company: no ping-pong');
 assert.equal(switched.length,1);
 // Our own people, nobody known, or one company only: recorded here without a switch.
 mc.reset();assert.equal((await mc.place(services('default'),{participants:['Иван Петров']},{decrypt})).record,true);
 mc.reset();assert.equal((await mc.place(services('default'),{participants:[]},{decrypt})).record,true);
 mc.reset();assert.equal((await mc.place({...services('default'),companies:{list:()=>({companies:[{id:'default'}]})}},{participants:['Maria K']},{decrypt})).record,true);
 assert.equal(switched.length,1);
 // A switch that is refused (a request still running): recorded here, saying why.
 mc.reset();fail='Дождитесь завершения запросов в чатах перед сменой компании.';
 const refused=await mc.place(services('default'),{participants:['Maria K','Павел']},{decrypt});
 assert.equal(refused.record,true);assert.match(refused.note,/«Агентство», но переключиться не удалось/);fail=null;
 // The decision lasts for one meeting: after it ends, the next meeting is placed again.
 mc.reset();assert.equal(mc._state(),null);
 // The recorder asks before offering or starting a recording, and does neither when another company takes it.
 const published=[];let started=0;
 const make=placed=>{const m=new LocalMeeting({settings:()=>({meetingAutoRecord:'auto'}),sources:{list:()=>[{id:'zoom'}],detect:async()=>({active:true,app:'Zoom',participants:['Maria K']})},recording:{},createCapture:()=>null,emit:s=>published.push(s.message),place:async()=>placed,ended:()=>{}});m.start=async()=>{started++;};return m;};
 const m1=make({record:false});await m1.monitor.start({app:'Zoom'});assert.equal(started,0,'another company records it');
 const m2=make({record:true,note:'Встреча с Maria K — записываю в компанию «Агентство».'});await m2.monitor.start({app:'Zoom'});
 assert.equal(started,1);assert.match(published.at(-1),/Обнаружена встреча · Zoom\. Встреча с Maria K/);
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Meeting company: participants matched to each company\'s team, switch before recording, no ping-pong, ties and unknown names stay, refusals recorded here passed');
})().catch(e=>{console.error(e);process.exit(1);});
