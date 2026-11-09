const assert=require('node:assert/strict');
const team=require('../src/team.cjs');
const members=team.validate([{name:' Полина ',aliases:'Поля',role:'QA',projects:'GAME Android',responsibilities:'Релизные сборки',slackId:'U123ABC',jiraId:'abc-123'}]);
assert.equal(members[0].name,'Полина');
assert.match(team.context({teamMembers:JSON.stringify(members),teamRoles:'Иван — backend'}),/Релизные сборки/);
assert.match(team.context({teamRoles:'Старые записи'}),/Старые записи/);
assert.equal(team.context({teamMembers:'[]'}),'');
assert.throws(()=>team.validate([{name:''}]));
assert.throws(()=>team.validate([{name:'Поля',slackId:'@polina'}]));
assert.throws(()=>team.validate([{name:'Поля',email:'invalid'}]));
assert.throws(()=>team.validate(Array.from({length:101},()=>({name:'Иван'}))));
assert.throws(()=>team.validate([{name:'Иван',responsibilities:'x'.repeat(1601)}]));
assert.equal(team.validate([{name:'Иван',projects:'A'},{name:'Иван',projects:'B'}]).length,2,'Namesakes must remain distinct');
const many=team.validate(Array.from({length:100},(_,i)=>({name:'Коллега '+i,responsibilities:'x'.repeat(1600)})));
assert.ok(team.context({teamMembers:JSON.stringify(many)},'Коллега 99',2000).length<=2000);
assert.match(team.context({teamMembers:JSON.stringify(many)},'Коллега 99',2000),/Коллега/);
// «Это я»: one card is the user; Petya talks to them as «ты» instead of naming them in the third person.
{const rows=team.validate([{name:'Alex Silaev',me:'true'},{name:'Денис',me:'true'},{name:'Константин',me:'yes'}]);
 assert.deepEqual(rows.map(r=>r.me),['true','',''],'one card at most, only «true»');
 const s={teamMembers:JSON.stringify(rows)};assert.equal(team.self(s).name,'Alex Silaev');
 assert.match(team.context(s),/Пользователь, с которым ты говоришь, — это "Alex Silaev" из команды: говори ему «ты».*не предлагай «Alex или ты»/);
 const plain=JSON.stringify(team.validate([{name:'Alex Silaev',email:'chrome.alex@gmail.com'},{name:'Денис Котов'}]));
 assert.equal(team.self({teamMembers:plain,jiraEmail:'Chrome.Alex@gmail.com'}).name,'Alex Silaev','unmarked: the Jira email finds the card');
 assert.equal(team.self({teamMembers:plain,userName:'Денис Котов'}).name,'Денис Котов','unmarked: the full name finds it');
 assert.equal(team.self({teamMembers:plain,userName:'Денис'}),null,'a first name alone is not enough');
 assert.doesNotMatch(team.context({teamMembers:plain}),/Пользователь, с которым/,'nobody known: no line');}
console.log('Team directory tests passed');
