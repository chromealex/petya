// The one file of a Google Play report archive (salesreport_YYYYMM.zip holds one CSV): a minimal ZIP reader for
// stored and deflated entries, with size limits; encrypted entries and ZIP64 are refused.
const zlib=require('node:zlib');
const LIMIT=200*1024*1024;
function entries(buf){
 let end=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Отчёт Google Play — не ZIP-архив.');
 const count=buf.readUInt16LE(end+10);let at=buf.readUInt32LE(end+16);
 if(count>100)throw Error('В архиве отчёта слишком много файлов.');
 const out=[];
 for(let i=0;i<count;i++){
  if(at+46>buf.length||buf.readUInt32LE(at)!==0x02014b50)throw Error('Повреждённый архив отчёта Google Play.');
  const flags=buf.readUInt16LE(at+8),method=buf.readUInt16LE(at+10),size=buf.readUInt32LE(at+20),full=buf.readUInt32LE(at+24),nameLen=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),local=buf.readUInt32LE(at+42);
  const name=buf.subarray(at+46,at+46+nameLen).toString('utf8');
  out.push({name,flags,method,size,full,local});
  at+=46+nameLen+extra+comment;
 }
 return out;
}
function read(buf,entry){
 if(entry.flags&1)throw Error('Архив отчёта зашифрован.');
 if(entry.size===0xffffffff||entry.full===0xffffffff||entry.full>LIMIT)throw Error('Отчёт Google Play слишком большой.');
 const l=entry.local;
 if(l+30>buf.length||buf.readUInt32LE(l)!==0x04034b50)throw Error('Повреждённый архив отчёта Google Play.');
 const start=l+30+buf.readUInt16LE(l+26)+buf.readUInt16LE(l+28),data=buf.subarray(start,start+entry.size);
 if(entry.method===0)return data;
 if(entry.method===8)return zlib.inflateRawSync(data,{maxOutputLength:LIMIT});
 throw Error('Неподдерживаемое сжатие в архиве отчёта.');
}
// The first entry whose name matches (default: the first .csv).
function file(buf,match=/\.csv$/i){
 const e=entries(buf).find(x=>match.test(x.name));
 if(!e)throw Error('В архиве отчёта нет CSV.');
 return read(buf,e);
}
module.exports={entries,read,file};
