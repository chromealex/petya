// The built-in skill library: 100 valid skills, every one is found by a typical request, small talk finds none,
// and the model's choice reaches the answer request only for that one command.
const assert=require('node:assert/strict');
const library=require('../src/skill-library/index.cjs');
const {validate,InstructionSkills}=require('../src/instruction-skills.cjs');
const feature=require('../src/features/skill-choice.cjs');
const dialogueRequest=require('../src/dialogue-request.cjs');
const {TYPICAL,NONE}=require('./skill-requests.cjs');

// The library: exactly 100 valid skills with unique names, each with a typical request in the test set.
assert.equal(library.BUILTIN.length,100);
assert.equal(new Set(library.BUILTIN.map(s=>s.name)).size,100);
for(const s of library.BUILTIN){validate(s);assert.ok(s.description.length>=40,s.name+' needs a description that says when to use it');}
assert.deepEqual(Object.keys(TYPICAL).sort(),library.BUILTIN.map(s=>s.name).sort());

// Recall: the shortlist the model chooses from holds the right skill for every typical request.
let first=0;
for(const [name,command] of Object.entries(TYPICAL)){
 const short=library.shortlist(command).filter(r=>r.score>=feature.MIN_SCORE);
 const at=short.findIndex(r=>r.skill.name===name);
 assert.ok(at>=0,name+' is not shortlisted for «'+command+'»: '+short.map(r=>r.skill.name).join(', '));
 if(at===0)first++;
}
assert.ok(first>=85,'the right skill should usually rank first, got '+first);
// Small talk does not even reach the model.
for(const command of ['Привет','Как дела?','Спасибо!','Ты кто?','Как меня зовут?','Какая погода в Москве?','Расскажи анекдот'])
 assert.equal(library.shortlist(command).filter(r=>r.score>=feature.MIN_SCORE).length,0,command);

// User skills: an enabled one joins the library, a disabled namesake switches the built-in off, workflow skills stay out.
const own=library.library([{name:'bug-report',description:'Мой формат багов для нашей команды и трекера',body:'x',enabled:false},{name:'my-digest',description:'Мой дайджест новостей проекта для руководства',body:'x',enabled:true},{name:'project-status',workflow:'project-status',description:'Статус проекта',body:'x',enabled:true}]);
assert.ok(!own.some(s=>s.name==='bug-report'));
assert.ok(own.some(s=>s.name==='my-digest'));
assert.ok(!own.some(s=>s.name==='project-status'));
assert.equal(own.length,100);

// Explicit «/name» runs a built-in skill too.
const user=new InstructionSkills({state:[]});
const explicit=user.resolve('/release-notes версия 1.19: новый магазин');
assert.equal(explicit.skill.name,'release-notes');
assert.equal(explicit.question,'версия 1.19: новый магазин');
assert.throws(()=>user.resolve('/no-such-skill'),/не найден/);

(async()=>{
 const calls=[];let reply={skill:'bug-report',confidence:.9};
 const s={settings:{model:'qwen',ollamaUrl:'http://127.0.0.1:11434'},core:{localEndpoint:()=>'http://local/api/chat'},instructionSkills:{list:()=>[]},
  dialogue:{active:()=>({messages:[]})},requestProgress:{report(){}},
  request:async(_url,options)=>{calls.push(JSON.parse(options.body));return {message:{content:JSON.stringify(reply)}};}};
 const {skillChoice}=feature.setup(s);
 const command='Оформи баг-репорт: при нажатии на кнопку магазина игра зависает';
 const skill=await skillChoice.prepare(command);
 assert.equal(skill.name,'bug-report');
 const asked=calls.at(-1);
 assert.ok(asked.format.properties.skill.enum.includes('bug-report'));
 assert.ok(asked.format.properties.skill.enum.includes(''),'the model may choose no skill');
 assert.ok(asked.format.properties.skill.enum.length<=7,'the model chooses from a short list');
 // The answer request for this command carries the skill's instructions…
 const topic={title:'t',messages:[]};
 const body=dialogueRequest.dialogueRequest({model:'qwen',command,topic,company:'C'});
 assert.match(body.messages[0].content,/selected_skill/);
 assert.match(body.messages[0].content,/"name":"bug-report"/);
 assert.match(body.messages[0].content,/выбранный для этого запроса/);
 // …another command does not.
 assert.doesNotMatch(dialogueRequest.dialogueRequest({model:'qwen',command:'Привет',topic,company:'C'}).messages[0].content,/selected_skill/);
 assert.equal(skillChoice.done(),true,'the skill was used for the answer');
 assert.doesNotMatch(dialogueRequest.dialogueRequest({model:'qwen',command,topic,company:'C'}).messages[0].content,/selected_skill/,'the choice ends with the request');
 // A skill picked but not used (the request was answered by a Jira report) is not reported as used.
 await skillChoice.prepare(command);assert.equal(skillChoice.done(),false);

 // The model may say no skill fits, or be unsure: no skill then.
 reply={skill:'',confidence:.95};assert.equal(await skillChoice.prepare('Что нового в Slack?'),null);
 reply={skill:'slack-message',confidence:.4};assert.equal(await skillChoice.prepare('Что нового в Slack?'),null);
 reply={skill:'invented-skill',confidence:.99};assert.equal(await skillChoice.prepare('Напиши release notes для версии 1.19'),null);
 reply='not json';s.request=async()=>({message:{content:'{oops'}});assert.equal(await skillChoice.prepare('Напиши release notes для версии 1.19'),null);
 // Small talk never asks the model; switching auto skills off or having no model asks nothing either.
 let asked2=0;s.request=async()=>{asked2++;return {message:{content:'{}'}};};
 for(const command of NONE.slice(0,3))await skillChoice.prepare(command);
 s.settings.autoSkills='false';await skillChoice.prepare('Напиши release notes для версии 1.19');
 s.settings.autoSkills='true';s.settings.model='';await skillChoice.prepare('Напиши release notes для версии 1.19');
 assert.equal(asked2,0);
 // A failing model never breaks the answer.
 s.settings.model='qwen';s.request=async()=>{throw Error('offline');};
 const log=console.error;console.error=()=>{};assert.equal(await skillChoice.prepare('Напиши release notes для версии 1.19'),null);console.error=log;
 console.log('skill choice: ok ('+first+'/100 ranked first)');
})().catch(e=>{console.error(e);process.exit(1);});
