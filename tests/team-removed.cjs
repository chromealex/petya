// People removed from «Команда» by hand stay removed: a refresh neither adds them back nor fills them; bringing one
// back (or adding by hand) takes them off the list (src/team-removed.cjs).
const assert=require('node:assert/strict');
const removed=require('../src/team-removed.cjs');
const settings={teamRemoved:removed.update({},[{name:'Polina Samarina',slackId:'U1',role:'PM'},{name:'Иван'},{name:''},null],[])};
assert.equal(removed.list(settings).length,2,'empty rows are dropped');
assert(removed.removed(settings,{name:'Полина Самарина'}),'the same name in another alphabet');
assert(removed.removed(settings,{name:'Совсем другое имя',slackId:'U1'}),'by Slack ID');
assert(removed.removed(settings,{name:'Пётр',aliases:'Иван'}),'by an alias');
assert(!removed.removed(settings,{name:'Иван Петров'}),'a fuller different name is someone else');
const back=removed.update(settings,[],[{name:'Полина Самарина'}]);
assert.deepEqual(JSON.parse(back).map(r=>r.name),['Иван'],'brought back to the team: off the list');
assert.equal(JSON.parse(removed.update(settings,[{name:'Иван',email:'i@x.ru'}],[])).length,2,'the same person is listed once');
// «Заполни команду» does not add a removed person back.
(async()=>{
 const {TeamFill}=require('../src/team-fill.cjs');
 const s={teamMembers:'[]',teamRemoved:removed.update({},[{name:'Иван'}],[])};
 const fill=new TeamFill({settings:()=>s,save:m=>{s.teamMembers=JSON.stringify(m);},sources:c=>[{title:'Команда',text:c,direct:true}],scope:()=>'A',now:()=>1});
 await fill.turn('Заполни команду\nПолина — тестирование; Иван — серверная часть');
 assert.deepEqual(JSON.parse(s.teamMembers).map(m=>m.name),['Полина'],'Иван stays removed');
})().catch(e=>{console.error(e);process.exit(1);});
console.log('Team removed: kept out by name in any alphabet, alias or ID, taken off the list when back in the team passed');
