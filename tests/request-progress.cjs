const assert=require('node:assert/strict');
const progress=require('../src/request-progress.cjs');
(async()=>{const a=[],b=[];
 await Promise.all([progress.run('converse',x=>a.push(x),async()=>{await new Promise(r=>setTimeout(r,15));progress.request('https://example.com','jira');}),progress.run('converse',x=>b.push(x),async()=>{progress.request('http://127.0.0.1:11434/api/chat');}),progress.run('backgroundStatus',()=>{throw Error('Background request leaked into chat');},async()=>progress.request('https://slack.com','slack'))]);
 assert.deepEqual(a,['Обращаюсь к Jira']);assert.deepEqual(b,['Обрабатываю запрос локальной моделью']);progress.report('Outside scope');
 const steps=await progress.run('converse',()=>{},async()=>{progress.report('Разбираю');progress.report('Разбираю');await new Promise(r=>setTimeout(r,20));progress.report('Обращаюсь к Jira');return progress.steps();});
 assert.deepEqual(steps.map(s=>s.label),['Разбираю','Обращаюсь к Jira']);assert(steps[0].ms>=15);assert.deepEqual(progress.steps(),[]);
 const {CommandProgress}=require('../src/ui/command-progress.js');const c=new CommandProgress();await c.start('x',async p=>{p.update('working','A');p.update('working','A');p.update('working','B');});assert.deepEqual(c.steps.map(s=>s.label),['Разбираю запрос','A','B']);console.log('Request progress isolation and step history passed');})();
