// Skills in full: English or Russian, with references, templates and scripts run in the sandbox.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const feature=require('../src/features/skill-runtime.cjs');
const installed=require('../src/skill-library/installed.cjs');
const scripts=require('../src/skill-library/scripts.cjs');
const {dockerfile,imageName}=require('../src/skill-sandbox.cjs');
const {Dialogue}=require('../src/dialogue.cjs');
const {InputRequired}=require('../src/input-required.cjs');
(async()=>{
 // An English skill package with references, a template, a helper module and dependencies.
 const src=fs.mkdtempSync(path.join(os.tmpdir(),'petya-skill-src-'));
 const put=(f,t)=>{fs.mkdirSync(path.dirname(path.join(src,f)),{recursive:true});fs.writeFileSync(path.join(src,f),t);};
 put('SKILL.md','---\nname: release-report\ndescription: Use when the user asks for a release report document.\nlicense: MIT\nallowed-tools: Bash\n---\n\n# Release report\n\n1. Read references/style.md.\n2. Run scripts/build.py with the version to create the document in ../out/.\n');
 put('references/style.md','# Style\n\n'+Array.from({length:30},(_,i)=>'## Rule '+i+'\n'+'Keep it short and factual. '.repeat(60)).join('\n\n')+'\n\n## Headings\nUse the version as the title.');
 put('scripts/build.py','import sys, os\nimport yaml\nfrom helpers import fmt\nfrom docx import Document\nprint(fmt(sys.argv[1]))\n');
 put('scripts/helpers.py','def fmt(v):\n    return "Release "+v\n');
 put('requirements.txt','python-docx>=1.1\n# comment\n');
 put('assets/template.html','<h1>{{title}}</h1>');
 put('LICENSE.txt','MIT');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-skills-'));
 const skill=installed.install(root,src);
 assert.equal(skill.name,'release-report');
 assert(feature.handles(skill),'a skill with files is carried out step by step');
 assert(!feature.handles({name:'x',body:'y'}),'a plain instruction skill is not');
 // Dependencies: requirements.txt, imports mapped to pip names, local modules excluded.
 const need=scripts.requirements(skill);
 assert.deepEqual(need.pip,['python-docx>=1.1','pyyaml']);
 assert(!need.pip.includes('helpers'),'a module of the skill is not a package');
 assert.equal(need.node,false);
 assert(dockerfile(need).includes("pip install --no-cache-dir 'python-docx>=1.1' 'pyyaml'"));
 assert.throws(()=>dockerfile({pip:["x'; rm -rf /"],npm:[]}),/Недопустимое/,'package names cannot inject commands');
 assert.equal(imageName(need),imageName({...need}),'the image of a skill is stable');
 // A fake sandbox records what it was asked; a fake model follows the skill's steps.
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'petya-out-'));
 const calls={prepare:[],run:[]};let ready=false;
 const sandbox={status:async()=>({ready:true}),ready:async()=>ready,prepare:async(n)=>{calls.prepare.push(n);ready=true;return 'img';},
  run:async(args)=>{calls.run.push(args);return {ok:true,exitCode:0,stdout:'Release 1.20\n',stderr:'',files:{'Release 1.20.docx':Buffer.from('PK fake docx')}};}};
 const plan=[{action:'read',path:'references/style.md'},{action:'read',path:'references/style.md#s99'},{action:'read',path:'../../../etc/passwd'},{action:'run',command:['python','scripts/build.py','1.20']},{action:'answer',answer:'Готов отчёт о релизе 1.20.'}];
 const seen=[];
 const dialogue=new Dialogue({save:()=>{}});
 const s={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},core:require('../src/core.cjs'),dialogue,skillSandbox:sandbox,officeFolder:()=>folder,requestProgress:{report(){}},
  request:async(url,o)=>{const b=JSON.parse(o.body);if(b.format?.properties?.sections)return {message:{content:JSON.stringify({sections:[]})}};seen.push(b.messages);const step=b.messages.filter(m=>m.role==='assistant').length;return {message:{content:JSON.stringify(plan[step])}};}};
 const {skillRuntime}=feature.setup(s);
 // Packages are installed only with the user's consent.
 let asked;try{await skillRuntime.turn({skill,question:'Сделай отчёт о релизе 1.20'});}catch(e){asked=e;}
 assert(asked instanceof InputRequired&&/python-docx>=1\.1, pyyaml/.test(asked.spec.text)&&asked.spec.options.includes('Установить'));
 assert.equal(calls.run.length,0,'nothing runs before the answer');
 const reply=await asked.resume('Установить');
 assert.equal(calls.prepare.length,1,'packages are installed once');
 assert.equal(reply.text,'Готов отчёт о релизе 1.20.');
 const system=seen[0][0].content;
 assert(system.includes('Run scripts/build.py')&&system.includes('assets/template.html')&&!system.includes('LICENSE.txt'),'the model sees the instructions and the skill files');
 const observations=seen.at(-1).filter(m=>m.role==='user').map(m=>m.content).join('\n');
 assert(observations.includes('Use the version as the title'),'the relevant part of a long reference is read');
 assert(/Нет раздела s99/.test(observations)&&/Нет такого файла в навыке: \.\.\/\.\.\/\.\.\/etc\/passwd/.test(observations),'missing sections and paths outside the skill are refused');
 const run=calls.run[0];
 assert.deepEqual(run.command,['python','scripts/build.py','1.20']);
 assert(run.files['skill/scripts/helpers.py']&&run.files['skill/assets/template.html']&&run.files['skill/SKILL.md'],'the whole skill folder goes into the sandbox');
 assert.deepEqual(run.need.pip,need.pip);
 const message=dialogue.active().messages.at(-1);
 assert.equal(message.by,'навык release-report');
 assert.equal(message.attachments[0].localSourcePath,path.join(folder,'release-report','Release 1.20.docx'));
 assert(fs.existsSync(message.attachments[0].localSourcePath)&&message.attachments[0].generated,'files from out/ are saved and attached');
 assert.deepEqual(message.skillSteps,['прочитал references/style.md','прочитал references/style.md#s99','прочитал ../../../etc/passwd','запустил scripts/build.py']);
 // Declining the packages: the skill still answers, without running, and says so.
 ready=false;calls.run.length=0;seen.length=0;
 let again;try{await skillRuntime.turn({skill,question:'Ещё раз отчёт'});}catch(e){again=e;}
 plan.splice(0,plan.length,{action:'run',command:['python','scripts/build.py','1.21']},{action:'answer',answer:'Описал отчёт без запуска.'});
 const declined=await again.resume('Без установки');
 assert.equal(calls.run.length,0);
 assert(/не стал устанавливать пакеты/.test(declined.text)&&/Скрипты навыка не запускались/.test(declined.text));
 assert(/run недоступен/.test(seen[0][0].content));
 // Without Docker the skill answers by its logic and says the scripts did not run.
 const offline=feature.setup({...s,skillSandbox:{...sandbox,status:async()=>({ready:false,message:'Запустите Docker Desktop.'})}}).skillRuntime;
 plan.splice(0,plan.length,{action:'answer',answer:'Сделал по шагам навыка.'});
 const noDocker=await offline.turn({skill,question:'Отчёт о релизе'});
 assert(/Изолированная среда недоступна: Запустите Docker Desktop\./.test(noDocker.text));
 // A Russian skill with only references needs no environment and reads its files.
 const ru=fs.mkdtempSync(path.join(os.tmpdir(),'petya-skill-ru-'));
 fs.writeFileSync(path.join(ru,'SKILL.md'),'---\nname: ретро\ndescription: Проводи ретроспективу по шаблону.\n---\nСм. шаблон.md');
 assert.throws(()=>installed.install(root,ru),/латиница/,'skill names stay Latin');
 fs.writeFileSync(path.join(ru,'SKILL.md'),'---\nname: team-retro\ndescription: Проводи ретроспективу команды по шаблону.\n---\nПрочитай шаблон.md и заполни его по разговору.');
 fs.writeFileSync(path.join(ru,'шаблон.md'),'# Ретро\n## Что хорошо\n## Что плохо\n## Действия');
 const retro=installed.install(root,ru);
 plan.splice(0,plan.length,{action:'read',path:'шаблон.md'},{action:'answer',answer:'## Что хорошо\n…'});
 const statusCalls=[];const plain=feature.setup({...s,skillSandbox:{...sandbox,status:async()=>{statusCalls.push(1);return {ready:true};}}}).skillRuntime;
 const r=await plain.turn({skill:retro,question:'Проведи ретро'});
 assert(r.text.startsWith('## Что хорошо')&&statusCalls.length===0,'a skill without scripts does not touch the sandbox');
 // A model that never answers is stopped after the step limit.
 plan.splice(0,plan.length,...Array.from({length:20},()=>({action:'read',path:'шаблон.md'})));
 assert(/Не успел закончить навык/.test((await plain.turn({skill:retro,question:'Проведи ретро'})).text));
 console.log('Skill runtime: English and Russian skills, references by sections, safe paths, scripts in the sandbox with the whole folder, packages with consent, output files, no Docker and step limit OK');
})().catch(e=>{console.error(e);process.exit(1);});
