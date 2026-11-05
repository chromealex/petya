const assert=require('node:assert/strict');const feature=require('../src/features/highlights.cjs');const {dialogueRequest}=require('../src/dialogue-request.cjs');
const state={topics:[{id:'t1',projectId:'p',title:'Релиз',messages:[{role:'user',text:'Релиз 1.19 переносим на 20 ноября'}]},{id:'t2',projectId:'p',title:'Другой',messages:[]},{id:'a1',projectId:'p',title:'Агент',agentOf:'t1',messages:[]}],projects:[{id:'p',name:'BW'}],activeId:'t1'};
let saved=0;const s={dialogue:{state,persist(){saved++;},active(){return state.topics.find(t=>t.id===state.activeId);},rememberAction(c,t){const topic=this.active();topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};
const {highlights,ipc}=feature.setup(s);
let r=ipc.add('t1',{text:'Релиз 1.19   переносим на 20 ноября',messageIndex:0});assert.equal(r.chat.length,1);assert.equal(r.chat[0].text,'Релиз 1.19 переносим на 20 ноября');
r=ipc.add('t1',{text:'Тестирует Полина',scope:'project'});assert.equal(r.project.length,1);assert.equal(r.projectName,'BW');
assert.deepEqual(highlights.collect(state.topics[0]),['Релиз 1.19 переносим на 20 ноября','Тестирует Полина']);
assert.deepEqual(highlights.collect(state.topics[1]),['Тестирует Полина']);// project marks reach every chat
assert.deepEqual(highlights.collect(state.topics[2]),['Релиз 1.19 переносим на 20 ноября','Тестирует Полина']);// agents see the parent chat
const req=dialogueRequest({model:'q',command:'Когда релиз?',topic:state.topics[0]});assert.match(req.messages[0].content,/important/);assert.match(req.messages[1].content,/20 ноября/);
assert.doesNotMatch(dialogueRequest({model:'q',command:'x',topic:{title:'n',messages:[],projectId:'none'}}).messages[0].content,/important в справочных/);
r=ipc.update('t1',r.project[0].id,{scope:'chat'});assert.equal(r.project.length,0);assert.equal(r.chat.length,2);
r=ipc.update('t1',r.chat[1].id,{text:'Тестирует Полина и Борис'});assert.equal(r.chat[1].text,'Тестирует Полина и Борис');
r=ipc.remove('t1',r.chat[1].id);assert.equal(r.chat.length,1);
assert.throws(()=>ipc.add('t1',{text:' '}),/Выделите/);assert.throws(()=>ipc.add('t1',{text:'x'.repeat(1000)})&&ipc.add('t1',{text:'y'.repeat(1000)})&&ipc.add('t1',{text:'z'.repeat(1000)})&&ipc.add('t1',{text:'w'.repeat(1000)}),/много/);
const v=highlights.turn('Запомни как важное для проекта: демо в пятницу');assert.match(v.text,/для всего проекта/);assert(state.projects[0].highlights.some(h=>h.text==='демо в пятницу'));
assert.equal(highlights.turn('Запомни: у нас это чинится так'),null);
assert(highlights.keep('Когда релиз 1.19?',state.topics[0]));assert(!highlights.keep('Расскажи анекдот',state.topics[0]));
{const other={id:'t9',projectId:'p',title:'Анекдоты',messages:[]};state.topics.push(other);assert(feature.collect(state,other,'Когда релиз 1.19?').some(v=>/1\.19/.test(v)));assert(!feature.collect(state,other,'Расскажи анекдот').some(v=>/1\.19/.test(v)));}
// «Что важно не забыть?» lists the marks; in a chat without marks — the project's marks from other chats
{const fresh={id:'t10',projectId:'q',title:'Расчёт',messages:[]},marked={id:'t11',projectId:'q',title:'Задачи',messages:[],highlights:[{id:'h',text:'BW-4350 нужно закрыть до релиза',at:Date.now()}]};state.projects.push({id:'q',name:'MW'});state.topics.push(fresh,marked);
 state.activeId='t11';let a=highlights.turn('Что важно не забыть по задачам?');assert.match(a.text,/• BW-4350 нужно закрыть до релиза/);assert.equal(a.by,'важное');
 state.activeId='t10';a=highlights.turn('Что я отмечал как важное?');assert.match(a.text,/BW-4350/);
 for(const q of ['Что важнее: баги или задачи?','Какие задачи важные?','Что такое важное событие?'])assert.equal(highlights.turn(q),null,q);}
console.log('Highlights: chat and project marks, agents inherit, model context, edit/move/remove, limits, voice command and «что важно не забыть» passed');
