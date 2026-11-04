// Isolated Electron profile; no model download, real account access or settings edits.
process.env.PETYA_SMOKE_TEST='1';
const fs=require('node:fs');
const {ImageInstaller}=require('../src/image-installer.cjs');
ImageInstaller.prototype.start=function(){this.state={phase:'model',busy:true,message:'Скачиваю модель изображений…'};return this.status();};
ImageInstaller.prototype.cancel=function(){this.state={phase:'cancelled',busy:false,message:'Установка остановлена.'};return this.status();};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  view('settings');const card=document.getElementById('image-install-card');if(!card)throw Error('Missing image installation card');window.revealSettings(card);
  if(card.classList.contains('ux-filtered')||card.hidden)throw Error('Image integration hidden');
  const button=document.getElementById('image-install');if(button.disabled)throw Error('Install not available');button.click();await new Promise(r=>setTimeout(r,200));
  if(!button.disabled||document.getElementById('image-install-progress').hidden)throw Error('Missing installing state');
  document.getElementById('image-install-cancel').click();await new Promise(r=>setTimeout(r,200));if(button.disabled||!document.getElementById('image-install-progress').hidden)throw Error('Cancel did not restore install');
  if(button.textContent!=='Повторить установку')throw Error('Missing retry');
  const reply=await window.petya.converse('Нарисуй кота');if(!reply.text.includes('Подключения'))throw Error('Missing setup direction');
 })()`);
 fs.writeFileSync('/tmp/petya-image-integration.png',(await win.webContents.capturePage()).toPNG());
 console.log('Image integration UI: visible card, click to install, progress, cancel, retry, chat setup direction passed.');
}};
require('../src/main.cjs');
