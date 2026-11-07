const assert=require('node:assert/strict'),{NameProfile}=require('../src/ui/name-profile.js'),{instruction}=require('../src/speech-style.cjs');
assert.deepEqual(NameProfile.validate('Александр').variants,['Саша','Сань','Санёк']);assert.deepEqual(NameProfile.validate('Алексей').variants,['Лёша','Лёх','Лёш']);assert(!NameProfile.validate('Михаил').variants.includes('Сань'));assert.deepEqual(NameProfile.validate('Жан-Поль').variants,[]);assert.deepEqual(NameProfile.validate('Анна','Анечка, Аннушка').variants,['Анечка','Аннушка']);assert.throws(()=>NameProfile.validate('123'));assert.throws(()=>NameProfile.validate('','Сань'));assert.equal(NameProfile.validate('').variants.length,0);
assert.match(instruction('3',{name:'Александр'}),/Санёк/);assert.match(instruction('3',{name:'Алексей'}),/Лёх/);assert(!instruction('3',{name:'Алексей'}).includes('Санёк'));assert(!instruction('0',{name:'Александр'}).includes('Санёк'));assert(!/ёпт/iu.test(instruction('0')));assert.match(instruction('3'),/ёпт/iu);assert.match(instruction('3',{name:'Анна'}),/Не добавляй обращение в каждый ответ/);
console.log('Name profiles: per-name variants, custom forms, no invented nickname and style gating passed');

const {preference}=require('../src/name-preference.cjs');
let settings={userName:'Александр',userNameVariants:''};
for(const text of ['Не называй меня Санёк','Перестань называть меня «Санёк», пожалуйста','Петя, не зови меня Санек!']){
 const result=preference(text,settings);assert(result);settings={...settings,...result.patch};
 assert.deepEqual(NameProfile.validate(settings.userName,'',settings.userNameExcluded).variants,['Саша','Сань']);
}
assert.equal(settings.userNameExcluded,'Санёк');
for(const text of ['Он сказал: не называй меня Санёк','Что значит «не называй меня Санёк»?','Не называй его Санёк'])assert.equal(preference(text,settings),null);
settings=JSON.parse(JSON.stringify(settings));
const prompt=instruction('3',{name:settings.userName,excluded:settings.userNameExcluded});
assert(!prompt.split('Не используй обращения')[0].includes('Санёк'));assert.match(prompt,/списка отказов/);
assert(NameProfile.validate('Алексей','',settings.userNameExcluded).variants.includes('Лёша'));
console.log('Address refusals: explicit requests, persistence, spelling variants and negative cases passed');
