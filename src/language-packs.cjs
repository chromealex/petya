const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const catalog=require('./language-catalog.json');
class LanguagePacks{
 constructor({directory,roots,fetcher=fetch}){Object.assign(this,{directory,roots,fetcher});this.pending=new Map();}
 installed(code){if(['ru','en'].includes(code))return true;const item=catalog[code];if(!item)return false;try{return crypto.createHash('sha256').update(fs.readFileSync(path.join(this.directory,code,'numbers.py'))).digest('hex')===item.sha256;}catch{return false;}}
 list(){return [{code:'ru',label:'Русский',installed:true},{code:'en',label:'Английский',installed:true},...Object.entries(catalog).map(([code,item])=>({code,label:item.label,installed:this.installed(code),downloading:this.pending.has(code)}))];}
 install(code){if(!catalog[code])return Promise.reject(Error('Этот язык пока недоступен.'));if(this.installed(code))return Promise.resolve(this.list());if(this.pending.has(code))return this.pending.get(code);const task=this.download(code).finally(()=>this.pending.delete(code));this.pending.set(code,task);return task;}
 async download(code){const item=catalog[code];const response=await this.fetcher('https://raw.githubusercontent.com/savoirfairelinux/num2words/v0.5.14/num2words/lang_'+item.module+'.py',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Не удалось скачать язык. Повтори загрузку.');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100000||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Языковой пакет не прошёл проверку.');const dir=path.join(this.directory,code);fs.mkdirSync(dir,{recursive:true});const temp=path.join(dir,'numbers.download');try{fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,path.join(dir,'numbers.py'));}finally{fs.rmSync(temp,{force:true});}return this.list();}
 async check(text,preferred='ru'){
  if(typeof text!=='string'||text.length>12000)throw Error('Слишком длинный текст.');
  const root=this.roots.find(root=>fs.existsSync(path.join(root,'runtime/tts-multilingual/bin/python')));
  if(!root)return {missing:[],unavailable:true};
  return new Promise((resolve,reject)=>{const child=spawn(path.join(root,'runtime/tts-multilingual/bin/python'),[path.join(__dirname,'voice_language.py'),this.directory],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});let data='';const timer=setTimeout(()=>{child.kill();reject(Error('Не удалось определить язык.'));},10000);child.stdout.on('data',s=>{data+=s;if(data.length>20000)child.kill();});child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Не удалось определить язык.');resolve(JSON.parse(data));}catch(e){reject(e);}});child.stdin.end(JSON.stringify({text,preferred}));});
 }
}
module.exports={LanguagePacks};
