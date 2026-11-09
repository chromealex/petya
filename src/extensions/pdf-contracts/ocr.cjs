// «Договоры в PDF»: a local OCR for scanned pages, only if one is installed — Tesseract (`tesseract` in PATH, Homebrew,
// /usr/local, or C:\Program Files\Tesseract-OCR). Nothing is downloaded and nothing leaves the computer; without it
// the card says which pages are scans and that they were not read. The page image is written to a private temporary
// folder, read with `tesseract <file> stdout -l rus+eng` (the languages that are installed), and deleted.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');

function candidates(){
 const exe=process.platform==='win32'?'tesseract.exe':'tesseract';
 const dirs=String(process.env.PATH||'').split(path.delimiter).filter(Boolean);
 dirs.push('/opt/homebrew/bin','/usr/local/bin','/usr/bin');
 if(process.platform==='win32')dirs.push('C:\\Program Files\\Tesseract-OCR','C:\\Program Files (x86)\\Tesseract-OCR');
 return [...new Set(dirs)].map(d=>path.join(d,exe));
}
let found;
function find(){
 if(found!==undefined)return found;
 found=candidates().find(f=>{try{return fs.statSync(f).isFile();}catch{return false;}})||null;
 return found;
}
const run=(file,args,timeout)=>new Promise((resolve,reject)=>execFile(file,args,{timeout,maxBuffer:16<<20,windowsHide:true},(e,out,err)=>e?reject(Object.assign(e,{stderr:String(err||'')})):resolve(String(out||''))));
let langs=null;
async function languages(bin){
 if(langs)return langs;
 try{const out=await run(bin,['--list-langs'],15000);const have=new Set(out.split(/\r?\n/).map(s=>s.trim()));langs=['rus','eng'].filter(l=>have.has(l));}catch{langs=[];}
 return langs;
}
// image = {ext, data} from pdf.cjs imageFile → text (lines) or an error.
async function recognize(image,{bin=find(),timeout=90000}={}){
 if(!bin)throw Object.assign(Error('Локального OCR нет.'),{code:'no-ocr'});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-ocr-'));
 try{
  const file=path.join(dir,'page.'+image.ext);fs.writeFileSync(file,image.data,{mode:0o600});
  const l=await languages(bin);
  const text=await run(bin,[file,'stdout',...(l.length?['-l',l.join('+')]:[])],timeout);
  return text.replace(/\f/g,'').split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
module.exports={find,recognize,reset:()=>{found=undefined;langs=null;}};
