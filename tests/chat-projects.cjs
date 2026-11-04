const assert=require('node:assert/strict');
const {Dialogue}=require('../src/dialogue.cjs');
(async()=>{
 let saved;
 const d=new Dialogue({state:{activeId:'old',topics:[{id:'old',title:'Старый чат',at:Date.now(),kind:'chat',messages:[]}]},save:s=>saved=structuredClone(s),answer:async()=> 'Ответ',readers:{tasks:async()=>({text:'Задачи'})}});
 assert.equal(d.list().projects[0].name,'Общее');assert.equal(d.active().projectId,'general');
 const p=d.projectCreate('Новый проект').activeProjectId;assert.equal(d.list().topics.length,0);
 await d.turn('Какие задачи?',undefined,'tasks');const newId=d.active().id;assert.equal(d.active().projectId,p);
 d.projectSelect('general');assert.equal(d.list().topics[0].id,'old');
 await d.turn('Какие задачи?',undefined,'tasks');assert.notEqual(d.active().id,newId);
 d.move('old',p);assert(!d.list().topics.some(t=>t.id==='old'));d.projectSelect(p);assert(d.list().topics.some(t=>t.id==='old'));
 d.select('');await d.turn('Ещё задачи',undefined,'tasks');assert.notEqual(d.active().id,newId);d.projectRename(p,'Другое имя');assert.throws(()=>d.projectCreate('Другое имя'));assert.throws(()=>d.projectSelect('missing'));assert.throws(()=>d.projectCreate(' '));
 const restored=new Dialogue({state:saved});assert.equal(restored.list().activeProjectId,p);assert.equal(restored.list().topics.length,3);
 d.busy=true;assert.throws(()=>d.projectSelect('general'));assert.throws(()=>d.move('old','general'));
 console.log('Projects: legacy migration, persistence, scoped routing, moving, naming and busy guard passed');
})().catch(e=>{console.error(e);process.exit(1)});
