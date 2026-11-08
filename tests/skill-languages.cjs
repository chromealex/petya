// Skills described in English (installed or from a project's .claude/skills) are found by Russian requests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const feature=require('../src/features/skill-choice.cjs');
const library=require('../src/skill-library/index.cjs');
(async()=>{
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-skill-lang-'));
 const english={name:'store-release-notes',description:'Use when the user asks to write App Store or Google Play release notes for a new game version.',body:'Write short release notes.',builtin:false,installed:true,enabled:true};
 const asked=[];
 const s={dataRoot,settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},core:require('../src/core.cjs'),installedSkills:()=>[english],instructionSkills:{list:()=>[]},
  request:async(url,o)=>{const b=JSON.parse(o.body);asked.push(b);
   if(b.format.properties.ru)return {message:{content:JSON.stringify({ru:'Пиши релиз-ноты для App Store или Google Play к новой версии игры.'})}};
   const names=b.format.properties.skill.enum;return {message:{content:JSON.stringify({skill:names.includes('store-release-notes')?'store-release-notes':'',confidence:0.9})}};}};
 const {skillChoice}=feature.setup(s);
 // Before translation the Russian request shares no words with it, yet the model still sees it.
 const before=library.shortlist('Напиши релиз-ноты для стора к версии 1.20',skillChoice.skills());
 assert(!before.some(r=>r.skill===english),'English words do not match a Russian request');
 const chosen=await skillChoice.choose('Напиши релиз-ноты для стора к версии 1.20');
 assert.equal(chosen,english,'an untranslated English skill is offered to the model and chosen');
 assert(asked.at(-1).format.properties.skill.enum.includes('store-release-notes'));
 // The background translation is made once, kept on disk and used for matching by words.
 await skillChoice.translate();
 assert.equal(english.ru,'Пиши релиз-ноты для App Store или Google Play к новой версии игры.');
 const saved=JSON.parse(fs.readFileSync(path.join(dataRoot,'skill-descriptions.json'),'utf8'));
 assert(Object.values(saved).includes(english.ru));
 const after=library.shortlist('Напиши релиз-ноты для Google Play',skillChoice.skills(),8,1);
 assert(after.some(r=>r.skill===english),'after translation the skill is found by Russian words');
 // A restart reads the saved translation without asking the model again.
 const fresh={...english};delete fresh.ru;const calls=asked.length;
 const again=feature.setup({...s,installedSkills:()=>[fresh]}).skillChoice;again.skills();
 assert.equal(fresh.ru,english.ru);await again.translate();assert.equal(asked.length,calls,'no second translation');
 // Russian skills are not translated, and a request with no fitting skill still gets none.
 const plain=feature.setup({...s,installedSkills:()=>[]}).skillChoice;
 assert.equal(await plain.choose('Какая погода завтра?'),null);
 console.log('Skill languages: English skills offered before translation, translated once, kept on disk and matched by Russian words OK');
})().catch(e=>{console.error(e);process.exit(1);});
