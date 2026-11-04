const assert=require('node:assert/strict');
const progress=require('../src/request-progress.cjs');
(async()=>{const a=[],b=[];
 await Promise.all([progress.run('converse',x=>a.push(x),async()=>{await new Promise(r=>setTimeout(r,15));progress.request('https://example.com','jira');}),progress.run('converse',x=>b.push(x),async()=>{progress.request('http://127.0.0.1:11434/api/chat');}),progress.run('backgroundStatus',()=>{throw Error('Background request leaked into chat');},async()=>progress.request('https://slack.com','slack'))]);
 assert.deepEqual(a,['Обращаюсь к Jira']);assert.deepEqual(b,['Обрабатываю запрос локальной моделью']);progress.report('Outside scope');console.log('Request progress isolation passed');})();
