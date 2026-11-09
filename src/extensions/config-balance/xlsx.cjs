// A small read-only XLSX reader for balance tables kept in the project: the ZIP central directory, the workbook's
// sheet list, shared strings and cell values (numbers, text, booleans; formulas give their cached value). Styles,
// dates and merged cells are not interpreted. Sizes are bounded; nothing in the file is executed.
const zlib=require('node:zlib');
const MAX_ENTRY=40<<20,MAX_ENTRIES=4000;

function entries(buf){
 // End of central directory: the last signature 0x06054b50 within the final 64 KiB.
 let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65558);i--)if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('Это не XLSX-файл.');
 const count=buf.readUInt16LE(eocd+10);let at=buf.readUInt32LE(eocd+16);
 if(count>MAX_ENTRIES)throw Error('Слишком сложный XLSX-файл.');
 const out=new Map();
 for(let n=0;n<count;n++){
  if(buf.readUInt32LE(at)!==0x02014b50)throw Error('XLSX-файл повреждён.');
  const method=buf.readUInt16LE(at+10),size=buf.readUInt32LE(at+20),real=buf.readUInt32LE(at+24),nameLen=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),local=buf.readUInt32LE(at+42);
  const name=buf.subarray(at+46,at+46+nameLen).toString('utf8');
  out.set(name,{method,size,real,local});
  at+=46+nameLen+extra+comment;
 }
 return out;
}
function read(buf,list,name){
 const e=list.get(name);if(!e)return null;
 if(e.real>MAX_ENTRY)throw Error('XLSX-файл слишком большой.');
 const off=e.local+30+buf.readUInt16LE(e.local+26)+buf.readUInt16LE(e.local+28);
 const data=buf.subarray(off,off+e.size);
 if(e.method===0)return data.toString('utf8');
 if(e.method===8)return zlib.inflateRawSync(data,{maxOutputLength:MAX_ENTRY}).toString('utf8');
 throw Error('Неподдерживаемое сжатие в XLSX.');
}
const xml=s=>String(s).replace(/&(?:lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-fA-F]+));/g,(m,d,h)=>d?String.fromCodePoint(Number(d)):h?String.fromCodePoint(parseInt(h,16)):({'&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&amp;':'&'}[m]));
const attr=(tag,name)=>{const m=new RegExp('\\s'+name+'="([^"]*)"').exec(tag);return m?xml(m[1]):'';};
function col(ref){let n=0;for(const ch of ref.replace(/\d+$/,''))n=n*26+ch.charCodeAt(0)-64;return n-1;}

// → [{name, rows:[[value…]]}] with numbers as numbers.
function sheets(buf,{maxRows=5000,maxCols=100}={}){
 const list=entries(buf);
 const workbook=read(buf,list,'xl/workbook.xml');if(!workbook)throw Error('В XLSX нет книги.');
 const rels=read(buf,list,'xl/_rels/workbook.xml.rels')||'';
 const targets=new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m=>[attr(m[0],'Id'),attr(m[0],'Target')]));
 const shared=[];
 const sst=read(buf,list,'xl/sharedStrings.xml');
 if(sst)for(const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g))shared.push(xml([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
 const out=[];
 for(const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)){
  const name=attr(m[0],'name'),rid=attr(m[0],'r:id');
  let target=targets.get(rid)||'';if(!target)continue;
  target=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  const text=read(buf,list,target);if(!text)continue;
  const rows=[];
  for(const r of text.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)){
   const index=Number(attr(r[0].slice(0,r[0].indexOf('>')+1),'r'))-1;if(!(index>=0)||index>=maxRows)continue;
   const row=[];
   for(const c of (r[1]||'').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
    const tag='<c'+c[1]+'>',ref=attr(tag,'r'),type=attr(tag,'t'),inner=c[2]||'';
    const x=col(ref);if(x<0||x>=maxCols)continue;
    const v=/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    let value='';
    if(type==='s')value=shared[Number(v)]??'';
    else if(type==='inlineStr')value=xml([...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join(''));
    else if(type==='b')value=v==='1';
    else if(type==='str'||type==='e')value=xml(v??'');
    else if(v!==undefined){const n=Number(v);value=Number.isFinite(n)?n:xml(v);}
    row[x]=value;
   }
   rows[index]=Array.from(row,v=>v===undefined?'':v);
  }
  out.push({name,rows:Array.from(rows,r=>r||[])});
 }
 return out;
}
module.exports={sheets};
