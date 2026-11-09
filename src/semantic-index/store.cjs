// One collection's vectors on disk, no native dependencies. A folder per collection holds one generation of files:
//   meta.json          {format, model, dim, gen}                       — written last, atomically (tmp + rename)
//   vectors.<gen>.f32  rows × dim little-endian Float32, unit length   — append-only
//   sketch.<gen>.bin   rows × ceil(dim/32) Uint32 sign bits            — append-only, the prefilter
//   texts.<gen>.bin    UTF-8 chunk texts                               — append-only, read only for hits
//   log.<gen>.ndjson   {t:'item', id, version, hash, meta, start, count, chunks:[{o,l,loc}]} | {t:'del', id} |
//                      {t:'touch', id, version}                        — replayed on open, last record wins
// An item's chunks are contiguous rows [start, start+count). Writes go vectors → sketch → texts → log, so a torn
// write leaves only unreferenced bytes; on open, records that point past the data are dropped and the log is
// rewritten. Dead rows (removed or replaced items) are reclaimed by compaction into the next generation, after
// which meta.json switches to it and the old files are deleted.
// Search is a brute-force scan: Hamming distance on the sign sketch picks candidates (all rows in small
// collections), and only they are rescored by exact cosine from the vector file.
const fs=require('node:fs');
const path=require('node:path');
const FORMAT=1;

const words=dim=>Math.ceil(dim/32);
function sketchOf(vector,out=new Uint32Array(words(vector.length))){
 out.fill(0);for(let i=0;i<vector.length;i++)if(vector[i]>0)out[i>>5]|=1<<(i&31);return out;
}
function popcount(x){x-=(x>>>1)&0x55555555;x=(x&0x33333333)+((x>>>2)&0x33333333);return (((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;}
function normalize(vector){
 let n=0;for(const v of vector)n+=v*v;n=Math.sqrt(n);
 const out=new Float32Array(vector.length);if(!n||!Number.isFinite(n))return out;
 for(let i=0;i<vector.length;i++)out[i]=vector[i]/n;return out;
}
const files=gen=>({vectors:'vectors.'+gen+'.f32',sketch:'sketch.'+gen+'.bin',texts:'texts.'+gen+'.bin',log:'log.'+gen+'.ndjson'});
function writeAtomic(file,data){const tmp=file+'.tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}

class Collection{
 // exact: up to this many rows every row is rescored exactly (vectors are kept in memory); above it the sketch
 // picks `oversample` × k candidates (at least `minCandidates`).
 constructor(dir,{model,dim,exact=20000,oversample=40,minCandidates=400}={}){
  if(!model||!Number.isInteger(dim)||dim<8||dim>8192)throw Error('Некорректная модель индекса.');
  Object.assign(this,{dir,model,dim,exact,oversample,minCandidates});
  this.recovered='';this.open();
 }
 path(name){return path.join(this.dir,name);}
 reset(reason){
  // Unreadable or made by another model: the collection starts empty and is filled again by its owner.
  try{fs.rmSync(this.dir,{recursive:true,force:true});}catch{/* recreated below */}
  this.recovered=reason;this.create();
 }
 create(){
  fs.mkdirSync(this.dir,{recursive:true});
  this.gen=1;this.names=files(1);
  for(const name of Object.values(this.names))fs.writeFileSync(this.path(name),'');
  writeAtomic(this.path('meta.json'),JSON.stringify({format:FORMAT,model:this.model,dim:this.dim,gen:1}));
  this.items=new Map();this.owner=[];this.rows=0;this.textBytes=0;this.dead=0;this.sketch=new Uint32Array(0);this.cache=null;
 }
 open(){
  let meta=null;
  try{meta=JSON.parse(fs.readFileSync(this.path('meta.json'),'utf8'));}catch(e){if(e.code==='ENOENT'&&!fs.existsSync(this.dir)){this.create();return;}meta=null;}
  if(!meta||meta.format!==FORMAT||!Number.isInteger(meta.gen)||meta.gen<1){this.reset('corrupt');return;}
  if(meta.model!==this.model||meta.dim!==this.dim){this.reset('model');return;}
  this.gen=meta.gen;this.names=files(meta.gen);
  // Files of other generations are leftovers of an interrupted compaction.
  for(const name of fs.readdirSync(this.dir))if(/^(?:vectors|sketch|texts|log)\.\d+\./.test(name)&&!Object.values(this.names).includes(name))fs.rmSync(this.path(name),{force:true});
  let sizes;
  try{sizes=Object.fromEntries(Object.entries(this.names).map(([k,n])=>[k,fs.statSync(this.path(n)).size]));}catch{this.reset('corrupt');return;}
  const vectorRows=Math.floor(sizes.vectors/(this.dim*4));
  // A torn vector write leaves a partial row: cut it off so the next rows stay aligned.
  if(sizes.vectors!==vectorRows*this.dim*4){fs.truncateSync(this.path(this.names.vectors),vectorRows*this.dim*4);this.recovered||='vectors';}
  this.textBytes=sizes.texts;
  // Replay the log; a broken line (a torn last write) or a record pointing past the data is dropped.
  this.items=new Map();let broken=0;
  const text=fs.readFileSync(this.path(this.names.log),'utf8');
  for(const line of text.split('\n')){
   if(!line.trim())continue;
   let r;try{r=JSON.parse(line);}catch{broken++;continue;}
   if(r?.t==='item'&&typeof r.id==='string'&&Number.isInteger(r.start)&&Number.isInteger(r.count)&&r.start>=0&&r.count>=0&&Array.isArray(r.chunks)&&r.chunks.length===r.count){
    if(r.start+r.count>vectorRows||r.chunks.some(c=>!Number.isInteger(c.o)||!Number.isInteger(c.l)||c.o+c.l>sizes.texts)){broken++;continue;}
    this.items.set(r.id,{id:r.id,version:String(r.version??''),hash:String(r.hash||''),meta:r.meta&&typeof r.meta==='object'?r.meta:{},start:r.start,count:r.count,chunks:r.chunks});
   }else if(r?.t==='del'&&typeof r.id==='string')this.items.delete(r.id);
   else if(r?.t==='touch'&&this.items.has(r.id))this.items.get(r.id).version=String(r.version??'');
   else broken++;
  }
  this.rows=vectorRows;
  this.owner=new Array(this.rows).fill(null);
  for(const item of this.items.values())for(let i=0;i<item.count;i++)this.owner[item.start+i]=item;
  this.dead=this.owner.filter(x=>!x).length;
  // The sketch is derived data: rebuilt from the vectors when it is short or of the wrong size.
  const w=words(this.dim);
  if(sizes.sketch!==this.rows*w*4){this.rebuildSketch();if(sizes.sketch)this.recovered||='sketch';}
  else{const buf=fs.readFileSync(this.path(this.names.sketch));this.sketch=new Uint32Array(buf.buffer,buf.byteOffset,buf.length/4).slice();}
  this.cache=null;
  if(broken||text&&!text.endsWith('\n')){this.recovered||='log';this.compact();}
 }
 rebuildSketch(){
  const w=words(this.dim),out=new Uint32Array(this.rows*w);
  const fd=fs.openSync(this.path(this.names.vectors),'r');
  try{
   const batch=1024,buf=Buffer.alloc(batch*this.dim*4);
   for(let r=0;r<this.rows;r+=batch){
    const n=Math.min(batch,this.rows-r);fs.readSync(fd,buf,0,n*this.dim*4,r*this.dim*4);
    const f=new Float32Array(buf.buffer,buf.byteOffset,n*this.dim);
    for(let i=0;i<n;i++)sketchOf(f.subarray(i*this.dim,(i+1)*this.dim),out.subarray((r+i)*w,(r+i+1)*w));
   }
  }finally{fs.closeSync(fd);}
  fs.writeFileSync(this.path(this.names.sketch),Buffer.from(out.buffer,out.byteOffset,out.byteLength));
  this.sketch=out;
 }
 get size(){return this.items.size;}
 get chunks(){return this.rows-this.dead;}
 get(id){const x=this.items.get(id);return x?{id:x.id,version:x.version,hash:x.hash,meta:x.meta,chunks:x.count}:null;}
 ids(){return [...this.items.keys()];}
 append(name,buffer){fs.appendFileSync(this.path(this.names[name]),buffer);}
 log(record){this.append('log',JSON.stringify(record)+'\n');}

 // Stores (or replaces) an item: pieces [{text, loc}] with their vectors (already unit length, `dim` long).
 put(id,{version='',hash='',meta={},pieces,vectors}){
  if(typeof id!=='string'||!id)throw Error('Нет идентификатора элемента индекса.');
  if(!Array.isArray(pieces)||pieces.length!==vectors.length)throw Error('Число векторов не совпадает с числом частей.');
  for(const v of vectors)if(!(v instanceof Float32Array)||v.length!==this.dim)throw Error('Размер вектора не совпадает с моделью индекса.');
  const start=this.rows,w=words(this.dim);
  const vec=Buffer.alloc(vectors.length*this.dim*4),sk=new Uint32Array(vectors.length*w);
  vectors.forEach((v,i)=>{Buffer.from(v.buffer,v.byteOffset,v.byteLength).copy(vec,i*this.dim*4);sketchOf(v,sk.subarray(i*w,(i+1)*w));});
  const texts=pieces.map(p=>Buffer.from(String(p.text||''),'utf8'));
  const chunks=[];let o=this.textBytes;
  texts.forEach((t,i)=>{chunks.push({o,l:t.length,...pieces[i].loc&&Object.keys(pieces[i].loc).length?{loc:pieces[i].loc}:{}});o+=t.length;});
  this.append('vectors',vec);this.append('sketch',Buffer.from(sk.buffer));this.append('texts',Buffer.concat(texts));
  const record={t:'item',id,version:String(version),hash:String(hash),meta,start,count:vectors.length,chunks};
  this.log(record);
  const old=this.items.get(id);if(old){for(let i=0;i<old.count;i++)this.owner[old.start+i]=null;this.dead+=old.count;}
  const item={...record};delete item.t;this.items.set(id,item);
  for(let i=0;i<vectors.length;i++)this.owner.push(item);
  this.rows+=vectors.length;this.textBytes=o;
  // The sketch grows by doubling: many small puts stay linear.
  const need=this.rows*w;
  if(need>this.sketch.length){const grown=new Uint32Array(Math.max(need,this.sketch.length*2,1024*w));grown.set(this.sketch.subarray(0,start*w));this.sketch=grown;}
  this.sketch.set(sk,start*w);
  this.cache=null;
  this.maybeCompact();
 }
 // The content did not change (same hash), only its version (e.g. mtime): no re-embedding.
 touch(id,version){const x=this.items.get(id);if(!x||x.version===String(version))return false;x.version=String(version);this.log({t:'touch',id,version:String(version)});return true;}
 remove(id){
  const old=this.items.get(id);if(!old)return false;
  for(let i=0;i<old.count;i++)this.owner[old.start+i]=null;this.dead+=old.count;
  this.items.delete(id);this.log({t:'del',id});this.maybeCompact();return true;
 }
 maybeCompact(){if(this.dead>=1000&&this.dead>this.rows*0.3)this.compact();}
 // Live items are copied into the next generation; meta.json switches to it last.
 compact(){
  const gen=this.gen+1,names=files(gen),w=words(this.dim);
  const fd=fs.openSync(this.path(this.names.vectors),'r'),tfd=fs.openSync(this.path(this.names.texts),'r');
  const out={vectors:fs.openSync(this.path(names.vectors),'w'),sketch:fs.openSync(this.path(names.sketch),'w'),texts:fs.openSync(this.path(names.texts),'w')};
  const lines=[],items=new Map();let row=0,textBytes=0;
  try{
   for(const item of this.items.values()){
    const vec=Buffer.alloc(item.count*this.dim*4);fs.readSync(fd,vec,0,vec.length,item.start*this.dim*4);
    fs.writeSync(out.vectors,vec);
    fs.writeSync(out.sketch,Buffer.from(this.sketch.buffer,this.sketch.byteOffset+item.start*w*4,item.count*w*4));
    const chunks=item.chunks.map(c=>{const t=Buffer.alloc(c.l);if(c.l)fs.readSync(tfd,t,0,c.l,c.o);fs.writeSync(out.texts,t);const next={...c,o:textBytes};textBytes+=c.l;return next;});
    const next={...item,start:row,chunks};items.set(item.id,next);row+=item.count;
    lines.push(JSON.stringify({t:'item',...next}));
   }
  }finally{fs.closeSync(fd);fs.closeSync(tfd);for(const f of Object.values(out))fs.closeSync(f);}
  fs.writeFileSync(this.path(names.log),lines.length?lines.join('\n')+'\n':'');
  writeAtomic(this.path('meta.json'),JSON.stringify({format:FORMAT,model:this.model,dim:this.dim,gen}));
  const old=this.names;this.gen=gen;this.names=names;
  for(const name of Object.values(old))fs.rmSync(this.path(name),{force:true});
  this.items=items;this.rows=row;this.textBytes=textBytes;this.dead=0;
  this.owner=[];for(const item of items.values())for(let i=0;i<item.count;i++)this.owner.push(item);
  const buf=fs.readFileSync(this.path(names.sketch));this.sketch=new Uint32Array(buf.buffer,buf.byteOffset,buf.length/4).slice();
  this.cache=null;
 }

 vectorsFor(rows){
  if(this.rows<=this.exact){
   if(!this.cache){const buf=fs.readFileSync(this.path(this.names.vectors));this.cache=new Float32Array(buf.buffer,buf.byteOffset,this.rows*this.dim).slice();}
   return row=>this.cache.subarray(row*this.dim,(row+1)*this.dim);
  }
  const fd=fs.openSync(this.path(this.names.vectors),'r'),map=new Map();
  try{
   const buf=Buffer.alloc(this.dim*4);
   for(const row of rows){fs.readSync(fd,buf,0,buf.length,row*this.dim*4);map.set(row,new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)));}
  }finally{fs.closeSync(fd);}
  return row=>map.get(row);
 }
 text(chunk){
  if(!chunk.l)return '';
  const fd=fs.openSync(this.path(this.names.texts),'r');
  try{const buf=Buffer.alloc(chunk.l);fs.readSync(fd,buf,0,chunk.l,chunk.o);return buf.toString('utf8');}finally{fs.closeSync(fd);}
 }
 // Best chunks for a unit-length query vector: [{id, chunk, score, loc, meta, version}], at most `perItem` per item.
 // `allow(item)` is the metadata prefilter (only those items are scanned).
 search(query,{k=8,allow=null,perItem=1}={}){
  if(!(query instanceof Float32Array)||query.length!==this.dim)throw Error('Размер запроса не совпадает с моделью индекса.');
  const w=words(this.dim),q=sketchOf(query),live=[];
  const ok=new Map();
  for(let r=0;r<this.rows;r++){
   const item=this.owner[r];if(!item)continue;
   let pass=ok.get(item);if(pass===undefined){try{pass=!allow||!!allow(item);}catch{pass=false;}ok.set(item,pass);}
   if(pass)live.push(r);
  }
  let candidates=live;
  const want=Math.max(this.minCandidates,k*perItem*this.oversample);
  if(live.length>this.exact&&live.length>want){
   // Counting sort by Hamming distance: O(rows), no comparisons.
   const dist=new Uint16Array(live.length),counts=new Uint32Array(this.dim+1);
   for(let i=0;i<live.length;i++){const base=live[i]*w;let d=0;for(let j=0;j<w;j++)d+=popcount((this.sketch[base+j]^q[j])>>>0);dist[i]=d;counts[d]++;}
   let limit=0,total=0;while(limit<=this.dim&&total<want)total+=counts[limit++];
   candidates=live.filter((_,i)=>dist[i]<limit);
  }
  const vector=this.vectorsFor(candidates);
  const scored=candidates.map(r=>{const v=vector(r);let s=0;for(let i=0;i<this.dim;i++)s+=v[i]*query[i];return {row:r,score:s};}).sort((a,b)=>b.score-a.score);
  const per=new Map(),out=[];
  for(const x of scored){
   const item=this.owner[x.row],n=per.get(item)||0;if(n>=perItem)continue;
   per.set(item,n+1);const index=x.row-item.start,chunk=item.chunks[index];
   out.push({id:item.id,chunk:index,score:x.score,loc:chunk.loc||{},meta:item.meta,version:item.version,text:this.text(chunk)});
   if(out.length>=k*perItem)break;
  }
  return out;
 }
 stats(){return {items:this.items.size,chunks:this.chunks,rows:this.rows,dead:this.dead,bytes:this.rows*this.dim*4+this.textBytes,gen:this.gen,recovered:this.recovered};}
}

module.exports={Collection,normalize,sketchOf,popcount,FORMAT};
