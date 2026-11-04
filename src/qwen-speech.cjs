const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
class QwenSpeech{
 constructor({roots,spawnProcess=spawn,exists=fs.existsSync,platform=process.platform,timeout=120000}){
  Object.assign(this,{spawnProcess,timeout});this.requests=new Map();this.sequence=0;
  this.root=platform==='darwin'&&roots.find(root=>exists(path.join(root,'runtime/asr/bin/python'))&&exists(path.join(root,'runtime/models/qwen3-asr-1.7b/READY')));
 }
 get available(){return !!this.root;}
 ensure(){
  if(this.starting)return this.starting;
  if(!this.available)return Promise.reject(Error('Qwen3-ASR не установлен.'));
  const child=this.spawnProcess(path.join(this.root,'runtime/asr/bin/python'),['-u',path.join(__dirname,'qwen-speech.py'),path.join(this.root,'runtime/models/qwen3-asr-1.7b')],{shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});this.child=child;
  this.starting=new Promise((resolve,reject)=>{this.ready={resolve,reject};this.startTimer=setTimeout(()=>this.stop('Qwen3-ASR не успел загрузиться.'),this.timeout);});
  child.stderr.resume();child.once('error',()=>{if(this.child===child)this.stop('Не удалось запустить Qwen3-ASR.');});child.once('exit',()=>{if(this.child===child)this.stop('Qwen3-ASR завершился. Включи микрофон снова.');});child.stdin.on('error',()=>{if(this.child===child)this.stop('Qwen3-ASR недоступен.');});
  createInterface({input:child.stdout}).on('line',line=>{if(this.child!==child)return;let result;try{result=JSON.parse(line);}catch{return;}
   if(result.ready){clearTimeout(this.startTimer);this.ready?.resolve({ready:true,concurrency:1,engine:'Qwen3-ASR 1.7B',message:'Распознавание готово.'});this.ready=null;return;}
   const request=this.requests.get(result.id);if(!request)return;this.requests.delete(result.id);clearTimeout(request.timer);
   if(result.error||typeof result.text!=='string')request.reject(Error('Ошибка Qwen3-ASR: '+String(result.error||'нет текста').slice(0,250)));else request.resolve(result.text);
  });return this.starting;
 }
 async transcribe(audio){await this.ensure();if(!this.child)throw Error('Распознавание остановлено.');return new Promise((resolve,reject)=>{const id=++this.sequence;this.requests.set(id,{resolve,reject,timer:setTimeout(()=>this.stop('Распознавание Qwen3-ASR не ответило вовремя.'),30000)});this.child.stdin.write(JSON.stringify({id,audio:Buffer.from(audio).toString('base64')})+'\n');});}
 stop(message='Распознавание остановлено.'){
  const child=this.child;this.child=null;clearTimeout(this.startTimer);this.ready?.reject(Error(message));this.ready=null;this.starting=null;
  for(const request of this.requests.values()){clearTimeout(request.timer);request.reject(Error(message));}this.requests.clear();child?.kill();
 }
}
module.exports={QwenSpeech};
