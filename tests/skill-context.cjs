// Skills of any size: the full text is kept, each request gets what it needs within the budget.
const assert=require('node:assert/strict');
const compactor=require('../src/context-compactor.cjs');
const context=require('../src/skill-library/context.cjs');
const library=require('../src/skill-library/index.cjs');
const {InstructionSkills,instruction,validate}=require('../src/instruction-skills.cjs');
(async()=>{
 // A long user skill: an intro, a section the request needs at the very end, and a lot in between.
 const filler=n=>Array.from({length:n},(_,i)=>'## Раздел '+i+'\n'+'Общие рассуждения о процессе. '.repeat(60)).join('\n\n');
 const big={name:'release-notes-store',description:'Релиз-ноты для стора',body:'# Релиз-ноты\nПиши кратко, по пунктам.\n\n'+filler(40)+'\n\n## Google Play\nДля Google Play не больше 500 символов, без эмодзи, начинай со слова «Новое».'};
 validate(big);
 assert(compactor.tokens(big.body)>context.BUDGET*3,'the test skill is much larger than the budget');
 // Without the model: the intro and the section that shares words with the request, never a blind cut.
 const fitted=context.fit(big,'релиз-ноты для Google Play');
 assert(compactor.tokens(fitted)<=context.BUDGET,'a fitted skill stays within its budget');
 assert(fitted.includes('Пиши кратко'),'the intro is always kept');
 assert(fitted.includes('не больше 500 символов'),'the relevant section at the end is not lost');
 assert(/не вошли в этот запрос/.test(fitted)&&fitted.includes('Раздел 39'),'what was left out is named, not dropped silently');
 // With the model: it picks sections from the outline; the answer is cached per request.
 let calls=0;
 const request=async(url,options)=>{calls++;const body=JSON.parse(options.body);
  if(body.format.properties.sections){const ids=body.format.properties.sections.items.enum;const outline=JSON.parse(body.messages[1].content).outline;return {message:{content:JSON.stringify({sections:outline.filter(p=>/Google Play|Раздел 3$/.test(p.title)).map(p=>p.id)})}};}
  return {message:{content:JSON.stringify({summary:'Сжато: '+JSON.parse(body.messages[1].content).text.slice(0,80)})}};};
 const settings={model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'};
 const prepared=await context.prepare(big,'Напиши релиз-ноты для Google Play',{request,settings});
 assert(prepared.includes('Новое')&&prepared.includes('Раздел 3\n'),'the sections the model chose are included in full');
 assert(!prepared.includes('Раздел 17\n'),'sections the model did not choose stay in the archive');
 assert(prepared.includes('Раздел 17'),'but they are listed in the outline');
 const before=calls;await context.prepare(big,'Напиши релиз-ноты для Google Play',{request,settings});
 assert.equal(calls,before,'the section choice for the same request is cached');
 // Chosen sections that still do not fit are compacted for the request instead of cut.
 const greedy=async(url,options)=>{const body=JSON.parse(options.body);
  if(body.format.properties.sections)return {message:{content:JSON.stringify({sections:body.format.properties.sections.items.enum})}};
  return {message:{content:JSON.stringify({summary:'Главное: пункты, 500 символов для Google Play.'})}};};
 const compacted=await context.prepare(big,'Все правила для Google Play подробно',{request:greedy,settings});
 assert(compacted.includes('сжата под этот запрос'),'compaction is marked');
 assert(compactor.tokens(compacted)<=context.BUDGET);
 // A model failure falls back to the deterministic fit, not to nothing.
 const failing=async()=>{throw Error('Ollama недоступна');};
 assert.equal(await context.prepare(big,'релиз-ноты для Google Play',{request:failing,settings}),fitted);
 // A short skill is passed whole.
 const short=library.BUILTIN.find(s=>s.name==='bug-report');
 assert.equal(await context.prepare(short,'баг',{request:failing,settings}),short.body);
 // Package skills: the full SKILL.md and its references are kept; nothing is cut at 12000 characters.
 const factory=library.BUILTIN.find(s=>s.name==='software-factory');
 assert(factory.body.length>20000,'a package keeps its full text');
 assert(factory.body.includes(factory.raw.slice(-200)),'the end of SKILL.md is not cut');
 // Explicit /name keeps the package text (the body getter used to be lost when the skill was copied).
 const explicit=new InstructionSkills({}).resolve('/software-factory сделай план');
 assert.equal(explicit.skill.body,factory.body);
 assert(instruction(explicit.skill,{query:'план'}).includes('selected_skill'));
 assert(compactor.tokens(instruction(explicit.skill,{query:'план'}))<=context.BUDGET+400,'the instruction fits even without the model');
 // User skills may be long now; they are fitted per request.
 const store=new InstructionSkills({});assert.doesNotThrow(()=>store.put({name:'long-one',description:'Длинная инструкция для проверки',body:'x '.repeat(50000)}));
 // Scripts: only standard-library Python scripts are offered for the sandbox.
 const scripts=require('../src/skill-library/scripts.cjs');
 assert.deepEqual(scripts.imports('import json, os\nfrom pathlib import Path\nimport yaml\n'),['json','os','pathlib','yaml']);
 const creator=library.BUILTIN.find(s=>s.name==='skill-creator');
 const runnable=scripts.runnable(creator).map(s=>s.file);
 assert(runnable.includes('scripts/aggregate_benchmark.py'));
 assert(!runnable.includes('scripts/run_eval.py'),'a script that starts processes is not offered');
 console.log('skill context: fitting, model-chosen sections, compaction, fallbacks, full package text, explicit skills, long user skills and runnable scripts OK');
})().catch(e=>{console.error(e);process.exit(1);});
