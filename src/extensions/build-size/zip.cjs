// Dependency-free ZIP central-directory reader for build archives (APK, AAB, IPA are ZIP files).
// Only the end of the file and the central directory are read, in chunks, so a 1–4 GB build never sits in
// memory. ZIP64 (more than 65535 entries or sizes over 4 GB) is supported. A single small entry (a manifest,
// Info.plist, an ELF header) can be read on demand with a hard size limit.
const fs=require('node:fs/promises');
const zlib=require('node:zlib');

const EOCD=0x06054b50,LOCATOR=0x07064b50,EOCD64=0x06064b50,CENTRAL=0x02014b50,LOCAL=0x04034b50;
const MAX_ENTRIES=400000,CHUNK=1<<20;

async function readAt(handle,position,length){
 const buffer=Buffer.alloc(length);let done=0;
 while(done<length){const {bytesRead}=await handle.read(buffer,done,length-done,position+done);if(!bytesRead)break;done+=bytesRead;}
 return done<length?buffer.subarray(0,done):buffer;
}
const u64=(b,at)=>{const v=b.readBigUInt64LE(at);if(v>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Слишком большое значение в ZIP64.');return Number(v);};

// Locates the central directory: {offset, size, count}.
async function directory(handle,fileSize){
 if(fileSize<22)throw Error('Это не ZIP-архив: файл слишком короткий.');
 const tailSize=Math.min(fileSize,65557);
 const tail=await readAt(handle,fileSize-tailSize,tailSize);
 let at=-1;for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===EOCD){at=i;break;}
 if(at<0)throw Error('Это не ZIP-архив (APK, AAB и IPA — ZIP): не найден конец центрального каталога.');
 let count=tail.readUInt16LE(at+10),size=tail.readUInt32LE(at+12),offset=tail.readUInt32LE(at+16);
 if(count===0xffff||size===0xffffffff||offset===0xffffffff){
  const absolute=fileSize-tailSize+at;
  const locator=absolute>=20?await readAt(handle,absolute-20,20):null;
  if(locator?.length===20&&locator.readUInt32LE(0)===LOCATOR){
   const record=await readAt(handle,u64(locator,8),56);
   if(record.length<56||record.readUInt32LE(0)!==EOCD64)throw Error('Повреждённый ZIP64: нет записи конца каталога.');
   count=u64(record,32);size=u64(record,40);offset=u64(record,48);
  }
 }
 if(offset+size>fileSize)throw Error('Повреждённый архив: центральный каталог за пределами файла.');
 if(count>MAX_ENTRIES)throw Error('В архиве больше '+MAX_ENTRIES+' файлов — такой архив не разбираю.');
 return {offset,size,count};
}

// Parses one central record at `at` in `b`; returns null when the record is not complete in this buffer.
function record(b,at){
 if(at+46>b.length)return null;
 if(b.readUInt32LE(at)!==CENTRAL)throw Error('Повреждённый центральный каталог архива.');
 const nameSize=b.readUInt16LE(at+28),extraSize=b.readUInt16LE(at+30),commentSize=b.readUInt16LE(at+32);
 const length=46+nameSize+extraSize+commentSize;if(at+length>b.length)return null;
 let compressed=b.readUInt32LE(at+20),size=b.readUInt32LE(at+24),local=b.readUInt32LE(at+42);
 const extra=b.subarray(at+46+nameSize,at+46+nameSize+extraSize);
 // ZIP64 extra field: only the fields that are 0xFFFFFFFF in the record are present, in this order.
 for(let i=0;i+4<=extra.length;){const id=extra.readUInt16LE(i),n=extra.readUInt16LE(i+2);
  if(id===1){let p=i+4;if(size===0xffffffff&&p+8<=i+4+n){size=u64(extra,p);p+=8;}if(compressed===0xffffffff&&p+8<=i+4+n){compressed=u64(extra,p);p+=8;}if(local===0xffffffff&&p+8<=i+4+n){local=u64(extra,p);p+=8;}}
  i+=4+n;}
 const name=b.subarray(at+46,at+46+nameSize).toString('utf8');
 return {length,entry:{name,method:b.readUInt16LE(at+10),crc:b.readUInt32LE(at+16),compressed,size,local,flags:b.readUInt16LE(at+8),dir:name.endsWith('/')}};
}

// Lists every entry of the archive at `file`: [{name, method, crc, compressed, size, local, dir}].
async function list(file){
 const handle=await fs.open(file,'r');
 try{
  const {size:fileSize}=await handle.stat();
  const {offset,size,count}=await directory(handle,fileSize);
  const entries=[];let position=offset,carry=Buffer.alloc(0);const end=offset+size;
  while(position<end||carry.length){
   const chunk=position<end?await readAt(handle,position,Math.min(CHUNK,end-position)):Buffer.alloc(0);position+=chunk.length;
   const b=carry.length?Buffer.concat([carry,chunk]):chunk;let at=0;
   for(;;){const r=record(b,at);if(!r)break;entries.push(r.entry);at+=r.length;if(entries.length>MAX_ENTRIES)throw Error('Слишком много файлов в архиве.');}
   carry=b.subarray(at);
   if(!chunk.length){if(carry.length)throw Error('Центральный каталог архива обрезан.');break;}
  }
  if(entries.length!==count&&count!==0xffff)throw Error('Каталог архива повреждён: ожидалось '+count+' записей, прочитано '+entries.length+'.');
  return {entries:entries.filter(e=>!e.dir),fileSize};
 }finally{await handle.close();}
}

// Reads the raw stored bytes of an entry (no inflate): offset of data and a reader for a byte range.
async function dataOffset(handle,entry){
 const head=await readAt(handle,entry.local,30);
 if(head.length<30||head.readUInt32LE(0)!==LOCAL)throw Error('Повреждённый локальный заголовок '+entry.name+'.');
 return entry.local+30+head.readUInt16LE(26)+head.readUInt16LE(28);
}
// The uncompressed content of a small entry (manifests, Info.plist); refuses anything over `limit`.
async function read(file,entry,limit=4<<20){
 if(entry.size>limit||entry.compressed>limit*4)throw Error(entry.name+' слишком большой для чтения.');
 const handle=await fs.open(file,'r');
 try{
  const start=await dataOffset(handle,entry),raw=await readAt(handle,start,entry.compressed);
  if(entry.method===0)return raw;
  if(entry.method===8)return zlib.inflateRawSync(raw,{maxOutputLength:limit});
  throw Error('Неподдерживаемое сжатие '+entry.name+'.');
 }finally{await handle.close();}
}
// A byte range of a STORED entry (e.g. section headers of an uncompressed .so) without reading the whole entry.
async function range(file,entry,from,length){
 if(entry.method!==0)throw Error('Диапазон доступен только для несжатых файлов.');
 if(from<0||from+length>entry.size)throw Error('Диапазон вне файла '+entry.name+'.');
 const handle=await fs.open(file,'r');
 try{return await readAt(handle,(await dataOffset(handle,entry))+from,length);}finally{await handle.close();}
}
module.exports={list,read,range,directory};
