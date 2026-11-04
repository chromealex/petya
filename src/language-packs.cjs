const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const catalog=require('./language-catalog.json');
class LanguagePacks{
 constructor({directory,roots,fetcher=fetch,emit=()=>{}}){Object.assign(this,{directory,roots,fetcher,emit});this.pending=new Map();this.states=new Map();}
 statuses(){return [...this.states.values()];}
 update(code,phase,message,extra={}){const state={code,label:catalog[code].label,phase,message,busy:!['done','error'].includes(phase),...extra};this.states.set(code,state);this.emit(state);}

 installed(code){if(['ru','en'].includes(code))return true;const item=catalog[code];if(!item)return false;try{return crypto.createHash('sha256').update(fs.readFileSync(path.join(this.directory,code,'numbers.py'))).digest('hex')===item.sha256;}catch{return false;}}
 list(){return [{code:'ru',label:'Русский',installed:true},{code:'en',label:'Английский',installed:true},...Object.entries(catalog).map(([code,item])=>({code,label:item.label,installed:this.installed(code),downloading:this.pending.has(code)}))];}
 install(code){if(!catalog[code])return Promise.reject(Error('Этот язык пока недоступен.'));if(this.installed(code))return Promise.resolve(this.list());if(this.pending.has(code))return this.pending.get(code);const task=Promise.resolve().then(()=>this.download(code)).catch(error=>{this.update(code,'error',error.message);throw error;}).finally(()=>this.pending.delete(code));this.pending.set(code,task);return task;}
 async download(code){
  const item=catalog[code];this.update(code,'downloading','Загрузка языка…');
  const response=await this.fetcher('https://raw.githubusercontent.com/savoirfairelinux/num2words/v0.5.14/num2words/lang_'+item.module+'.py',{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Не удалось скачать язык. Повтори загрузку.');
  const total=Number(response.headers?.get('content-length'))||undefined;let received=0,bytes;
  if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];try{while(true){const part=await reader.read();if(part.done)break;received+=part.value.length;if(received>100000)throw Error('Языковой пакет не прошёл проверку.');chunks.push(Buffer.from(part.value));this.update(code,'downloading','Загрузка языка…',{received,total});}bytes=Buffer.concat(chunks);}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}}
  else bytes=Buffer.from(await response.arrayBuffer());
  this.update(code,'verifying','Проверка загруженного пакета…');
  if(bytes.length>100000||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Языковой пакет не прошёл проверку.');
  this.update(code,'installing','Установка языка…');
  const dir=path.join(this.directory,code);fs.mkdirSync(dir,{recursive:true});const temp=path.join(dir,'numbers.download');try{fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,path.join(dir,'numbers.py'));}finally{fs.rmSync(temp,{force:true});}
  this.update(code,'done','Язык установлен и готов к озвучке.');return this.list();
 }
 async check(text,preferred='ru'){
  if(typeof text!=='string'||text.length>12000)throw Error('Слишком длинный текст.');
  const root=this.roots.find(root=>fs.existsSync(path.join(root,'runtime/tts-multilingual/bin/python')));
  if(!root)return {missing:[],unavailable:true};
  return new Promise((resolve,reject)=>{const child=spawn(path.join(root,'runtime/tts-multilingual/bin/python'),[path.join(__dirname,'voice_language.py'),this.directory],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});let data='';const timer=setTimeout(()=>{child.kill();reject(Error('Не удалось определить язык.'));},10000);child.stdout.on('data',s=>{data+=s;if(data.length>20000)child.kill();});child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Не удалось определить язык.');resolve(JSON.parse(data));}catch(e){reject(e);}});child.stdin.end(JSON.stringify({text,preferred}));});
 }
}
module.exports={LanguagePacks};
