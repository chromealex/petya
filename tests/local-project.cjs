const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {promisify}=require('node:util'),exec=promisify(require('node:child_process').execFile);
const {readProject,safeFile}=require('../src/local-project.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'petya-project-'));
 try{
 await exec('git',['init',root]);await fs.mkdir(path.join(root,'src'));
 await fs.writeFile(path.join(root,'README.md'),'Project Alpha');await fs.writeFile(path.join(root,'src','combat.cs'),'combat logic');
 await fs.writeFile(path.join(root,'.env'),'SECRET');await fs.writeFile(path.join(root,'credentials.json'),'SECRET');
 await fs.writeFile(path.join(root,'.gitignore'),'ignored.md\n');await fs.writeFile(path.join(root,'ignored.md'),'SECRET');
 await fs.symlink(path.join(root,'credentials.json'),path.join(root,'README-link.md'));
 let result=await readProject(root,'combat');assert(result.files.some(f=>f.path==='src/combat.cs'));assert(result.files.some(f=>f.text==='Project Alpha'));
 assert(!JSON.stringify(result).includes('SECRET'));assert(!result.structure.includes('ignored.md'));
 assert.equal(await safeFile(root,'../outside.md'),null);assert.equal(await safeFile(root,'README-link.md'),null);
 await fs.writeFile(path.join(root,'README.md'),'Updated');result=await readProject(root);assert(result.files.some(f=>f.text==='Updated'));
 const {dialogueRequest}=require('../src/dialogue-request.cjs');const req=dialogueRequest({model:'test',command:'проект',topic:{title:'Alpha',messages:[]},localProject:result});assert(req.messages[1].content.includes('Updated'));
 const other=dialogueRequest({model:'test',command:'проект',topic:{title:'Beta',messages:[]}});assert(!other.messages[1].content.includes('Updated'));
 await assert.rejects(()=>readProject(path.join(root,'missing')));
 console.log('local-project tests passed');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
