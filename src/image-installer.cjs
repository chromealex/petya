const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const phases={environment:'Подготавливаю окружение…',dependencies:'Скачиваю и устанавливаю компоненты…',model:'Скачиваю модель изображений…',verifying:'Проверяю установленную модель…'};
class ImageInstaller{
 constructor({root,roots=[],ready,spawnProcess=spawn,run=promisify(execFile),statfs=fs.promises.statfs,platform=process.platform}){Object.assign(this,{root,roots,ready,spawnProcess,run,statfs,platform});this.state={phase:'idle',busy:false,message:'Не установлен. Модель загружается только по кнопке.'};this.child=null;this.job=null;}
 status(){return {...this.state,ready:this.ready()};}
 start(){if(this.job||this.ready())return this.status();this.cancelled=false;this.state={phase:'preparing',busy:true,message:'Проверяю свободное место и компоненты…'};this.job=this.install().catch(error=>{this.state={phase:this.cancelled?'cancelled':'error',busy:false,message:this.cancelled?'Установка остановлена. Можно повторить позже.':error.message};}).finally(()=>{this.child=null;this.job=null;});return this.status();}
 async install(){
  await fs.promises.mkdir(this.root,{recursive:true});const disk=await this.statfs(this.root);if(Number(disk.bavail)*Number(disk.bsize)<6*1024**3)throw Error('Недостаточно места. Освободите 6 ГБ и нажмите «Установить» ещё раз.');
  const binary=this.platform==='win32'?'Scripts/python.exe':'bin/python';
  const candidates=[...this.roots.flatMap(root=>['images','tts','asr'].map(name=>[path.join(root,'runtime',name,binary),[]])),...this.platform==='win32'?[['py',['-3.12']],['py',['-3.11']],['py',['-3.10']],['python',[]]]:[['/opt/homebrew/bin/python3.12',[]],['/opt/homebrew/bin/python3.11',[]],['/opt/homebrew/bin/python3.10',[]],['python3',[]]]];
  let python;
  for(const [file,args]of candidates){if(this.cancelled)throw Error('Отменено');try{await this.run(file,[...args,'-c','import sys, venv; sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,12) else 1)'],{timeout:5000,windowsHide:true});python={file,args};break;}catch{}}
  if(this.cancelled)throw Error('Отменено');
  if(!python)throw Error('Нужен Python 3.10–3.12. Установите Python с python.org, затем повторите установку генератора.');
  await new Promise((resolve,reject)=>{
   const child=this.spawnProcess(python.file,[...python.args,'-u',path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'setup-images.py'),this.root],{shell:false,windowsHide:true,detached:this.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUNBUFFERED:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});this.child=child;let errors='',buffer='';
   const timer=setTimeout(()=>{this.cancel();},2*60*60*1000);
   child.stdout.on('data',chunk=>{buffer+=chunk;const lines=buffer.split(/\r?\n/);buffer=lines.pop().slice(-4000);for(const line of lines){const phase=line.replace(/^PETYA_PHASE:/,'');if(phases[phase]&&!this.cancelled)this.state={phase,busy:true,message:phases[phase]};}});
   child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-6000);});
   child.once('error',()=>{clearTimeout(timer);reject(Error('Не удалось запустить установщик. Повторите установку.'));});
   child.once('close',code=>{clearTimeout(timer);if(this.cancelled)return reject(Error('Отменено'));if(code!==0)return reject(Error(/No space left|Errno 28/i.test(errors)?'Во время установки закончилось место на диске. Освободите 6 ГБ и повторите.':'Не удалось скачать или установить модель. Проверьте интернет и повторите установку.'));if(!this.ready())return reject(Error('Проверка модели не завершена. Повторите установку.'));resolve();});
  });
  this.state={phase:'done',busy:false,message:'Готово. Напишите Пете: «Нарисуй кота-космонавта».'};
 }
 cancel(){if(!this.job)return this.status();this.cancelled=true;this.state={phase:'stopping',busy:true,message:'Останавливаю установку…'};const child=this.child;if(child){if(this.platform==='win32')this.run('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>child.kill());else try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}}return this.status();}
}
module.exports={ImageInstaller};
