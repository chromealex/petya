// Finding Unity by itself: the MCP for Unity server on the usual local addresses, and Petya's projects that are Unity
// projects with or without the MCP for Unity package. `install` adds the package to a project's
// Packages/manifest.json (Unity imports it the next time the editor is focused); nothing else in the project changes.
const fs=require('node:fs'),path=require('node:path');
const PACKAGE='com.coplaydev.unity-mcp',SOURCE='https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main';
const CANDIDATES=['http://127.0.0.1:8080/mcp','http://localhost:8080/mcp','http://127.0.0.1:8081/mcp','http://127.0.0.1:8000/mcp','http://127.0.0.1:8090/mcp'];
// The first address that answers as MCP for Unity (the saved one first); each probe is short.
async function server({saved,token,probe}){
  for(const url of [...new Set([saved,...CANDIDATES].filter(Boolean))]){try{const found=await probe(url,token);if(found)return {url,...found};}catch{}}
  return null;
}
const isUnity=dir=>{try{return fs.statSync(path.join(dir,'ProjectSettings','ProjectSettings.asset')).isFile();}catch{return false;}};
// A Unity project inside a folder: the folder itself or one or two levels down («Client/», «Game/Unity/»).
function unityRoots(folder){
  const out=[],queue=[[folder,0]];
  while(queue.length&&out.length<4){const [dir,depth]=queue.shift();if(isUnity(dir)){out.push(dir);continue;}if(depth>=2)continue;
    let items=[];try{items=fs.readdirSync(dir,{withFileTypes:true});}catch{}
    for(const item of items)if(item.isDirectory()&&!item.name.startsWith('.')&&!['node_modules','Library','Temp','Builds','obj','bin'].includes(item.name))queue.push([path.join(dir,item.name),depth+1]);}
  return out;
}
function manifest(root){try{return JSON.parse(fs.readFileSync(path.join(root,'Packages','manifest.json'),'utf8'));}catch{return null;}}
const hasPackage=root=>!!manifest(root)?.dependencies?.[PACKAGE];
function projects(rows){
  const out=[];
  for(const {id,name,folders} of rows)for(const folder of folders)for(const root of unityRoots(folder))if(!out.some(o=>o.root===root))out.push({projectId:id,project:name,root,name:path.basename(root)==='Client'?path.basename(path.dirname(root)):path.basename(root),installed:hasPackage(root)});
  return out;
}
function install(root){
  if(!isUnity(root))throw Error('Это не проект Unity.');
  const file=path.join(root,'Packages','manifest.json'),data=manifest(root);
  if(!data||typeof data.dependencies!=='object')throw Error('Не удалось прочитать Packages/manifest.json проекта.');
  if(data.dependencies[PACKAGE])return {installed:true,changed:false};
  data.dependencies[PACKAGE]=SOURCE;
  const raw=fs.readFileSync(file,'utf8'),indent=(raw.match(/\n(\s+)"/)||[])[1]||'  ';
  fs.writeFileSync(file+'.petya-tmp',JSON.stringify(data,null,indent)+(raw.endsWith('\n')?'\n':''));fs.renameSync(file+'.petya-tmp',file);
  return {installed:true,changed:true};
}
module.exports={server,projects,install,unityRoots,PACKAGE,SOURCE,CANDIDATES};
