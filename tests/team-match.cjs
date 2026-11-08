// Meeting participants matched to the team: either alphabet, initials, aliases, Jira names, email logins, devices.
const assert=require('node:assert/strict');const {label}=require('../src/team-match.cjs');
const team=[{name:'Сергей Иванов',role:'QA',email:'s.ivanov@x.com'},{name:'Анна Петрова',role:'Android',aliases:'Аня'},{name:'Сергей Смирнов',role:'Backend'},{name:'Александр Силаев',role:'PM',jiraName:'Alex Silaev'}];
for(const [shown,name] of [['Sergey Ivanov','Сергей Иванов'],['Sergei Ivanov','Сергей Иванов'],['Сергей И.','Сергей Иванов'],['Anna Petrova','Анна Петрова'],['Аня','Анна Петрова'],['Alex Silaev','Александр Силаев'],['Aleksandr Silaev','Александр Силаев'],['sivanov','Сергей Иванов'],['iPhone (Анна)','Анна Петрова'],['Анна Петрова (Host)','Анна Петрова'],['Smirnov','Сергей Смирнов']])assert.equal(label(shown,team).name,name,shown);
for(const shown of ['Сергей','Ivan Ivanov','Гость'])assert.equal(label(shown,team).member,false,shown);
assert.equal(label('Sergey Ivanov',team).role,'QA');
// A name chosen in «Имя на встречах» wins over the automatic match; several through a comma.
const chosen=[...team.slice(0,3),{...team[3],meetingName:'Sergey Ivanov, Boss'}];
assert.equal(label('Sergey Ivanov',chosen).name,'Александр Силаев');assert.equal(label('boss',chosen).name,'Александр Силаев');assert.equal(label('Anna Petrova',chosen).name,'Анна Петрова');
assert.equal(require('../src/team.cjs').validate([{name:'X',meetingName:'Xx'}])[0].meetingName,'Xx');
console.log('team match: meeting names to the team passed');
