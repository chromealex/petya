// The extension picker sees the chat history only while the chat works with an extension, and sums stay
// with Petya's calculator: «7 умножить на 8» and «А пример?» after ordinary answers went to Unity.
const assert=require('node:assert/strict');const {history}=require('../src/extensions/agent.cjs');
const providers=[{type:'unity',name:'Unity Editor'}];
const s=messages=>({dialogue:{active:()=>({messages})}});
assert.deepEqual(history(s([{role:'user',text:'Что такое Docker?'},{role:'assistant',text:'Контейнеры…',by:'модель qwen'}]),providers),[]);
assert.deepEqual(history(s([{role:'user',text:'1000 минус 1'},{role:'assistant',text:'Разрешить Unity Editor исследовать запрос?'}]),providers),[]);
assert.equal(history(s([{role:'user',text:'Почему падает сцена?'},{role:'assistant',text:'В консоли ошибка…',by:'Unity Editor'}]),providers).length,2);
const ext=require('../src/features/extension-replies.cjs');
for(const q of ['7 умножить на 8','1000 минус 1','Сколько будет 3,5 умножить на 2?'])assert.ok(ext.ownedByPetya(q,{}),q);
console.log('Extension picker: history only in extension chats, calculations stay with Petya passed');
