const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {Companies}=require('../src/companies.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-companies-'));
try{
 fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({jiraToken:'secret',teamMembers:'old team'}));fs.writeFileSync(path.join(root,'dialogue-memory.json'),'old dialogue');
 let c=new Companies(root);assert.equal(c.directory('default'),root);assert.equal(c.state.activeId,'default');
 const b=c.create('Вторая компания',{jiraToken:'never copy',teamMembers:'never copy',gmailCredential:'never copy',module_slack:'true',model:'qwen3:4b',ollamaUrl:'http://localhost:11434/api/chat'});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.directory(b.id),'settings.json'))),{model:'qwen3:4b',ollamaUrl:'http://localhost:11434/api/chat'});
 assert.ok(!fs.existsSync(path.join(c.directory(b.id),'dialogue-memory.json')));
 const pinnedOldDirectory=c.directory(c.state.activeId);c.select(b.id);c=new Companies(root);assert.equal(c.state.activeId,b.id);assert.notEqual(c.directory(b.id),root);
 fs.writeFileSync(path.join(pinnedOldDirectory,'context-memory.json'),'old in-flight write');assert.ok(!fs.existsSync(path.join(c.directory(b.id),'context-memory.json')));
 fs.writeFileSync(path.join(c.directory(b.id),'dialogue-memory.json'),'second dialogue');c.rename('default','Первая компания');c.select('default');c=new Companies(root);assert.equal(fs.readFileSync(path.join(c.directory(c.state.activeId),'dialogue-memory.json'),'utf8'),'old dialogue');
 assert.equal(fs.readFileSync(path.join(c.directory(b.id),'dialogue-memory.json'),'utf8'),'second dialogue');
 assert.throws(()=>c.create('первая компания'));assert.throws(()=>c.select('../'));assert.throws(()=>c.rename('default',' '));assert.throws(()=>c.directory('../../'));
 const before=fs.readFileSync(c.file,'utf8');fs.writeFileSync(c.file,'{broken');assert.throws(()=>new Companies(root));assert.equal(fs.readFileSync(c.file,'utf8'),'{broken');fs.writeFileSync(c.file,before);
 console.log('Companies: migration, isolated data, restart selection, pinned writes, settings allowlist, rename and invalid registry passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
