// «Генератор уровней» against the real engine: the Linux build of rtsmcp (PETYA_RTSMCP, default the path below;
// skipped when it is absent). A temporary project from the engine's skirmish template, then the app's own turns:
// generate «2 на 2 с рекой посередине», validate, read the ascii preview, add resources and undo them (the map must
// return bit for bit), save to the project, and a short bot balance check. Nothing outside the temp folder is written.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const RTSMCP=process.env.PETYA_RTSMCP||'/home/claude/chromealex/rts-engine/build/linux-release/rtsmcp';
if(!fs.existsSync(RTSMCP)){console.log('RTS levels with the real rtsmcp: skipped (no '+RTSMCP+')');process.exit(0);}
const engine=require('../src/extensions/rts-levels/engine.cjs');
const {McpClient}=require('../src/extensions/rts-levels/mcp-client.cjs');
const app=require('../src/extensions/rts-levels/feature.cjs');

(async()=>{
 const found=engine.fromPath(RTSMCP,process.platform);
 assert.ok(found?.engine,'the engine folder is found above rtsmcp');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-rtsmcp-'));
 // rtsmcp keeps its recent-projects list (and Linux file associations) under HOME / XDG: keep them in the temp folder.
 for(const [k,d] of [['HOME','home'],['XDG_DATA_HOME','home/.local/share'],['XDG_CONFIG_HOME','home/.config']]){fs.mkdirSync(path.join(root,d),{recursive:true});process.env[k]=path.join(root,d);}
 // The project comes from a template, through rtsmcp itself.
 const setup=new McpClient({command:RTSMCP,args:engine.mcpArgs(found),cwd:path.dirname(RTSMCP),timeout:60000});
 const tools=await setup.listTools();
 for(const name of ['list_projects','create_project','gen_presets','map_generate','map_validate','map_ascii','map_set','entity_place','entity_delete','terrain_paint','terrain_level','undo','map_save','balance_batch'])assert.ok(tools.some(t=>t.name===name),'rtsmcp has '+name);
 const created=await setup.call('create_project',{name:'Petya Test',template:'skirmish',location:root});
 setup.close();
 const gameDir=created.dir;assert.ok(fs.existsSync(path.join(gameDir,'game.json')));
 const mapsBefore=fs.readdirSync(path.join(gameDir,'maps')).sort();

 const topic={id:'t',title:'Чат',projectId:'p',messages:[]};
 const s={settings:{'extension_rts-levels':'true',rtsLevelsEnginePath:RTSMCP},dataRoot:path.join(root,'company'),win:null,saveSettings(p){Object.assign(s.settings,p);},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'p',name:'Тест'}],activeProjectId:'p'}},
  async request(){throw Error('нет модели');}};
 Object.assign(app.deps,{userData:()=>path.join(root,'userData'),env:()=>({PATH:''}),home:()=>path.join(root,'home'),seed:()=>7});
 const {ipc}=app.setup(s);
 ipc.setProject(gameDir);
 const t0=Date.now();
 let r=await app.turn(s,'сгенерируй карту 2 на 2 с рекой посередине');
 const c=r.extensionData.rtsLevels;
 assert.equal(c.type,'map',r.text);
 assert.equal(c.players,4);assert.equal(c.symmetry,'mirror4');assert.equal(c.errors,0,JSON.stringify(c.issues));
 assert.deepEqual(c.roster.map(p=>p.team),[1,2,2,1]);
 const mid=Math.floor(c.size[0]/2);
 assert.ok(c.preview.rows.every(row=>/[~=]/.test(row[mid])),'the river runs through the middle');
 assert.ok(c.preview.rows.filter(row=>row[mid]==='=').length>=3,'with fords');
 assert.ok(c.preview.resources.length>=4,'gold mines found');
 assert.ok(c.paths.length===6&&c.connected);
 assert.deepEqual(fs.readdirSync(path.join(gameDir,'maps')).sort(),mapsBefore,'nothing written before save');
 const generatedIn=Date.now()-t0;
 // Edit, then undo back to the same map.
 r=await app.turn(s,'добавь ещё 2 месторождения у центра');
 const e=r.extensionData.rtsLevels;
 assert.equal(e.preview.resources.length,c.preview.resources.length+2,r.text);
 assert.equal(e.errors,0,JSON.stringify(e.issues));
 r=await app.turn(s,'отмени');
 assert.deepEqual(r.extensionData.rtsLevels.preview,c.preview,'undo restores the map exactly');
 r=await app.turn(s,'сделай реку шире');
 assert.equal(r.extensionData.rtsLevels.river.width,c.river.width+2);assert.equal(r.extensionData.rtsLevels.errors,0);
 // Save into the project through rtsmcp; a second save asks before overwriting.
 const saved=await ipc.save(c.id,{});
 assert.equal(saved.saved,true);
 const file=path.join(gameDir,saved.card.saved.file);
 const json=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(json.players.length,4);assert.deepEqual(json.players.map(p=>p.team),[1,2,2,1]);
 assert.ok(JSON.parse(fs.readFileSync(path.join(gameDir,'game.json'),'utf8')).maps.some(m=>m.file===saved.card.saved.file));
 assert.deepEqual(await ipc.save(c.id,{}),{exists:true,file:saved.card.saved.file});
 // Balance: two bot matches.
 const t1=Date.now();
 const bal=await ipc.balance(c.id,{runs:2});
 assert.equal(bal.balance.runs,2);assert.equal(bal.balance.players.length,4);
 app.teardown();
 fs.rmSync(root,{recursive:true,force:true});
 console.log('RTS levels with the real rtsmcp ('+tools.length+' tools): template project, 2v2 map with a river generated in '+generatedIn+' ms, validated, ascii preview, edit + undo, wider river, saved, balance of 2 matches in '+Math.round((Date.now()-t1)/1000)+' s passed');
})().catch(e=>{console.error(e);app.teardown();process.exit(1);});
