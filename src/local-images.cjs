const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
function imagePrompt(command){
 const value=String(command||'').trim().replace(/^петя[\s,:.!—-]*/iu,'').replace(/^пожалуйста[,\s]+/iu,'');
 const match=value.match(/^(?:нарисуй|изобрази|(?:создай|сгенерируй|сделай)\s+(?:мне\s+)?(?:картинку|изображение|иллюстрацию|рисунок))(?=\s|:|$)[\s:]*(.*)$/iu);
 return match?match[1].replace(/^пожалуйста[,\s]+/iu,'').trim():null;
}
function png(value){
 if(typeof value!=='string'||value.length>8*1024*1024||! /^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Некорректный ответ генератора изображений.');
 const bytes=Buffer.from(value,'base64');
 if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Генератор не вернул PNG.');
 return bytes;
}
class LocalImages{
 constructor({roots,spawnProcess=spawn,timeout=600000}){Object.assign(this,{roots,spawnProcess,timeout});this.pending=null;this.epoch=0;this.turnBusy=false;}
 runtime(){const binary=process.platform==='win32'?'Scripts/python.exe':'bin/python';const root=this.roots.find(r=>fs.existsSync(path.join(r,'runtime/images',binary))&&fs.existsSync(path.join(r,'runtime/models/sd-turbo/.petya-ready')));return root?{python:path.join(root,'runtime/images',binary),model:path.join(root,'runtime/models/sd-turbo')}:null;}
 status(){return {ready:!!this.runtime(),busy:!!this.pending||this.turnBusy};}
 generate(prompt){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>4000)return Promise.reject(Error('Опишите, что нарисовать, — до 4000 символов.'));
  if(this.pending)return Promise.reject(Error('Дождитесь текущего изображения или остановите генерацию.'));
  const runtime=this.runtime();if(!runtime)return Promise.reject(Error('Локальная модель изображений ещё не установлена. Откройте «Подключения → Генерация изображений» и нажмите «Установить».'));
  return new Promise((resolve,reject)=>{
   const child=this.spawnProcess(runtime.python,['-u',path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'local-images.py'),runtime.model],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
   const finish=(error,result)=>{if(this.pending?.child!==child)return;clearTimeout(this.pending.timer);this.pending=null;error?reject(error):resolve(result);};
   this.pending={child,finish,timer:setTimeout(()=>{finish(Error('Генерация не завершилась за 10 минут.'));child.kill();},this.timeout)};
   child.stderr.resume();child.stdin.on('error',()=>finish(Error('Не удалось передать описание генератору.')));
   child.once('error',()=>finish(Error('Не удалось запустить локальный генератор.')));
   child.stdout.on('data',chunk=>{output+=chunk;if(output.length>9*1024*1024){finish(Error('Слишком большой ответ генератора.'));child.kill();}});
   child.once('close',code=>{try{const result=JSON.parse(output.trim());if(code!==0||result.error)throw Error('Генерация не удалась: '+(result.error||'процесс завершился'));png(result.image);finish(null,result);}catch(error){finish(error);}});
   child.stdin.end(JSON.stringify({prompt:prompt.trim()})+'\n');
  });
 }
 stop(){this.epoch++;const pending=this.pending;if(pending){pending.finish(Error('Генерация изображения остановлена.'));pending.child.kill();}}
}
module.exports={LocalImages,imagePrompt,png};
