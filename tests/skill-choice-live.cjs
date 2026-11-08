// Live check of skills with the local Ollama model: `node tests/skill-choice-live.cjs [model]`.
// Measures how often the model picks the right skill for typical requests and none for small talk, finds an
// English skill by a Russian request, fits a long package skill to a request and carries out a skill with a
// reference file. Skipped when Ollama is not running. Results go to tests/results/skill-choice-live-*.json.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const url=process.env.OLLAMA_URL||'http://127.0.0.1:11434';
const request=async(endpoint,o)=>{const r=await fetch(endpoint,{...o,signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Ollama '+r.status);return r.json();};
(async()=>{
 let tags;try{tags=await (await fetch(url+'/api/tags',{signal:AbortSignal.timeout(3000)})).json();}catch{console.log('Skill choice live: skipped (Ollama is not running at '+url+')');return;}
 const model=process.argv[2]||process.env.PETYA_MODEL||tags.models?.find(m=>/qwen3|gemma|llama/i.test(m.name))?.name||tags.models?.[0]?.name;
 if(!model){console.log('Skill choice live: skipped (no local model)');return;}
 const {TYPICAL,NONE}=require('./skill-requests.cjs');
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-live-'));
 const english={name:'store-release-notes',description:'Use when the user asks to write App Store or Google Play release notes for a new game version.',body:'Write short release notes: what is new, fixes, no emoji, under 500 characters.',builtin:false,installed:true,enabled:true};
 const s={dataRoot,settings:{model,ollamaUrl:url},core:require('../src/core.cjs'),request,installedSkills:()=>[english],instructionSkills:{list:()=>[]},requestProgress:{report(){}}};
 const {skillChoice}=require('../src/features/skill-choice.cjs').setup(s);
 const results={model,at:new Date().toISOString(),typical:[],none:[],english:null,fitted:null,runtime:null};
 const sample=Object.entries(TYPICAL).sort(()=>Math.random()-0.5).slice(0,Number(process.env.SKILL_SAMPLE||40));
 for(const [name,text] of sample){const chosen=await skillChoice.choose(text);results.typical.push({text,expected:name,chosen:chosen?.name||null,ok:chosen?.name===name});}
 for(const text of NONE.slice(0,20)){const chosen=await skillChoice.choose(text);results.none.push({text,chosen:chosen?.name||null,ok:!chosen});}
 // An English skill, before and after its description is translated.
 const before=await skillChoice.choose('Напиши релиз-ноты для стора к версии 1.20');
 await skillChoice.translate();const after=await skillChoice.choose('Напиши релиз-ноты для Google Play к версии 1.20');
 results.english={before:before?.name||null,translation:english.ru||null,after:after?.name||null};
 // A long package skill fitted to a request by the model.
 const library=require('../src/skill-library/index.cjs'),context=require('../src/skill-library/context.cjs'),compactor=require('../src/context-compactor.cjs');
 const big=library.BUILTIN.find(x=>x.name==='claude-api');
 const fitted=await context.prepare(big,'Как включить prompt caching в Python SDK?',{request,settings:s.settings});
 results.fitted={fullTokens:compactor.tokens(big.body),fittedTokens:compactor.tokens(fitted),mentionsCaching:/cache_control|prompt caching/i.test(fitted)};
 // A skill with a reference file carried out step by step (no scripts, so no Docker needed).
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-live-skill-'));
 fs.writeFileSync(path.join(dir,'SKILL.md'),'---\nname: retro-template\ndescription: Run a team retrospective using the template.\n---\nRead template.md and fill it in from the conversation. Answer in Russian.');
 fs.writeFileSync(path.join(dir,'template.md'),'# Retro\n## Went well\n## To improve\n## Action items (owner, date)');
 const skill=require('../src/skill-library/installed.cjs').install(fs.mkdtempSync(path.join(os.tmpdir(),'petya-live-root-')),dir);
 const dialogue=new (require('../src/dialogue.cjs').Dialogue)({save:()=>{}});
 dialogue.rememberAction('Спринт: магазин выпустили вовремя, оплата сломалась в пятницу, Борис починит до среды.','Понял.');
 const runtime=require('../src/features/skill-runtime.cjs').setup({...s,dialogue,skillSandbox:{status:async()=>({ready:false,message:'нет'})}}).skillRuntime;
 const reply=await runtime.turn({skill,question:'Проведи ретро по этому спринту'});
 results.runtime={read:dialogue.active().messages.at(-1).skillSteps||[],answer:reply.text.slice(0,600)};
 const rate=rows=>rows.filter(r=>r.ok).length+'/'+rows.length;
 fs.mkdirSync(path.join(__dirname,'results'),{recursive:true});
 const file=path.join(__dirname,'results','skill-choice-live-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');fs.writeFileSync(file,JSON.stringify(results,null,1));
 console.log('Skill choice live ('+model+'): right skill '+rate(results.typical)+', no skill for small talk '+rate(results.none)+
  ', English skill before/after translation: '+results.english.before+' / '+results.english.after+
  ', claude-api '+results.fitted.fullTokens+' → '+results.fitted.fittedTokens+' tokens (caching found: '+results.fitted.mentionsCaching+')'+
  ', runtime steps: '+(results.runtime.read.join(', ')||'none')+'. Details: '+file);
})().catch(e=>{console.error(e);process.exit(1);});
