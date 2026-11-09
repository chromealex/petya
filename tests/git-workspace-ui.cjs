process.env.GIT_CONFIG_GLOBAL=require('node:os').devNull;process.env.GIT_CONFIG_NOSYSTEM='1';
process.env.PETYA_SMOKE_TEST='1';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-git-ui-'));const empty=fs.mkdtempSync(path.join(os.tmpdir(),'petya-git-empty-'));let activeFolder=root,gitReads=0;
const git=args=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
git(['init','-b','main']);git(['config','user.name','Petya Test']);git(['config','user.email','test@example.invalid']);git(['config','commit.gpgsign','false']);fs.writeFileSync(path.join(root,'example.txt'),'test\n');
const moduleGit=require('../src/extensions/git/workspace.cjs'),Real=moduleGit.GitWorkspace;
moduleGit.GitWorkspace=class extends Real{constructor(options){super({...options,context:()=>({id:'fixture',name:'Git UI fixture',folder:activeFolder})});}async execute(input){if(input.action==='status')gitReads++;return super.execute(input);}};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{try{
 await win.webContents.executeJavaScript(`(async()=>{
  await submitChatCommand('А сейчас можешь гит посмотреть');for(let i=0;i<250&&!dialogueMessages.textContent.includes('example.txt');i++)await new Promise(r=>setTimeout(r,40));if(!dialogueMessages.textContent.includes('example.txt'))throw Error('Natural Git request did not read working tree');
  await new Promise(r=>setTimeout(r,400));view('home');const card=document.getElementById('git-card');if(!card)throw Error('Git card missing');const opener=document.getElementById('project-git-open');if(!opener?.getBoundingClientRect().width)throw Error('Git button hidden');await window.openProjectGit();if(document.querySelector('#settings #git-card'))throw Error('Git is still in settings');
  const click=async text=>{const b=[...card.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw Error('Missing button '+text);b.click();for(let i=0;i<200&&b.disabled;i++)await new Promise(r=>setTimeout(r,20));if(b.disabled)throw Error('Button stuck '+text);};
  await click('Обновить');const check=card.querySelector('input[type=checkbox]');if(!check||check.value!=='example.txt')throw Error('Working tree missing');check.checked=true;await click('В коммит');if(!card.textContent.includes('в коммите'))throw Error('Stage failed');
  card.querySelector('textarea').value='Commit from panel';await click('Создать коммит');if(!card.textContent.includes('Рабочая папка чистая'))throw Error('Commit failed');await click('История');if(!card.querySelector('pre').textContent.includes('Commit from panel'))throw Error('Log missing');
  const result=await window.petya.converse('создай ветку feature/chat');if(result.error)throw Error(result.text);const state=await window.petya.feature('gitWorkspace','status');if(state.branch!=='feature/chat')throw Error('Chat route did not create branch');await click('Обновить');
 })()`);
 if(!gitReads)throw Error('Composer bypassed the Git handler');
 activeFolder=empty;
 await win.webContents.executeJavaScript(`(async()=>{
  document.querySelector('.git-project-dialog').close();const reply=await window.petya.converse('статус гита');if(!reply.gitDiscovery||reply.gitDiscovery.repositories.length)throw Error('No init offer');await showDialogueReply(reply,false);
  const button=[...dialogueChoices.querySelectorAll('button')].find(b=>b.textContent.startsWith('Создать Git'));if(!button)throw Error('Missing create Git button');button.click();for(let i=0;i<150&&button.disabled;i++)await new Promise(r=>setTimeout(r,20));const state=await window.petya.feature('gitWorkspace','status');if(state.head||state.files.some(f=>f.staged))throw Error('Init committed or staged files');
 })()`);
 if(!fs.existsSync(path.join(empty,'.git')))throw Error('Explicit init did not create repository');
 fs.writeFileSync(path.join(require('node:os').tmpdir(),'petya-git-panel.png'),(await win.webContents.capturePage()).toPNG());console.log('Git Electron UI: real status, file selection, stage, commit, log and chat branch command passed.');
}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(empty,{recursive:true,force:true});}}};
require('../src/main.cjs');
