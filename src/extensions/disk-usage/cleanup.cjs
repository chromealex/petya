// «Место на диске», cleanup: runs only from the card, after the user confirmed the exact list.
// Only paths that the scan itself listed for that row can be removed: they go to the Trash (Electron
// shell.trashItem), never deleted outright. Ollama models are removed only with `ollama rm <name>`.
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');

// The Ollama command line on macOS and Windows (a Finder-launched app has a short PATH).
function ollamaBinary({platform=process.platform,env=process.env,home,exists=fs.existsSync}={}){
 const exe=platform==='win32'?'ollama.exe':'ollama';
 const dirs=[...String(env.PATH||env.Path||'').split(path.delimiter).filter(Boolean),
  ...(platform==='darwin'?['/opt/homebrew/bin','/usr/local/bin','/Applications/Ollama.app/Contents/Resources']:[]),
  ...(platform==='win32'?[path.join(env.LOCALAPPDATA||path.join(home||'','AppData','Local'),'Programs','Ollama')]:[])];
 for(const dir of dirs){const file=path.join(dir,exe);if(exists(file))return file;}
 return null;
}
function run(file,args,{timeout=60000}={}){
 return new Promise((resolve,reject)=>execFile(file,args,{timeout,windowsHide:true,shell:false},(error,stdout,stderr)=>error?reject(Object.assign(error,{stderr:String(stderr||'')})):resolve(String(stdout||''))));
}

// `targets`: what the user confirmed (paths for trash rows, model names for Ollama). Every one must be an item of
// the row in the stored scan; anything else is refused before the first removal.
async function clean(category,targets,{trashItem,runner=run,ollama=()=>ollamaBinary()}={}){
 if(!category)throw Error('Результат проверки устарел. Проверьте диск ещё раз.');
 if(!category.clean)throw Error('Эту категорию Петя не чистит: '+category.note);
 const wanted=[...new Set((Array.isArray(targets)?targets:[]).map(String))];
 if(!wanted.length)throw Error('Ничего не выбрано.');
 const key=category.clean==='ollama'?'name':'path';
 const items=wanted.map(t=>category.items.find(i=>i[key]===t&&!i.removed));
 if(items.some(i=>!i))throw Error('Список изменился. Проверьте диск ещё раз.');
 const removed=[],failed=[];
 if(category.clean==='ollama'){
  const bin=ollama();if(!bin)throw Error('Не нашёл команду ollama. Удалите модель в приложении Ollama или командой «ollama rm».');
  for(const item of items){
   try{await runner(bin,['rm',item.name]);item.removed=true;removed.push(item);}
   catch(e){failed.push({target:item.name,error:(e.stderr||e.message).trim().slice(0,200)});}
  }
 }else{
  if(typeof trashItem!=='function')throw Error('Корзина недоступна.');
  for(const item of items){
   try{
    const st=fs.lstatSync(item.path);
    if(st.isSymbolicLink())throw Error('это ссылка, не трогаю');
    await trashItem(path.resolve(item.path));item.removed=true;removed.push(item);
   }catch(e){failed.push({target:item.path,error:e.code==='ENOENT'?'уже нет на диске':e.message});if(e.code==='ENOENT')item.removed=true;}
  }
 }
 const freed=removed.reduce((a,i)=>a+i.bytes,0);
 category.bytes=Math.max(0,category.bytes-freed);
 return {removed:removed.map(i=>i[key]),failed,freed};
}
module.exports={clean,ollamaBinary,run};
