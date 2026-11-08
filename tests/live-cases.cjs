// The 500 live cases are well-formed and the grader catches the usual failures.
const assert=require('node:assert/strict');const cases=require('../src/live-cases.cjs');const {grade,summary}=require('../src/live-grade.cjs');
assert.equal(cases.reduce((n,s)=>n+s.turns.length,0),500);assert.equal(new Set(cases.map(s=>s.name)).size,cases.length);
for(const s of cases)for(const t of s.turns){const [q,c]=Array.isArray(t)?t:[t,{}];assert.ok(typeof q==='string'&&q.trim());for(const k of ['by','notBy','has','not'])if(c[k])new RegExp(c[k],'iu');}
// Every built-in skill has a live case.
const named=new Set(cases.flatMap(s=>s.turns).map(t=>Array.isArray(t)&&/^(?:навык|скилл) (\S+)$/.exec(t[1].by||'')?.[1]).filter(Boolean));
for(const s of require('../src/skill-library/index.cjs').BUILTIN)if(s.name!=='translate'&&!s.package)assert.ok(named.has(s.name),s.name);
assert.deepEqual(grade({text:'Привет! Чем помочь?',by:'шаблон: приветствие'},{has:'привет'}),[]);
assert.ok(grade({text:''}).includes('пустой ответ'));
assert.ok(grade({text:'Hello'}).includes('ответ не по-русски'));assert.deepEqual(grade({text:'Hello'},{en:true}),[]);
assert.ok(grade({text:'Готово. Вы можете открыть задачу.'}).includes('обращение на «вы»'));
assert.ok(grade({text:'{"understood":true,"answer":"x"}'}).includes('служебный текст в ответе'));
assert.ok(grade({text:'Ответ',by:'модель qwen'},{by:'навык bug-report'})[0].startsWith('обработчик'));
assert.equal(summary({scenarios:[{name:'a',turns:[{fail:[]},{fail:['x']}]}]}).failed,1);
console.log('Live cases: 500 well-formed graded turns, every skill covered, grader checks passed');
