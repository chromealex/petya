const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const limit=512*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function read(file){
  if(typeof file!=='string'||!path.isAbsolute(file)||file.startsWith('\\\\')||await fs.realpath(file)!==file)throw Error('Исходный путь изменился. Прикрепите файл заново.');
  const stat=await fs.stat(file);
  if(!stat.isFile()||stat.size>limit)throw Error('Редактор поддерживает текстовые файлы до 512 КБ.');
  const bytes=await fs.readFile(file),text=bytes.toString('utf8');
  if(bytes.length>limit||text.includes('\0')||!Buffer.from(text).equals(bytes))throw Error('Для правки нужен текстовый файл UTF-8.');
  return {text,hash:hash(bytes),mode:stat.mode,ino:stat.ino,dev:stat.dev};
}
async function load(row,s,check){
  const file=row.file.localSourcePath,before=await read(file);check();
  return {target:{file},before,editor:{kind:'file',text:before.text},title:path.basename(file)};
}
function prepare(record,input){
  if(typeof input.text!=='string'||Buffer.byteLength(input.text)>limit)throw Error('Текст должен быть не длиннее 512 КБ.');
  const before=record.before.text;
  let after=input.text;
  if(before.includes('\r\n')&&!before.replaceAll('\r\n','').includes('\n'))after=after.replace(/\r?\n/g,'\r\n');
  if(after.includes('\0')||Buffer.from(after).toString('utf8')!==after)throw Error('Текст содержит недопустимые символы.');
  if(before===after)throw Error('Текст не изменился.');
  return {after,rows:[{label:'Содержимое файла',before,after}]};
}
async function write(record,after,expected,check,starting){
  const file=record.target.file,original=await read(file);
  if(original.hash!==expected)throw Error('Файл изменился после предпросмотра. Подготовьте правку заново.');
  check();
  const temp=path.join(path.dirname(file),'.petya-'+randomUUID()+'.tmp');
  let handle;
  try{
    handle=await fs.open(temp,'wx',original.mode&0o777);
    await handle.chmod(original.mode&0o777);await handle.writeFile(after,'utf8');await handle.sync();await handle.close();handle=null;
    const current=await read(file);
    if(current.hash!==expected||current.ino!==original.ino||current.dev!==original.dev)throw Error('Файл изменился во время подготовки.');
    check();starting();
    await fs.rename(temp,file);
    const verified=await read(file);
    if(verified.hash!==hash(Buffer.from(after)))throw Error('Не удалось подтвердить сохранённый текст.');
    return {text:'Сохранён файл «'+path.basename(file)+'».',canUndo:true,file:true};
  }finally{await handle?.close();await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function apply(record,s,check,starting){
  return write(record,record.plan.after,record.before.hash,check,starting);
}
async function undo(record,s,check){
  const current=await read(record.target.file);check();
  if(current.hash!==hash(Buffer.from(record.plan.after)))throw Error('После правки файл изменился. Откат остановлен.');
  return {target:record.target,before:current,plan:{after:record.before.text,rows:[{label:'Содержимое файла',before:current.text,after:record.before.text}]},title:record.title};
}
module.exports={load,prepare,apply,undo};
