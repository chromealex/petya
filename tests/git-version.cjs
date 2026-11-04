process.env.GIT_CONFIG_GLOBAL=require('node:os').devNull;process.env.GIT_CONFIG_NOSYSTEM='1';
// «Посмотри версию в гите» must reach git (tag, describe, manifests) instead of the model.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');const exec=promisify(execFile);
const {GitWorkspace,commandRoute}=require('../src/git-workspace.cjs');
const run=(root,args)=>exec('git',['-C',root,...args],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}});
(async()=>{
 for(const t of ['Посмотри версию в гите','Какая версия проекта?','Какой последний тег?','Посмотри версию игры'])assert.equal(commandRoute(t)?.action,'version',t);
 for(const t of ['Посмотри гит','Что в гите нового?','Скажи, сколько веток в гите'])assert.ok(commandRoute(t),t);
 for(const t of ['Как сделать git push?','Не делай git push','«git push»','Какая версия Unity лучше?','Что такое git?','Какая погода?'])assert.equal(commandRoute(t),null,t);
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'petya-git-version-'));try{
  const root=path.join(base,'repo');await fs.mkdir(root);await run(root,['init','-b','main']);
  for(const [k,v] of [['user.name','Petya Test'],['user.email','test@example.invalid'],['commit.gpgsign','false'],['tag.gpgsign','false']])await run(root,['config',k,v]);
  const git=new GitWorkspace({context:()=>({id:'p',name:'Test',folder:root})});
  assert.match((await git.execute({action:'version'})).text,/ещё нет коммитов/);
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'x',version:'1.4.0'}));await fs.mkdir(path.join(root,'ProjectSettings'));await fs.writeFile(path.join(root,'ProjectSettings','ProjectSettings.asset'),'PlayerSettings:\n  bundleVersion: 2.7.1\n');
  await run(root,['add','-A']);await run(root,['commit','-m','Release']);let r=(await git.execute({action:'version'})).text;
  assert.match(r,/Тегов версий в репозитории нет/);assert.match(r,/package\.json: 1\.4\.0/);assert.match(r,/bundleVersion\): 2\.7\.1/);assert.match(r,/Последний коммит: \w+ \d{4}-\d\d-\d\d Release/);
  await run(root,['tag','v2.7.1']);await fs.writeFile(path.join(root,'a.txt'),'x');await run(root,['add','a.txt']);await run(root,['commit','-m','After release']);
  r=(await git.execute({action:'version'})).text;assert.match(r,/Последний тег: v2\.7\.1 \(\d{4}/);assert.match(r,/Текущее состояние: v2\.7\.1-1-g\w+/);assert.match(r,/After release/);
 }finally{await fs.rm(base,{recursive:true,force:true});}
 console.log('Git version: routing of version questions, tags, describe, package.json and Unity bundleVersion passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
