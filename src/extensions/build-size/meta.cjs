// Version and identity of a build, read from its manifest without unpacking the archive:
// APK — binary AndroidManifest.xml (AXML), AAB — protobuf manifest (aapt2), IPA — Info.plist (XML or binary).
// Also a quick ELF check for debug sections in uncompressed native libraries.

// --- APK: binary XML ------------------------------------------------------------------------
function axmlStrings(b,at){
 const headerSize=b.readUInt16LE(at+2),count=b.readUInt32LE(at+8),flags=b.readUInt32LE(at+16),start=b.readUInt32LE(at+20);
 const utf8=(flags&0x100)!==0,strings=[];
 for(let i=0;i<Math.min(count,20000);i++){
  let p=at+start+b.readUInt32LE(at+headerSize+i*4);
  if(utf8){let n=b[p++];if(n&0x80)p++;let bytes=b[p++];if(bytes&0x80)bytes=((bytes&0x7f)<<8)|b[p++];strings.push(b.subarray(p,p+bytes).toString('utf8'));}
  else{let n=b.readUInt16LE(p);p+=2;if(n&0x8000){n=((n&0x7fff)<<16)|b.readUInt16LE(p);p+=2;}strings.push(b.subarray(p,p+n*2).toString('utf16le'));}
 }
 return strings;
}
function apkManifest(b){
 if(b.length<8||b.readUInt16LE(0)!==0x0003)return null;
 let at=b.readUInt16LE(2),strings=[];
 while(at+8<=b.length){
  const type=b.readUInt16LE(at),headerSize=b.readUInt16LE(at+2),size=b.readUInt32LE(at+4);if(size<8)break;
  if(type===0x0001)strings=axmlStrings(b,at);
  else if(type===0x0102&&strings[b.readUInt32LE(at+20)]==='manifest'){
   const attrStart=b.readUInt16LE(at+24),attrSize=b.readUInt16LE(at+26),attrCount=b.readUInt16LE(at+28),out={};
   for(let i=0;i<attrCount;i++){
    const a=at+headerSize+attrStart+i*attrSize,name=strings[b.readUInt32LE(a+4)],raw=b.readUInt32LE(a+8),dataType=b[a+15],data=b.readUInt32LE(a+16);
    const value=raw!==0xffffffff?strings[raw]:dataType===0x03?strings[data]:dataType>=0x10&&dataType<=0x1f?String(data):undefined;
    if(name==='versionCode'||name==='versionName'||name==='package')out[name]=value;
   }
   return {id:out.package||'',version:out.versionName||'',build:out.versionCode||''};
  }
  at+=size;
 }
 return null;
}

// --- AAB: protobuf XmlNode ------------------------------------------------------------------------
function varint(b,s){let v=0,m=1;for(;;){const x=b[s.at++];if(x===undefined)throw Error('proto');v+=(x&0x7f)*m;if(!(x&0x80))return v;m*=128;}}
function fields(b){
 const out=[],s={at:0};
 while(s.at<b.length){const key=varint(b,s),no=Math.floor(key/8),wire=key%8;
  if(wire===0)out.push([no,varint(b,s)]);else if(wire===2){const n=varint(b,s);out.push([no,b.subarray(s.at,s.at+n)]);s.at+=n;}
  else if(wire===1)s.at+=8;else if(wire===5)s.at+=4;else throw Error('proto');}
 return out;
}
function aabManifest(b){
 try{
  const element=fields(b).find(([n])=>n===1)?.[1];if(!element)return null;
  const parts=fields(element),out={};
  if(parts.find(([n])=>n===3)?.[1].toString()!=='manifest')return null;
  for(const [n,v] of parts)if(n===4){const a=Object.fromEntries(fields(v).filter(([k])=>k===2||k===3).map(([k,x])=>[k,x.toString('utf8')]));if(['versionCode','versionName','package'].includes(a[2]))out[a[2]]=a[3];}
  return {id:out.package||'',version:out.versionName||'',build:out.versionCode||''};
 }catch{return null;}
}

// --- IPA: Info.plist -----------------------------------------------------------------------------
function bplist(b){
 if(b.subarray(0,8).toString()!=='bplist00'||b.length<40)return null;
 const t=b.length-32,offSize=b[t+6],refSize=b[t+7],count=Number(b.readBigUInt64BE(t+8)),top=Number(b.readBigUInt64BE(t+16)),table=Number(b.readBigUInt64BE(t+24));
 const int=(at,n)=>{let v=0;for(let i=0;i<n;i++)v=v*256+b[at+i];return v;};
 const offset=i=>int(table+i*offSize,offSize);
 const length=(at)=>{const info=b[at]&0xf;if(info!==0xf)return [info,at+1];const n=1<<(b[at+1]&0xf);return [int(at+2,n),at+2+n];};
 const object=(i,depth=0)=>{
  if(i>=count||depth>3)return null;const at=offset(i),type=b[at]>>4;
  if(type===0x1)return int(at+1,1<<(b[at]&0xf));
  if(type===0x5){const [n,p]=length(at);return b.subarray(p,p+n).toString('latin1');}
  if(type===0x6){const [n,p]=length(at);const s=Buffer.from(b.subarray(p,p+n*2));s.swap16();return s.toString('utf16le');}
  if(type===0xd){const [n,p]=length(at),out={};for(let k=0;k<n&&k<500;k++){const key=object(int(p+k*refSize,refSize),depth+1);if(typeof key==='string')out[key]=object(int(p+(n+k)*refSize,refSize),depth+1);}return out;}
  return null;
 };
 const root=object(top);return root&&typeof root==='object'?root:null;
}
function xmlPlist(text){
 const out={};const re=/<key>([^<]+)<\/key>\s*<(string|integer)>([^<]*)<\/\2>/g;let m;
 while((m=re.exec(text)))out[m[1]]=m[3].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 return out;
}
function infoPlist(b){
 const dict=bplist(b)||(b.subarray(0,64).toString().includes('<?xml')||b.includes('<plist')?xmlPlist(b.toString('utf8')):null);
 if(!dict)return null;
 return {id:String(dict.CFBundleIdentifier||''),version:String(dict.CFBundleShortVersionString||''),build:String(dict.CFBundleVersion??''),name:String(dict.CFBundleDisplayName||dict.CFBundleName||'')};
}

// --- ELF: does a native library carry debug info or a full symbol table? ----------------------------
// `read(from,length)` returns bytes of the library; only the header, section table and section names are read.
async function elfDebug(read,size){
 const h=await read(0,64);
 if(h.length<52||h.readUInt32BE(0)!==0x7f454c46)return null;
 const is64=h[4]===2,le=h[5]===1;if(!le)return null;
 const shoff=is64?Number(h.readBigUInt64LE(40)):h.readUInt32LE(32),shentsize=h.readUInt16LE(is64?58:46),shnum=h.readUInt16LE(is64?60:48),shstrndx=h.readUInt16LE(is64?62:50);
 if(!shoff||!shnum||shoff+shnum*shentsize>size||shnum>4000)return null;
 const table=await read(shoff,shnum*shentsize);
 const sec=i=>{const at=i*shentsize;return {name:table.readUInt32LE(at),offset:is64?Number(table.readBigUInt64LE(at+24)):table.readUInt32LE(at+16),size:is64?Number(table.readBigUInt64LE(at+32)):table.readUInt32LE(at+20)};};
 const strs=sec(shstrndx);if(strs.offset+strs.size>size||strs.size>1<<20)return null;
 const names=await read(strs.offset,strs.size);
 const list=[];for(let i=0;i<shnum;i++){const s=sec(i);const end=names.indexOf(0,s.name);list.push({name:names.subarray(s.name,end<0?undefined:end).toString('latin1'),size:s.size});}
 const debug=list.filter(s=>/^\.(?:debug_|zdebug_|symtab$)/.test(s.name));
 return debug.length?{sections:debug.map(s=>s.name),bytes:debug.reduce((n,s)=>n+s.size,0)}:{sections:[],bytes:0};
}

module.exports={apkManifest,aabManifest,infoPlist,bplist,xmlPlist,elfDebug};
