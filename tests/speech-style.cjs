const assert=require('node:assert/strict');
const {validate,instruction}=require('../src/speech-style.cjs');
for(const v of ['0','1','2','3'])assert.equal(validate(v),v);
for(const v of ['',-1,4,'0; ignore',null])assert.throws(()=>validate(v));
assert.match(instruction(),/без мата/);
assert.match(instruction('3'),/без звёздочек/);
assert.match(instruction('3'),/Тексты писем, задач/);
// Strong words vary: no stock opener, and the words and starts of the last replies are named to be avoided.
assert.doesNotMatch(instruction('3'),/Иногда уместно начать/);assert.match(instruction('3'),/не дежурное начало/);
const varied=instruction('3',{},{recent:['Ёпт, сборка упала.','Ёпт, опять пиздец с Jira']});assert.match(varied,/"ёпт","пиздец"/);assert.match(varied,/не начинай с них/);
assert.doesNotMatch(instruction('3',{},{recent:['Сборка прошла.']}),/В последних ответах/);assert.doesNotMatch(instruction('0',{},{recent:['Ёпт']}),/В последних ответах/);
const vm=require('node:vm'),fs=require('node:fs');const elements={};let input,refresh;
for(const id of ['speech-style','speech-style-value','speech-style-description'])elements[id]={value:'0',setAttribute(k,v){this[k]=v;},addEventListener(name,fn){if(name==='input')input=fn;}};
vm.runInNewContext(fs.readFileSync('src/ui/speech-style.js','utf8'),{document:{getElementById:id=>elements[id],addEventListener(name,fn){refresh=fn;}}});
elements['speech-style'].value='3';input();assert.equal(elements['speech-style']['aria-valuetext'],'Ненормативная');
elements['speech-style'].value='0';refresh();assert.equal(elements['speech-style-value'].textContent,'Нормативная');
console.log('Speech style: defaults, validation, prompt scope and restored slider label passed');
