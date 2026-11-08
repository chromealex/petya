// Petya's own coding agent: worktree isolation, tools, the model loop (tool calls and JSON fallback),
// independent test verification, accept/keep/discard and chat routing. A scripted fake model, real git.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {CoderWorkspace,split,allowed,scan}=require('../src/extensions/coder/workspace.cjs');
const agent=require('../src/extensions/coder/agent.cjs');
const intent=require('../src/extensions/coder/intent.cjs');
const provider=require('../src/extensions/coder/desktop-reply.cjs');
const feature=require('../src/extensions/coder/feature.cjs');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-coder-'));
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'T',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'T',GIT_COMMITTER_EMAIL:'t@t'}}).trim();
function repo(name){
 const dir=path.join(tmp,name);fs.mkdirSync(dir);
 git(dir,'init','-q','-b','main');
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,scripts:{test:'node test.js'}}));
 fs.writeFileSync(path.join(dir,'math.js'),'function add(a, b) {\n  return a - b;\n}\nmodule.exports = { add };\n');
 fs.writeFileSync(path.join(dir,'test.js'),"const assert = require('assert');\nconst { add } = require('./math');\nassert.strictEqual(add(2, 3), 5);\nconsole.log('ok');\n");
 fs.writeFileSync(path.join(dir,'.env'),'TOKEN=secret\n');fs.writeFileSync(path.join(dir,'.gitignore'),'.env\nnode_modules\n');
 fs.mkdirSync(path.join(dir,'node_modules'));fs.writeFileSync(path.join(dir,'node_modules','dep.js'),'');
 git(dir,'add','-A');git(dir,'-c','user.name=T','-c','user.email=t@t','commit','-qm','init');
 return dir;
}
const call=(name,args)=>({tool_calls:[{id:name+Math.random(),function:{name,arguments:args}}],content:''});
function scripted(replies){const seen=[];const chat=async request=>{seen.push(request);const next=replies.shift();if(typeof next==='function')return next(request);if(next instanceof Error)throw next;assert(next,'model asked more times than scripted');return next;};chat.seen=seen;return chat;}

(async()=>{
 // Command and path safety.
 assert.deepEqual(split('npm run "test:unit"'),['npm','run','test:unit']);
 for(const bad of ['npm test; rm -rf ~','npm test && curl x','echo $HOME','node a.js > out','git push'])assert.throws(()=>{const p=split(bad);const problem=allowed(p);if(problem)throw Error(problem);},/оболочки|не разрешен/,bad);
 for(const bad of [['npm','publish'],['node','-e','1'],['python3','-c','1'],['curl','x'],['rm','-rf','/'],['node','../x.js'],['make','install']])assert.notEqual(allowed(bad),'',bad.join(' '));
 for(const good of [['npm','test'],['npm','run','lint'],['pytest','-q'],['go','test','./...'],['node','test.js'],['git','diff']])assert.equal(allowed(good),'',good.join(' '));
 assert.match(scan('require("fs").rmSync(os.homedir())\nexec("rm -rf ~/")'),/удаление/);assert.equal(scan('const x = a - b;'),'');

 const main=repo('app');
 const workspace=new CoderWorkspace({root:path.join(tmp,'worktrees')});
 const run=await workspace.create(main,'Почини сложение в math.js');
 assert.match(run.branch,/^petya\/pochini-slozhenie-v-math-js-[0-9a-f]{6}$/);
 assert(fs.existsSync(path.join(run.path,'math.js'))&&fs.lstatSync(path.join(run.path,'node_modules')).isSymbolicLink(),'worktree with linked dependencies');
 await assert.rejects(workspace.read(run,'../app/math.js'),/внутри проекта/);
 await assert.rejects(workspace.read(run,'.env'),/секрет/);
 await assert.rejects(workspace.write(run,'.git/config','x'),/\.git/);
 await assert.rejects(workspace.write(run,'node_modules/dep.js','x'),/зависимости/);
 fs.symlinkSync('/etc',path.join(run.path,'etc-link'));
 await assert.rejects(workspace.read(run,'etc-link/hosts'),/за пределы/);fs.unlinkSync(path.join(run.path,'etc-link'));
 const listed=await workspace.list(run);assert(listed.entries.includes('math.js')&&!listed.entries.some(e=>e.startsWith('node_modules')),'list hides dependencies');
 assert.match((await workspace.search(run,'a - b')).matches[0],/^math\.js:2:/);
 assert.deepEqual((await workspace.search(run,'nothing-here')).matches,[]);
 assert.equal(await workspace.testCommand(run),'npm test');
 await assert.rejects(workspace.edit(run,'math.js','return a-b;','x'),/не найден.*Похожая строка 2|не найден/);

 // The loop: look, read, edit, finish; tests run independently before the report.
 let chat=scripted([
  call('list_files',{}),
  call('read_file',{path:'math.js'}),
  call('edit_file',{path:'math.js',old:'  return a - b;',new:'  return a + b;'}),
  call('finish',{summary:'Исправил сложение в add: был минус. Тесты прошли.'})
 ]);
 const steps=[];
 let result=await agent.run({task:'Почини сложение',workspace,record:run,chat,report:l=>steps.push(l),testCommand:'npm test'});
 assert.equal(result.changed,true);assert.equal(result.verification.ok,true,result.verification.output);
 assert.match(result.summary,/Исправил/);assert.deepEqual(steps.slice(0,3),['Смотрю файлы','Читаю math.js','Правлю math.js']);
 assert(chat.seen[0].tools.some(t=>t.function.name==='edit_file'),'native tool calls');
 assert.match(chat.seen[0].messages.find(m=>m.role==='user').content,/"test_command":"npm test"/);
 assert.equal(fs.readFileSync(path.join(main,'math.js'),'utf8').includes('a - b'),true,'project folder untouched before accept');
 const diff=await workspace.diff(run);
 assert.deepEqual(diff.files.map(f=>[f.path,f.added,f.removed]),[['math.js',1,1]]);assert.match(diff.patch,/\+  return a \+ b;/);

 // Accept merges into the project's branch and removes the worktree and the branch.
 const accepted=await workspace.accept(run,'Петя: почини сложение');
 assert.deepEqual([accepted.merged,accepted.into],[true,'main']);
 assert.match(fs.readFileSync(path.join(main,'math.js'),'utf8'),/a \+ b/);
 assert(!fs.existsSync(run.path),'worktree removed');assert.equal(git(main,'branch','--list','petya/*'),'');
 assert.match(git(main,'log','-1','--format=%s'),/Петя: почини сложение/,'fast-forward when the project did not move');

 // Failing tests are fed back; JSON fallback for models without tool support.
 const second=await workspace.create(main,'Добавь умножение');
 const json=r=>({content:JSON.stringify(r)});
 chat=scripted([
  Error('registry.ollama.ai/library/tiny does not support tools'),
  json({tool:'write_file',args:{path:'mul.js',content:'module.exports = (a, b) => a + b;\n'}}),
  json({tool:'write_file',args:{path:'mul.test.js',content:"require('assert').strictEqual(require('./mul')(2, 3), 6);\n"}}),
  json({tool:'finish',args:{summary:'Добавил mul.'}}),
  request=>{assert.match(request.messages.at(-1).content,/Тесты падают/);assert.match(request.messages.at(-2).content,/Проверка не прошла/);return json({tool:'edit_file',args:{path:'mul.js',old:'a + b',new:'a * b'}});},
  json({tool:'finish',args:{summary:'Добавил mul и исправил его после упавшего теста.'}})
 ]);
 fs.writeFileSync(path.join(second.path,'package.json'),JSON.stringify({scripts:{test:'node mul.test.js'}}));
 result=await agent.run({task:'Добавь умножение',workspace,record:second,chat,testCommand:'npm test'});
 assert.equal(result.verification.ok,true);assert.match(result.summary,/исправил/);
 assert.equal(chat.seen[1].format.type,'object');assert.equal(chat.seen[1].tools,undefined);
 assert(result.steps.some(s=>s.label==='Проверка: npm test'&&!s.ok)&&result.steps.at(-1).ok,'failed check recorded, then passed');

 // Dangerous code is not run; keep leaves a commit on the branch; uncommitted project changes block merge.
 // The sample must stay harmless even if the scan ever misses it: it names a folder that does not exist.
 await workspace.write(second,'clean.js','require("fs").rmSync(require("path").join(require("os").homedir(), "petya-coder-test-missing-dir"), {force:true})\n');
 await assert.rejects(workspace.exec(second,'node clean.js'),/опасное действие/);
 await workspace.remove(second,'clean.js');
 await workspace.write(second,'home.js','console.log(require("os").homedir(), process.env.SECRET_TOKEN || "no-secret")\n');
 process.env.SECRET_TOKEN='leak';const home=await workspace.exec(second,'node home.js');delete process.env.SECRET_TOKEN;
 assert.equal(home.output.trim(),path.join(tmp,'worktrees','.home')+' no-secret','commands get a stand-in home and no secrets');
 await workspace.remove(second,'home.js');
 fs.appendFileSync(path.join(main,'test.js'),'// local edit\n');
 await assert.rejects(workspace.accept(second,'Петя: умножение'),/незакоммиченные/);
 git(main,'checkout','--','test.js');
 const kept=await workspace.accept(second,'Петя: умножение',{merge:false});
 assert.equal(kept.merged,false);assert.equal(git(main,'branch','--list',second.branch).replace(/^\*?\s*/,''),second.branch);
 assert.match(git(main,'log','-1','--format=%s',second.branch),/умножение/);assert(!fs.existsSync(path.join(main,'mul.js')));
 const third=await workspace.create(main,'x');await workspace.write(third,'a.txt','a');await workspace.discard(third);
 assert(!fs.existsSync(third.path));assert.equal(git(main,'branch','--list',third.branch),'');

 // Step limit and a model that never calls tools.
 const fourth=await workspace.create(main,'loop');
 result=await agent.run({task:'x',workspace,record:fourth,chat:async()=>call('list_files',{depth:2}),maxSteps:5});
 assert.match(result.summary,/предела шагов/);assert(result.steps.length<=3,'repeated reads are cut off');
 await assert.rejects(agent.run({task:'x',workspace,record:fourth,chat:async()=>({content:'Я бы сделал так…'})}),/не вызывает инструменты/);
 await workspace.discard(fourth);

 // Intent: coding requests vs other handlers.
 for(const t of ['Петя, напиши функцию сложения в utils.js','Добавь тесты для parseDate','Исправь баг в модуле авторизации','Отрефактори src/main.cjs','Как программист, добавь кеширование','Сделай в моём проекте экспорт в CSV','Добавь документацию к функции sum'])assert(intent.isCoding(t),t);
 for(const t of ['Напиши письмо Ивану','Отдай кодексу задачу исправить функцию','Почини билд','Создай задачу в Jira про баг','Сделай коммит','Объясни, как работает функция parse','Сделай тестовую задачу','Вычисли через Python сумму','Создай ветку feature/login','Покажи мои задачи'])assert(!intent.isCoding(t),t);
 assert.deepEqual(['Прими','влей.','Оставь в ветке','Отклони правки','покажи дифф','ок'].map(intent.decision),['accept','accept','keep','discard','show','']);
 const openTopic={codingRunId:'r',codingRuns:[{id:'r',state:'review'}]};
 assert(provider.matches('а ещё добавь тест',{topic:openTopic})&&provider.matches('прими',{topic:openTopic}));
 assert(!provider.matches('прими',{topic:{}})&&!provider.matches('Какая погода?',{topic:openTopic}));

 // The feature in a chat: start → card → follow-up in the same worktree → keep.
 const project=repo('chat');
 const topic={id:'t1',projectId:'p',messages:[]};
 const queue=[call('edit_file',{path:'math.js',old:'a - b',new:'a + b'}),call('finish',{summary:'Исправил add.'}),
  call('write_file',{path:'README.md',content:'# chat\n'}),call('finish',{summary:'Добавил README.'})];
 const s={settings:{model:'qwen3.5:9b',coderModel:'qwen3-coder:30b',coderRun:'tests',coderSteps:'20',ollamaUrl:'http://127.0.0.1:11434/api/chat'},coderRoot:path.join(tmp,'chat-worktrees'),
  dialogue:{active:()=>topic,persist(){},rememberAction(command,text){topic.messages.push({role:'user',text:command},{role:'assistant',text});}},
  gitWorkspace:{discover:async()=>({repositories:[project],selected:project,folders:[project]})},requestProgress:{report(){}},
  request:async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.model,'qwen3-coder:30b');return {message:queue.shift()};}};
 const {coder}=feature.setup(s);s.coder=coder;
 const check=()=>{};
 let reply=await provider.turn(s,'Исправь функцию add в math.js',{topic},check);
 const card=topic.messages.at(-1).codingRun;
 assert.equal(card.state,'review');assert.equal(card.verification.ok,true);assert.deepEqual(card.files.map(f=>f.path),['math.js']);
 assert.match(reply.text,/Исправил add\. Проверка «npm test» прошла\. .*«прими»/);
 reply=await provider.turn(s,'а ещё добавь README',{topic},check);
 assert.deepEqual(topic.messages.at(-1).codingRun.files.map(f=>f.path).sort(),['README.md','math.js']);
 assert.equal(topic.messages.at(-2).text,'а ещё добавь README','the user sees their own words');
 reply=await provider.turn(s,'Оставь в ветке',{topic},check);
 assert.match(reply.text,/Сохранил коммит в ветке petya\//);assert.equal(topic.codingRuns[0].state,'kept');
 assert(topic.messages.filter(m=>m.codingRun).every(m=>m.codingRun.state==='kept'),'old cards lose their buttons');
 assert(!provider.matches('прими',{topic}),'nothing waits for a decision');
 assert.equal(coder.current(topic),null);
 const validated={coderModel:'bad model;rm',coderRun:'x',coderSteps:'5'};feature.validate(validated);
 assert.deepEqual(validated,{coderModel:'',coderRun:'tests',coderSteps:'40'});

 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Coder: worktree isolation, safe paths and commands, tool loop with JSON fallback, independent test check with fix-up, accept/keep/discard, chat follow-ups and routing');
})().catch(e=>{console.error(e);fs.rmSync(tmp,{recursive:true,force:true});process.exit(1);});
