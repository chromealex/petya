// «Конвертер»: understanding the request. One phrase becomes a plan: what kind of media, the target format and the
// parameters (size, quality, target bytes, trim, fps, scale, metadata, loudness), and where the files are
// (chat attachments, paths in the text, a folder with a glob). Pure functions, no tools are run here.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const KINDS={
 image:['png','jpg','jpeg','webp','heic','heif','tif','tiff','gif','svg','bmp'],
 video:['mp4','mov','webm','mkv','avi','m4v'],
 audio:['wav','mp3','ogg','m4a','aac','flac','opus'],
 document:['docx','doc','pptx','ppt','xlsx','xls','odt','odp','ods','rtf']
};
const ext=file=>path.extname(String(file)).slice(1).toLowerCase();
const kindOf=file=>{const e=ext(file);return Object.keys(KINDS).find(k=>KINDS[k].includes(e))||null;};
// Formats a result may have, per kind of source (gif is an image result too when made from video).
const TARGETS={image:['png','jpg','webp','tiff','gif'],video:['mp4','mov','webm','gif'],audio:['mp3','wav','ogg','m4a'],document:['pdf']};
const norm=f=>({jpeg:'jpg',tif:'tiff',гиф:'gif',гифк:'gif',гифку:'gif',гифка:'gif',пдф:'pdf',джипег:'jpg',пнг:'png',вебп:'webp',мп3:'mp3',мп4:'mp4'})[f]||f;
const FORMAT='png|jpe?g|webp|heic|heif|tiff?|gif|svg|bmp|mp4|mov|webm|mkv|avi|m4v|wav|mp3|ogg|m4a|aac|flac|opus|docx?|pptx?|xlsx?|odt|odp|ods|rtf|pdf|гифк\\p{L}*|пдф|пнг|джипег|вебп|мп3|мп4';
const FORMAT_WORD=new RegExp('(?:^|[^\\p{L}\\p{N}])('+FORMAT+')(?=$|[^\\p{L}\\p{N}])','giu');
const MEDIA=new RegExp('(?:^|[^\\p{L}])(?:'+FORMAT+')(?=$|[^\\p{L}])|картинк|изображени|фото|снимк|скриншот|видео|ролик|клип|запис[ьи] экрана|аудио|звук|музык|трек|песн|подкаст|голосов|гифк|документ|презентаци|таблиц[уыа] (?:в|excel)|файл','iu');
// Verbs of converting, compressing and resizing. «Переведи» only with a file format («переведи docx в pdf»).
const VERB=/конверт\p{L}*|сконверт\p{L}*|переконверт\p{L}*|перегон\p{L}*|сожми|сжать|ужми|пожми|уменьши|уменьшить|ресайз|resize|convert|compress|сделай (?:из (?:\p{L}+ )?)?гифк|сделай гиф|в гифку|обрежь|обрезать|вырежи|нормализ\p{L}*|выровняй громкость|убери (?:метаданн|exif|геотег)|удали (?:метаданн|exif)|без метаданных|перевед\p{L}*|переведи|сохрани (?:как|в формат)|экспорт\p{L}* в/iu;
// Neighbours: money, text translation, chat answers, tasks — not files.
const AVOID=/валют|курс\p{L}* (?:доллар|евро|рубл|валют)|доллар|евро|рубл|(?:^|[^\p{L}])(?:usd|eur|rub)(?=$|[^\p{L}])|переведи (?:текст|фраз|предложени|слово|письмо|сообщени|на (?:английск|русск|немецк|французск|испанск|китайск|японск))|перевод (?:текста|фразы|на англ)|сожми (?:ответ|текст|мысль|сообщени|пересказ)|(?:ответ|текст)\p{L}* (?:покороче|короче)|задач\p{L}* в (?:статус|работ)|в другой статус|деньг|перевод денег|единиц\p{L}* измерен|километр|мил[ьи]|фунт|градус|цельси|фаренгейт/iu;

function wanted(text){
 const t=String(text||'');
 if(AVOID.test(t)||!VERB.test(t))return false;
 // «переведи …» counts only with a file format word: «переведи docx в pdf».
 if(/перевед\p{L}*|переведи/iu.test(t)&&!/конверт|сожми|уменьши|гифк|ресайз/iu.test(t)&&!new RegExp('(?:^|[^\\p{L}])(?:'+FORMAT+')(?=$|[^\\p{L}])','iu').test(t))return false;
 return MEDIA.test(t);
}

// Numbers: «10 МБ», «1,5 мб», «500 кб»; «1024», «1024px», «до 1024 пикселей»; «0:10», «1:02:03», «15 сек».
const num=v=>Number(String(v).replace(',','.'));
function bytesIn(t){const m=t.match(/(\d+(?:[.,]\d+)?)\s*(гб|gb|мб|mb|мегабайт\p{L}*|кб|kb|килобайт\p{L}*)(?=$|[^\p{L}])/iu);if(!m)return null;const u=m[2].toLowerCase();const k=/^[гg]/.test(u)?1024**3:/^[мm]/.test(u)?1024**2:1024;return Math.round(num(m[1])*k);}
function seconds(v){const p=String(v).split(':').map(Number);if(p.some(n=>!Number.isFinite(n)))return null;return p.reduce((a,n)=>a*60+n,0);}
function trimIn(t){
 // «с 0:05 до 0:12», «с 5 сек по 12 сек», «с 1 до 3» (bare seconds, not sizes: no px/МБ after the end).
 let m=t.match(/с\s+(\d{1,2}(?::\d{2}){1,2}|\d+(?:[.,]\d+)?(?:\s*(?:с|сек\p{L}*))?)\s+(?:до|по)\s+(\d{1,2}(?::\d{2}){1,2}|\d+(?:[.,]\d+)?(?:\s*(?:с|сек\p{L}*))?)(?!\s*(?:px|пикс|мб|mb|кб|kb|гб|gb|%|\d))/iu);
 const sec=v=>/:/.test(v)?seconds(v):num(String(v).replace(/[^\d.,]/g,''));
 if(m)return {start:sec(m[1]),end:sec(m[2])};
 m=t.match(/(?:перв\p{L}*|начальн\p{L}*)\s+(\d+(?:[.,]\d+)?)\s*(сек\p{L}*|с|мин\p{L}*)/iu);
 if(m)return {start:0,end:num(m[1])*(/^мин/i.test(m[2])?60:1)};
 return null;
}
function paramsFrom(text,kind){
 const t=String(text||''),p={};
 const target=bytesIn(t);
 if(target&&/(?:до|в|не больше|меньше|под)\s+\d/iu.test(t))p.targetBytes=target;
 const side=t.match(/(?:до|в|по (?:длинной|большей) стороне|шириной|размер(?:ом)?)\s+(\d{2,5})\s*(?:px|пикс\p{L}*|точек)?(?=$|[^\p{L}\p{N}.,])(?!\s*(?:мб|mb|кб|kb|гб|gb|сек|с\b|мин|fps|кадр|%))/iu);
 if(side&&kind!=='audio'&&kind!=='document'){const n=Number(side[1]);if(n>=16&&n<=16384&&!/^(?:720|1080|480|360|1440|2160)$/.test(side[1])||kind==='image')p.maxSide=n;}
 const scale=t.match(/(?:^|[^\d])(2160|1440|1080|720|480|360)\s*p(?=$|[^\p{L}])/iu);if(scale)p.height=Number(scale[1]);
 const fps=t.match(/(\d{1,2})\s*(?:fps|кадр\p{L}*(?: в секунду)?)/iu);if(fps)p.fps=Math.min(60,Math.max(1,Number(fps[1])));
 const quality=t.match(/качеств\p{L}*\s*(\d{2,3})|(\d{2,3})\s*%\s*качеств/iu);if(quality)p.quality=Math.min(100,Math.max(10,Number(quality[1]||quality[2])));
 const trim=kind==='image'||kind==='document'?null:trimIn(t);if(trim&&Number.isFinite(trim.start)&&Number.isFinite(trim.end)&&trim.end>trim.start)p.trim=trim;
 if(/метаданн|exif|геотег|gps/iu.test(t))p.strip=true;
 if(/нормализ|выровняй громкость|громкость (?:выровн|одинаков)|loudnorm/iu.test(t))p.normalize=true;
 if(/сожми|сжать|ужми|пожми|compress|уменьши (?:вес|размер файл)|полегче/iu.test(t)&&!p.targetBytes)p.compress=true;
 return p;
}
// Formats named in the text, in order: «png в webp» → ['png','webp'].
function formats(text){return [...String(text||'').matchAll(FORMAT_WORD)].map(m=>norm(m[1].toLowerCase().replace(/^гифк\p{L}*$/u,'gif')));}
function targetIn(text){
 const t=String(text||'');
 if(/гифк|(?:^|[^\p{L}])гиф(?=$|[^\p{L}])|в gif(?=$|[^\p{L}])/iu.test(t))return 'gif';
 const m=t.match(new RegExp('(?:в|to|как|формат[еа]?)\\s+\\.?('+FORMAT+')(?=$|[^\\p{L}\\p{N}])','iu'));
 return m?norm(m[1].toLowerCase()):null;
}

// Paths in the text: absolute, ~/…, quoted with spaces; a trailing glob («~/Pictures/*.png») splits into folder + glob.
function pathsIn(text,home=os.homedir()){
 const out=[];const t=String(text||'');
 const quoted=[...t.matchAll(/[«"'“]((?:~|\/|[A-Za-z]:\\)[^«»"'“”]+)[»"'”]/g)].map(m=>m[1]);
 const bare=[...t.replace(/[«"'“][^«»"'“”]*[»"'”]/g,' ').matchAll(/(?:^|\s)((?:~(?=[\\/])|\/(?!\/)|[A-Za-z]:\\)[^\s,;«»"']+)/g)].map(m=>m[1].replace(/[.!?)]+$/,''));
 for(const raw of [...quoted,...bare]){
  const p=raw.replace(/^~(?=[\\/]|$)/,home);
  const star=p.search(/[*?]/);
  if(star>=0){const dir=p.slice(0,Math.max(p.lastIndexOf('/',star),p.lastIndexOf('\\',star)));out.push({path:dir||'/',glob:p.slice(dir.length+1)});}
  else out.push({path:p});
 }
 return out;
}
const globIn=text=>{const m=String(text||'').match(/(?:^|\s)(\*{1,2}(?:[\\/]\*)?\.[\w{},]+|\*\.[a-z0-9]+)/i);return m?m[1]:null;};
function globRe(glob){
 const src=String(glob).replace(/[.+^$()|[\]\\]/g,'\\$&').replace(/\{([^}]+)\}/g,(_,a)=>'('+a.split(',').join('|')+')').replace(/\*\*\/?/g,'§').replace(/\*/g,'[^/]*').replace(/\?/g,'.').replace(/§/g,'.*');
 return new RegExp('^'+src+'$','i');
}
// Files of a folder (non-recursive unless asked), filtered by glob or by kind; hidden files and our own outputs
// are skipped; at most `limit` files.
function listFolder(dir,{glob,kind,recursive=false,limit=500}={}){
 const re=glob?globRe(glob.replace(/^\*\*[\\/]/,'')):null,out=[];
 const walk=(d,depth)=>{let entries;try{entries=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const e of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(out.length>=limit)return;if(e.name.startsWith('.'))continue;
   const full=path.join(d,e.name);
   if(e.isDirectory()){if(recursive&&depth<3)walk(full,depth+1);continue;}
   if(!e.isFile())continue;
   if(re?!re.test(e.name):kind?kindOf(e.name)!==kind:!kindOf(e.name))continue;
   out.push(full);
  }};
 walk(dir,0);return out;
}

// The plan for a phrase and the files it found: {kind, from, to, params, files, glob}.
function plan(text,{attachments=[],home=os.homedir(),exists=fs.existsSync,stat=p=>fs.statSync(p)}={}){
 const t=String(text||'');
 const named=formats(t),to0=targetIn(t);
 const from=named.find(f=>f!==to0&&f!=='pdf')||null;
 let files=[],glob=globIn(t);
 const recursive=/рекурсивн|во вложенн|во всех подпапк|включая подпапк/iu.test(t);
 for(const a of attachments)if(a.path&&exists(a.path))files.push(a.path);
 for(const p of pathsIn(t,home)){
  if(!exists(p.path))continue;
  let isDir=false;try{isDir=stat(p.path).isDirectory();}catch{continue;}
  if(isDir){const g=p.glob||glob||(from?'*.'+(from==='jpg'?'{jpg,jpeg}':from==='tiff'?'{tif,tiff}':from):null);files.push(...listFolder(p.path,{glob:g,kind:g?null:kindFromText(t,from,to0),recursive}));glob=g||glob;}
  else files.push(p.path);
 }
 files=[...new Set(files)];
 if(from&&files.length>1){const only=files.filter(f=>norm(ext(f))===from);if(only.length)files=only;}
 const kinds=[...new Set(files.map(kindOf).filter(Boolean))];
 const kind=kinds.length===1?kinds[0]:kinds.length?kinds.sort((a,b)=>files.filter(f=>kindOf(f)===b).length-files.filter(f=>kindOf(f)===a).length)[0]:kindFromText(t,from,to0);
 if(kind&&kinds.length>1)files=files.filter(f=>kindOf(f)===kind);
 const params=paramsFrom(t,kind);
 let to=to0;
 if(!to&&kind==='document')to='pdf';
 if(to&&kind&&!TARGETS[kind]?.includes(to)&&!(kind==='image'&&to==='pdf'))to=null;
 return {kind,from,to,params,files,glob:glob||null,recursive};
}
function kindFromText(t,from,to){
 for(const f of [from,to])if(f){const k=Object.keys(KINDS).find(k=>KINDS[k].includes(f));if(k)return k;}
 if(/видео|ролик|клип|запис[ьи] экрана|гифк/iu.test(t))return 'video';
 if(/аудио|звук|музык|трек|песн|подкаст|голосов/iu.test(t))return 'audio';
 if(/документ|презентаци|таблиц|docx|pptx|xlsx/iu.test(t))return 'document';
 if(/картинк|изображени|фото|снимк|скриншот/iu.test(t))return 'image';
 return null;
}
module.exports={KINDS,TARGETS,ext,kindOf,wanted,paramsFrom,formats,targetIn,pathsIn,globIn,globRe,listFolder,plan,bytesIn,trimIn};
