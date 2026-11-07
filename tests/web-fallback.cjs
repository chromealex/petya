// The model's «не знаю» about a public fact leads to a background web search; private and work questions never do.
const assert=require('node:assert/strict');const w=require('../src/web-fallback.cjs');const {blocked}=require('../src/search-browser.cjs');
assert.ok(w.needed('Что ты знаешь про Intelligence Index Score?','Честно, не знаю такого показателя.'));
assert.equal(w.query('Что ты знаешь про Intelligence Index Score?'),'Intelligence Index Score');
for(const q of ['Как меня зовут?','Какие баги открыты?','Что в моей почте?','Кто в нашей команде тестирует?'])assert.ok(!w.needed(q,'Не знаю.'),q);
assert.ok(!w.needed('Что такое ANR?','ANR — это когда приложение не отвечает.'));
// Google's real checks show the browser; ordinary results do not
assert.ok(blocked({url:'https://www.google.com/sorry/index',text:''}));assert.ok(blocked({url:'https://consent.google.com/m',text:''}));
assert.ok(blocked({url:'https://www.google.com/search?q=x',text:'Our systems have detected unusual traffic from your computer'}));
assert.ok(!blocked({url:'https://www.google.com/search?q=x',text:'Intelligence Index — Artificial Analysis'}));
console.log('Web fallback: «не знаю» searches in the background, private questions stay local, the browser shows only for Google checks passed');
