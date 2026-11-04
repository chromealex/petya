const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const blocked=/(^|\/)(?:\.[^/]+|node_modules|vendor|dist|build|runtime|coverage|Library|Temp|obj|bin)(\/|$)|(?:secret|credential|token|password|private[-_]?key)|(?:\.lock|\.pem|\.key|\.p12|\.pfx)$/i;
const allowed=/\.(?:md|txt|json|[cm]?js|jsx|tsx?|cs|py|rs|go|java|html|css|ya?ml|toml|cpp|h|swift)$/i;
async function rootFolder(value){if(typeof value!=='string'||!path.isAbsolute(value))throw Error('Выберите папку проекта.');const root=await fs.realpath(value);if(!(await fs.stat(root)).isDirectory())throw Error('Папка проекта недоступна.');return root;}
async function safeFile(root,relative){
 const parts=relative.split('/');if(parts.some(p=>!p||p==='..')||path.isAbsolute(relative)||blocked.test(relative)||!allowed.test(relative))return null;
 let file=root;for(const part of parts){file=path.join(file,part);if((await fs.lstat(file)).isSymbolicLink())return null;}
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>128000)return null;
 const data=await fs.readFile(file);if(data.includes(0))return null;
 return data.toString('utf8');
}
async function readProject(value,command=''){
 const root=await rootFolder(value);let names,limited=false;
 try{const {stdout}=await exec('git',['-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{timeout:5000,maxBuffer:2*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});names=stdout.split('\0').filter(Boolean);}
 catch{names=(await fs.readdir(root,{withFileTypes:true})).filter(e=>e.isFile()).map(e=>e.name);limited=true;}
 names=[...new Set(names)].filter(n=>!blocked.test(n)&&allowed.test(n)).sort();if(names.length>2000){names=names.slice(0,2000);limited=true;}
 const words=String(command).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu)||[];
 const score=n=>(/^(?:readme(?:\.[^.]+)?|agents\.md|package\.json|pyproject\.toml|cargo\.toml)$/i.test(n)?100:0)+words.filter(w=>n.toLowerCase().includes(w)).length*20;
 const candidates=names.filter(n=>score(n)>0).sort((a,b)=>score(b)-score(a)||a.localeCompare(b)).slice(0,8);
 const files=[];let remaining=14000;
 for(const name of candidates){try{const content=await safeFile(root,name);if(content===null)continue;const text=content.slice(0,Math.min(5000,remaining));if(!text)break;files.push({path:name,text,truncated:text.length<content.length});remaining-=text.length;}catch{limited=true;}}
 return {root,readAt:new Date().toISOString(),files,structure:names.slice(0,100),partial:true,notice:limited?'Неполная выборка; без Git доступны только файлы корня.':'Выборка документации и файлов по словам в вопросе, не полный анализ репозитория.'};
}
module.exports={readProject,rootFolder,safeFile};
