// Scripts that come with a skill package. Petya does not run them on the computer; a Python script that
// needs only the standard library can run in the isolated Python sandbox (src/extensions/python) when
// that extension is ready. Files Petya builds itself (docx, xlsx, pptx, pdf) do not need scripts at all:
// see src/office-files.cjs.
const fs=require('node:fs'),path=require('node:path');
// Modules of the Python standard library a skill script commonly imports.
const STDLIB=new Set(('abc argparse array ast asyncio base64 bisect calendar collections contextlib copy csv dataclasses datetime decimal difflib '+
 'enum fnmatch fractions functools glob hashlib heapq hmac html http io itertools json logging math operator os pathlib pprint random re '+
 'shlex shutil statistics string struct subprocess sys tempfile textwrap time typing unicodedata urllib uuid warnings xml zipfile zlib').split(' '));
function imports(code){return [...new Set([...String(code).matchAll(/^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import|import[ \t]+([\w.,  \t]+))/gm)].flatMap(m=>(m[1]||m[2]).split(',').map(x=>x.trim().split(/[.\s]/)[0]).filter(Boolean)))];}
// Python scripts of a skill that the sandbox can run: standard library only, no subprocesses, small.
function runnable(skill){
 return (skill.files||[]).filter(f=>/\.py$/i.test(f)).flatMap(f=>{
  try{const file=path.join(skill.folder,f),code=fs.readFileSync(file,'utf8');if(code.length>24000)return [];
   const used=imports(code).filter(m=>!(skill.files||[]).some(x=>path.basename(x,'.py')===m));
   if(used.some(m=>!STDLIB.has(m)||m==='subprocess'))return [];return [{file:f,code}];}catch{return [];}
 });
}
function note(skill){
 const scripts=(skill.files||[]).filter(f=>/\.(?:py|sh|js|rb|pl)$/i.test(f));if(!scripts.length)return '';
 const ok=runnable(skill).map(s=>s.file);
 return ' Скрипты навыка сам на компьютере не запускаешь.'+(ok.length?' Эти скрипты на стандартной библиотеке Python можно выполнить в изолированном Python Пети, если пользователь попросит «выполни через Python»: '+ok.join(', ')+'.':'')+(scripts.length>ok.length?' Остальным скриптам нужны программы или библиотеки, которых в изолированном Python нет: опиши, что они делают, и сделай нужное сам по их логике.':'');
}
module.exports={runnable,note,imports,STDLIB};
