process.env.GIT_CONFIG_GLOBAL=require('node:os').devNull;process.env.GIT_CONFIG_NOSYSTEM='1';
process.env.PETYA_SMOKE_TEST='1';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-git-ui-'));
const git=args=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
git(['init','-b','main']);git(['config','user.name','Petya Test']);git(['config','user.email','test@example.invalid']);git(['config','commit.gpgsign','false']);fs.writeFileSync(path.join(root,'example.txt'),'test\n');
const moduleGit=require('../src/git-workspace.cjs'),Real=moduleGit.GitWorkspace;
moduleGit.GitWorkspace=class extends Real{constructor(options){super({...options,context:()=>({id:'fixture',name:'Git UI fixture',folder:root})});}};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{try{
 await win.webContents.executeJavaScript(`(async()=>{
  await new Promise(r=>setTimeout(r,400));view('settings');const card=document.getElementById('git-card');if(!card)throw Error('Git card missing');window.revealSettings(card);
  const click=async text=>{const b=[...card.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw Error('Missing button '+text);b.click();for(let i=0;i<200&&b.disabled;i++)await new Promise(r=>setTimeout(r,20));if(b.disabled)throw Error('Button stuck '+text);};
  await click('Обновить');const check=card.querySelector('input[type=checkbox]');if(!check||check.value!=='example.txt')throw Error('Working tree missing');check.checked=true;await click('В коммит');if(!card.textContent.includes('в коммите'))throw Error('Stage failed');
  card.querySelector('textarea').value='Commit from panel';await click('Создать коммит');if(!card.textContent.includes('Рабочая папка чистая'))throw Error('Commit failed');await click('История');if(!card.querySelector('pre').textContent.includes('Commit from panel'))throw Error('Log missing');
  const result=await window.petya.converse('создай ветку feature/chat');if(result.error)throw Error(result.text);const state=await window.petya.gitStatus();if(state.branch!=='feature/chat')throw Error('Chat route did not create branch');await click('Обновить');
 })()`);
 fs.writeFileSync('/tmp/petya-git-panel.png',(await win.webContents.capturePage()).toPNG());console.log('Git Electron UI: real status, file selection, stage, commit, log and chat branch command passed.');
}finally{fs.rmSync(root,{recursive:true,force:true});}}};
require('../src/main.cjs');
