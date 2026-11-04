process.env.GIT_CONFIG_GLOBAL=require('node:os').devNull;process.env.GIT_CONFIG_NOSYSTEM='1';process.env.PETYA_SMOKE_TEST='1';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {groups}=require('./git-natural.cjs');const base=fs.mkdtempSync(path.join(os.tmpdir(),'petya-git-chat-suite-')),root=path.join(base,'repo'),bare=path.join(base,'remote.git'),peer=path.join(base,'peer');fs.mkdirSync(root);let activeFolder=root,sequence=0,seen=[];
const git=(folder,args)=>execFileSync('git',['-C',folder,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const config=folder=>{git(folder,['config','user.name','Petya Test']);git(folder,['config','user.email','test@example.invalid']);git(folder,['config','commit.gpgsign','false']);git(folder,['config','core.autocrlf','false']);};
git(root,['init','-b','main']);config(root);fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/a.js'),'initial\n');git(root,['add','.']);git(root,['commit','-m','Initial']);git(base,['init','--bare',bare]);git(root,['remote','add','origin',bare]);git(root,['push','-u','origin','main']);git(base,['clone','--branch','main',bare,peer]);config(peer);
const moduleGit=require('../src/git-workspace.cjs'),Real=moduleGit.GitWorkspace;moduleGit.GitWorkspace=class extends Real{constructor(options){super({...options,context:()=>({id:'fixture',name:'Git natural chat',folders:[activeFolder]})});}async execute(input){seen.push(input);return super.execute(input);}async init(...args){seen.push({action:'init'});return super.init(...args);}};
const report=[];
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{try{
 for(const [kind,phrases]of Object.entries(groups))for(const phrase of phrases){
  activeFolder=root;git(root,['reset','--hard']);git(root,['switch','main']);try{git(root,['branch','-D','feature/test']);}catch{}
  if(['diff','staged','stage','unstage','commit'].includes(kind)){fs.writeFileSync(path.join(root,'src/a.js'),'changed '+(++sequence)+'\n');if(['staged','unstage','commit'].includes(kind))git(root,['add','src/a.js']);}
  if(kind==='switchBranch')git(root,['switch','-c','before-switch-'+(++sequence)]);
  if(['fetch','pull'].includes(kind)){git(root,['fetch','origin']);git(root,['reset','--hard','origin/main']);git(peer,['fetch','origin']);git(peer,['reset','--hard','origin/main']);fs.writeFileSync(path.join(peer,'remote.txt'),'remote '+(++sequence));git(peer,['add','remote.txt']);git(peer,['commit','-m','Remote '+sequence]);git(peer,['push','origin','main']);}
  if(kind==='push'){git(root,['fetch','origin']);git(root,['reset','--hard','origin/main']);fs.writeFileSync(path.join(root,'push.txt'),'push '+(++sequence));git(root,['add','push.txt']);git(root,['commit','-m','Push '+sequence]);}
  if(kind==='init'){activeFolder=path.join(base,'new-'+(++sequence));fs.mkdirSync(activeFolder);fs.writeFileSync(path.join(activeFolder,'keep.txt'),'keep');}
  const before=seen.length,head=git(root,['rev-parse','HEAD']);
  await win.webContents.executeJavaScript('submitChatCommand('+JSON.stringify(phrase)+')');
  const action=kind==='staged'?'diff':kind;assert.equal(seen.length,before+1,phrase+' bypassed Git');assert.equal(seen.at(-1).action,action,phrase);if(kind==='staged')assert(seen.at(-1).staged);
  const latest=await win.webContents.executeJavaScript("chatHistory.at(-1)?.text||''");assert(!/fatal:|error:|не завершена|Нет подготовленных/i.test(latest),phrase+': '+latest);
  if(kind==='stage')assert.equal(git(root,['diff','--cached','--name-only']),'src/a.js');
  if(kind==='unstage'){assert.equal(git(root,['diff','--cached','--name-only']),'');assert.match(fs.readFileSync(path.join(root,'src/a.js'),'utf8'),/^changed /);}
  if(kind==='commit'){assert.notEqual(git(root,['rev-parse','HEAD']),head);assert.equal(git(root,['log','-1','--format=%s']),'Исправлен вход');}
  if(kind==='createBranch')assert.equal(git(root,['branch','--show-current']),'feature/test');
  if(kind==='switchBranch')assert.equal(git(root,['branch','--show-current']),'main');
  if(kind==='fetch')assert.equal(git(root,['rev-parse','refs/remotes/origin/main']),git(peer,['rev-parse','HEAD']));
  if(kind==='pull')assert.equal(git(root,['rev-parse','HEAD']),git(peer,['rev-parse','HEAD']));
  if(kind==='push')assert.equal(git(bare,['rev-parse','refs/heads/main']),git(root,['rev-parse','HEAD']));
  if(kind==='init'){assert(fs.existsSync(path.join(activeFolder,'.git')));assert.equal(git(activeFolder,['diff','--cached','--name-only']),'');}
  report.push({phrase,action,passed:true});console.log('PASS '+phrase);
 }
 activeFolder=root;
 for(const phrase of ['Можешь создать новую ветку?','Сделай коммит','Добавь изменения в коммит']){const before=seen.length;await win.webContents.executeJavaScript('submitChatCommand('+JSON.stringify(phrase)+')');assert.equal(seen.length,before);const text=await win.webContents.executeJavaScript("chatHistory.at(-1)?.text||document.getElementById('notice').textContent");assert(text);report.push({phrase,action:'clarify',passed:true});}
 for(const phrase of ['Не делай push','Можешь не отправлять коммиты?','Как сделать коммит?','«Отправь коммиты на сервер»']){const before=seen.length,head=git(root,['rev-parse','HEAD']);await win.webContents.executeJavaScript('submitChatCommand('+JSON.stringify(phrase)+')');assert.equal(seen.length,before);assert.equal(git(root,['rev-parse','HEAD']),head);report.push({phrase,action:'no-operation',passed:true});}
 console.log('Natural Git composer suite: '+report.length+' scenarios passed with real repositories.');
}finally{fs.writeFileSync('/tmp/petya-git-natural-report.json',JSON.stringify(report,null,2));fs.rmSync(base,{recursive:true,force:true});}}};
require('../src/main.cjs');
