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
 await fs.writeFile(path.join(root,'agents.md'),'Работай с модулем Alpha.');
 await fs.writeFile(path.join(root,'petya.md'),'Пиши отчёт кратко.');
 await fs.appendFile(path.join(root,'.gitignore'),'petya.md\n');
 await fs.writeFile(path.join(root,'src','petya.md'),'NESTED_RULE');
 result=await readProject(root,'combat');assert.deepEqual(result.instructions.map(f=>f.path),['agents.md','petya.md']);
 assert(!result.files.some(f=>/^(agents|petya)\.md$/i.test(f.path)));
 const instructed=dialogueRequest({model:'test',command:'проект',topic:{messages:[{role:'user',text:'Сделай отчёт'},{role:'assistant',text:'Уточни'},{role:'user',text:'Кратко'},{role:'assistant',text:'Хорошо'}]},localProject:result});
 assert(instructed.messages[0].content.includes('Пиши отчёт кратко.'));assert(!instructed.messages[1].content.includes('Пиши отчёт кратко.'));
 assert(!instructed.messages[0].content.includes('NESTED_RULE'));assert(!other.messages[0].content.includes('Пиши отчёт кратко.'));
 await fs.writeFile(path.join(root,'petya.md'),'Новое правило');assert.equal((await readProject(root)).instructions[1].text,'Новое правило');
 await fs.unlink(path.join(root,'petya.md'));assert.equal((await readProject(root)).instructions.length,1);
 await fs.symlink(path.join(root,'README.md'),path.join(root,'petya.md'));await assert.rejects(readProject(root),/обычным файлом/);
 await fs.unlink(path.join(root,'petya.md'));await fs.writeFile(path.join(root,'petya.md'),'x'.repeat(24001));await assert.rejects(readProject(root),/24 КБ/);
 await fs.writeFile(path.join(root,'petya.md'),Buffer.from([255,254,253]));await assert.rejects(readProject(root),/UTF-8/);
 const instructionFeature=require('../src/features/project-instructions.cjs');
 assert.throws(()=>instructionFeature.prompt({instructions:[{path:'petya.md',text:'x'.repeat(24001)}]}),/24 КБ/);
 const multi=instructionFeature.prompt({projects:[{root:'Alpha',instructions:[{path:'AGENTS.md',text:'Alpha rule'}]},{root:'Beta',instructions:[{path:'petya.md',text:'Beta rule'}]}]});
 assert(multi.includes('Alpha rule')&&multi.includes('Beta rule')&&multi.includes('уточни проект'));
 await assert.rejects(()=>readProject(path.join(root,'missing')));
 console.log('local-project tests passed');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
