const assert=require('node:assert/strict');const {chatPlaceholder}=require('../src/ui/chat-placeholder.js');
assert.equal(chatPlaceholder([]),'Напиши Пете...');
assert.equal(chatPlaceholder([{role:'assistant',text:'Не удалось проверить задачи'}],{error:true}),'Напиши Пете...');
assert.equal(chatPlaceholder([{role:'user',text:'Мои задачи'},{role:'assistant',text:'DEV-42 — В работе'}]),'Какие из этих задач сделать сначала?');
assert.equal(chatPlaceholder([{role:'assistant',text:'Какой проект?'}],{question:true}),'Напиши Пете...');
console.log('Contextual placeholder and fallback passed');
