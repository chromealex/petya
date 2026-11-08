// «Конвертер»: the command for one file. Picks a tool that is installed (sips/afconvert/qlmanage on macOS, cwebp,
// ImageMagick, exiftool, LibreOffice, ffmpeg as the general one) and builds its arguments; names the output so
// that no existing file — and never the source — is overwritten; estimates the output size where it can.
const fs=require('node:fs');
const path=require('node:path');
const {ext,kindOf}=require('./plan.cjs');

class Missing extends Error{constructor(tool,text){super(text);this.missing=tool;}}
const MISSING={
 ffmpeg:'Для этого нужен ffmpeg — его можно скачать прямо из карточки.',
 soffice:'Для документов нужен LibreOffice (soffice). Установите его с libreoffice.org и повторите.',
 svg:'Для SVG нужен ImageMagick или rsvg-convert (на macOS справится и встроенный Quick Look).',
 heic:'HEIC читается встроенным sips на macOS; здесь нужен ImageMagick или ffmpeg.'
};
const miss=(tool,key=tool)=>{throw new Missing(tool,MISSING[key]);};

// Suffix that says what was done: «photo-1024px.webp», «clip-10mb.mp4», «talk-normalized.mp3».
function suffix(kind,to,p,from){
 const parts=[];
 if(p.maxSide)parts.push(p.maxSide+'px');
 if(p.height)parts.push(p.height+'p');
 if(p.targetBytes)parts.push(p.targetBytes<1048576?Math.round(p.targetBytes/1024)+'kb':Math.round(p.targetBytes/1048576*10)/10+'mb');
 if(p.trim)parts.push('trim');
 if(p.fps&&to==='gif')parts.push(p.fps+'fps');
 if(p.normalize)parts.push('normalized');
 if(p.strip)parts.push('clean');
 if(!parts.length&&(p.compress||p.quality))parts.push('compressed');
 if(!parts.length&&to===from)parts.push('converted');
 return parts.join('-');
}
// A free name next to the source (or in outDir): never the source itself, never an existing file.
function outputFor(input,{to,suffix:tail='',outDir='',exists=fs.existsSync}){
 const dir=outDir||path.dirname(input),base=path.basename(input,path.extname(input));
 const name=base+(tail?'-'+tail:'');
 let out=path.join(dir,name+'.'+to);
 for(let i=2;exists(out)||path.resolve(out)===path.resolve(input);i++)out=path.join(dir,name+' ('+i+').'+to);
 return out;
}

// Image size from the file header (PNG, JPEG, GIF, WebP) for the estimate; null when unknown.
function dimensions(file){
 let fd;try{fd=fs.openSync(file,'r');const b=Buffer.alloc(65536);const n=fs.readSync(fd,b,0,b.length,0);const h=b.subarray(0,n);
  if(h.readUInt32BE(0)===0x89504e47)return {width:h.readUInt32BE(16),height:h.readUInt32BE(20)};
  if(h.toString('ascii',0,3)==='GIF')return {width:h.readUInt16LE(6),height:h.readUInt16LE(8)};
  if(h.toString('ascii',0,4)==='RIFF'&&h.toString('ascii',8,12)==='WEBP'){const c=h.toString('ascii',12,16);
   if(c==='VP8X')return {width:1+h.readUIntLE(24,3),height:1+h.readUIntLE(27,3)};
   if(c==='VP8 ')return {width:h.readUInt16LE(26)&0x3fff,height:h.readUInt16LE(28)&0x3fff};
   if(c==='VP8L'){const v=h.readUInt32LE(21);return {width:1+(v&0x3fff),height:1+((v>>14)&0x3fff)};}}
  if(h[0]===0xff&&h[1]===0xd8){let i=2;while(i+9<h.length){if(h[i]!==0xff){i++;continue;}const m=h[i+1];const len=h.readUInt16BE(i+2);
   if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {width:h.readUInt16BE(i+7),height:h.readUInt16BE(i+5)};i+=2+len;}}
  return null;
 }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
// Rough output size; null when it cannot be told (video to gif, documents).
function estimate(file,{kind,to,params:p={}},{bytes,dims}={}){
 const size=bytes??(()=>{try{return fs.statSync(file).size;}catch{return 0;}})();
 if(!size)return null;
 const from=ext(file).replace('jpeg','jpg');
 if(kind==='video'){if(p.targetBytes)return Math.min(size,p.targetBytes);if(to==='gif')return null;let r=p.compress?0.5:to==='webm'?0.7:1;if(p.height)r*=Math.min(1,(p.height/1080)**2);if(p.trim)r*=0.5;return Math.round(size*r);}
 if(kind==='audio'){const f={wav:1,flac:0.55,m4a:0.12,mp3:0.12,ogg:0.1}[to||from]??0.5;const s={wav:1,flac:0.55}[from]??0.12;return Math.round(size*f/s);}
 if(kind==='image'){
  const d=dims===undefined?dimensions(file):dims;
  let area=1;if(p.maxSide&&d){const long=Math.max(d.width,d.height);if(long>p.maxSide)area=(p.maxSide/long)**2;}
  const density={png:1,jpg:0.35,webp:0.25,tiff:1.6,gif:0.8,heic:0.3}[to||from]??1,src={png:1,jpg:0.35,webp:0.25,tiff:1.6,gif:0.8,heic:0.3,svg:0.05}[from]??1;
  let r=area*density/src;if(p.quality)r*=Math.max(0.3,p.quality/90);else if(p.compress)r*=0.7;
  return Math.max(1024,Math.round(size*r));
 }
 return null;
}

// The steps for one file: {output, steps:[{bin,args,progress?}], tmpDir?}. `tools` from tools.detect().
function command(input,{kind,to,params:p={}},tools,{platform=process.platform,outDir='',exists=fs.existsSync,duration=null}={}){
 const from=ext(input).replace('jpeg','jpg').replace('tif','tiff');
 kind=kind||kindOf(input);
 const target=to||(kind==='document'?'pdf':from);
 const output=outputFor(input,{to:target==='jpeg'?'jpg':target,suffix:suffix(kind,target,p,from),outDir,exists});
 const ff=tools.ffmpeg,q=p.quality;
 if(kind==='document'){
  if(!tools.soffice)miss('soffice');
  // LibreOffice writes «<name>.pdf» into a folder; it goes to a private temporary folder and is renamed after.
  return {output,tmp:true,steps:[{bin:tools.soffice,args:['--headless','--norestore','--convert-to',target,'--outdir','{tmp}',input],collect:path.basename(input,path.extname(input))+'.'+target}]};
 }
 if(kind==='image'){
  const scale=p.maxSide?['-vf',"scale='if(gt(iw,ih),min("+p.maxSide+",iw),-2)':'if(gt(iw,ih),-2,min("+p.maxSide+",ih))'"]:[];
  if(from==='svg'){
   if(tools['rsvg-convert']&&target==='png')return {output,steps:[{bin:tools['rsvg-convert'],args:[...(p.maxSide?['-w',String(p.maxSide),'--keep-aspect-ratio']:[]),'-o',output,input]}]};
   if(tools.magick)return {output,steps:[{bin:tools.magick,args:['-background','none','-density','192',input,...(p.maxSide?['-resize',p.maxSide+'x'+p.maxSide+'>']:[]),output]}]};
   if(tools.qlmanage&&target==='png')return {output,tmp:true,steps:[{bin:tools.qlmanage,args:['-t','-s',String(p.maxSide||1024),'-o','{tmp}',input],collect:path.basename(input)+'.png'}]};
   miss('svg','svg');
  }
  if(p.strip&&target===from&&tools.exiftool&&!p.maxSide&&!q)return {output,steps:[{bin:tools.exiftool,args:['-all=','-o',output,input]}]};
  if(target==='webp'&&tools.cwebp&&!['gif','heic','tiff'].includes(from))return {output,steps:[{bin:tools.cwebp,args:['-quiet','-q',String(q||80),...(p.maxSide?['-resize',...landscape(input)?[String(p.maxSide),'0']:['0',String(p.maxSide)]]:[]),'-metadata',p.strip?'none':'icc',input,'-o',output]}]};
  // sips: png/jpg/tiff/heic/gif on macOS; it keeps metadata, so stripping goes to another tool.
  if(tools.sips&&['png','jpg','tiff','gif','heic'].includes(target)&&!p.strip&&from!=='webp'||tools.sips&&from==='heic'&&!ff&&!tools.magick){
   const fmt={jpg:'jpeg',tiff:'tiff',png:'png',gif:'gif',heic:'heic'}[target]||'png';
   return {output,steps:[{bin:tools.sips,args:['-s','format',fmt,...(q&&target==='jpg'||p.compress&&target==='jpg'?['-s','formatOptions',String(q||70)]:[]),...(p.maxSide?['-Z',String(p.maxSide)]:[]),input,'--out',output]}]};
  }
  if(tools.magick&&(from==='heic'||!ff))return {output,steps:[{bin:tools.magick,args:[input,...(p.maxSide?['-resize',p.maxSide+'x'+p.maxSide+'>']:[]),...(p.strip?['-strip']:[]),...(q||p.compress?['-quality',String(q||75)]:[]),output]}]};
  if(!ff)miss('ffmpeg');
  if(from==='heic')miss('heic','heic');
  const quality=target==='webp'?['-quality',String(q||80)]:target==='jpg'?['-q:v',String(Math.round(2+(100-(q||(p.compress?70:90)))/100*29))]:[];
  return {output,steps:[{bin:ff,args:['-hide_banner','-nostdin','-y','-i',input,...scale,...(p.strip?['-map_metadata','-1']:[]),...quality,'-frames:v','1',output]}]};
 }
 if(!ff){
  // macOS without ffmpeg: plain audio format changes and loudness-free conversions through afconvert.
  if(kind==='audio'&&tools.afconvert&&['wav','m4a'].includes(target)&&!p.normalize&&!p.trim)
   return {output,steps:[{bin:tools.afconvert,args:target==='wav'?['-f','WAVE','-d','LEI16',input,output]:['-f','m4af','-d','aac',...(p.compress?['-b','96000']:[]),input,output]}]};
  miss('ffmpeg');
 }
 const trim=p.trim?['-ss',String(p.trim.start),'-to',String(p.trim.end)]:[];
 const base=['-hide_banner','-nostdin','-y','-progress','pipe:1','-nostats',...trim,'-i',input];
 if(kind==='audio'){
  const codec={mp3:['-c:a','libmp3lame','-q:a',p.compress?'5':'2'],ogg:['-c:a','libvorbis','-q:a',p.compress?'3':'5'],m4a:['-c:a','aac','-b:a',p.compress?'96k':'192k'],wav:['-c:a','pcm_s16le']}[target]||[];
  return {output,steps:[{bin:ff,args:[...base,'-vn',...(p.normalize?['-af','loudnorm=I=-16:TP=-1.5:LRA=11']:[]),...(p.strip?['-map_metadata','-1']:[]),...codec,output],progress:true}]};
 }
 // Video.
 const filters=[];
 if(p.height)filters.push('scale=-2:'+p.height);
 else if(p.maxSide)filters.push("scale='if(gt(iw,ih),min("+p.maxSide+",iw),-2)':'if(gt(iw,ih),-2,min("+p.maxSide+",ih))'");
 if(target==='gif'){
  const fps=p.fps||12,width=p.maxSide||(p.height?null:480);
  const chain=['fps='+fps,width?'scale='+width+':-1:flags=lanczos':filters[0]||'scale=480:-1:flags=lanczos'];
  return {output,steps:[{bin:ff,args:[...base,'-vf',chain.join(',')+',split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4','-loop','0',output],progress:true}]};
 }
 if(p.fps)filters.push('fps='+p.fps);
 const vf=filters.length?['-vf',filters.join(',')]:[];
 if(target==='webm')return {output,steps:[{bin:ff,args:[...base,...vf,'-c:v','libvpx-vp9','-crf',p.compress?'38':'33','-b:v','0','-row-mt','1','-c:a','libopus','-b:a','96k',...(p.strip?['-map_metadata','-1']:[]),output],progress:true}]};
 let rate=[];
 if(p.targetBytes){
  const seconds=p.trim?p.trim.end-p.trim.start:duration;
  if(!seconds)throw Error('Не удалось узнать длительность видео, чтобы уложиться в размер.');
  // 95% of the budget, 96 kbit/s for sound; at least 100 kbit/s for the picture.
  const total=p.targetBytes*8*0.95/seconds,video=Math.max(100000,Math.floor(total-96000));
  rate=['-b:v',String(video),'-maxrate',String(video),'-bufsize',String(video*2)];
 }
 const crf=rate.length?[]:['-crf',p.compress?'28':'23'];
 return {output,steps:[{bin:ff,args:[...base,...vf,'-c:v','libx264','-preset','medium',...crf,...rate,'-pix_fmt','yuv420p','-c:a','aac','-b:a',rate.length?'96k':'160k','-movflags','+faststart',...(p.strip?['-map_metadata','-1']:[]),output],progress:true}]};
}
function landscape(file){const d=dimensions(file);return !d||d.width>=d.height;}

// What a plan needs that is not installed: 'ffmpeg', 'soffice', or null.
function needs(plan,tools,platform=process.platform){
 for(const file of plan.files.slice(0,50)){
  try{command(file,plan,tools,{platform,exists:()=>false,duration:60});}
  catch(e){if(e.missing)return e.missing;}
 }
 return null;
}
module.exports={command,outputFor,suffix,estimate,dimensions,needs,Missing};
