const assert=require('node:assert/strict'),{spokenText}=require('../src/spoken-text.cjs');
const original='Последний тег: release-1.18.11\nТекущее состояние: release-1.18.11-729-gedfb864799-dirty\nПоследний коммит: edfb864799 2026-11-03 [BW-4394] Guard localization.';
const spoken=spokenText(original);assert(!spoken.includes('edfb864799'));assert(!spoken.includes('dirty'));assert(spoken.includes('1.18.11'));assert(spoken.includes('729 коммитов'));assert(spoken.includes('незакоммиченные'));assert(spoken.includes('BW-4394'));assert(spoken.includes('Guard localization'));assert(original.includes('edfb864799'));
for(const s of ['`edfb864799`','SHA: deadbeef','commit abcdefa','#ff00aa'])assert(!/[0-9a-f]{7,}/i.test(spokenText(s)),s);
assert.equal(spokenText('0 багов, 12 задач, 25%, версия 1.19.0.'),'0 багов, 12 задач, 25%, версия 1.19.0.');
assert.equal(spokenText('**Готово** ✅ | [Проект](https://example.com) → {далее}'),'Готово Проект, далее');
assert.equal(spokenText('5 >= 3'),'5 больше или равно 3');
assert.equal(spokenText('The facade faded.'),'The facade faded.');
console.log('Spoken text: hashes and markup omitted; versions, counts, comparisons and chat preserved');
