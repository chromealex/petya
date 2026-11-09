// Voice-command actions apps provide (voice-action, src/voice-actions.cjs): Jira and Google Play declare theirs; the
// command editor lists only added apps' actions; commands saved with the old core actions move once; a command
// whose app is gone runs its text as a chat command; Petya's core names no app action.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const actions=require('../src/voice-actions.cjs');
const {Learning}=require('../src/learning.cjs');
(async()=>{
 const all=actions.load();
 assert.deepEqual(all.map(x=>x.id),['jira:bugs','google-play:anr'],'Jira and Google Play declare their actions, in their order');
 assert.ok(require('../src/features/app-links.cjs').REGISTRIES.includes('voice-action'));
 // Only the actions of added (and connected) apps.
 assert.deepEqual(actions.list({}),[],'no app added: Petya\'s own two only');
 assert.deepEqual(actions.list({module_jira:'true'}).map(a=>[a.id,a.label,a.app]),[['jira:bugs','Проверить баги в Jira','Jira']]);
 assert.deepEqual(actions.list({module_jira:'true',module_googleplay:'true'}).map(a=>a.id),['jira:bugs','google-play:anr']);
 assert.match(actions.list({module_jira:'true'})[0].help,/\{query\}/);
 assert.equal(actions.find('google-play:anr',{module_jira:'true'}),null,'not offered without Google Play');
 // What an action does: a chat request with the dialogue reader of its app.
 assert.deepEqual(await actions.find('jira:bugs',{module_jira:'true'}).provider.run({},{output:'сколько багов в MOBILE'}),{ask:'сколько багов в MOBILE',kind:'bugs'});
 assert.deepEqual(await actions.find('google-play:anr',{module_googleplay:'true'}).provider.run({},{output:'ANR в Puzzle'}),{ask:'ANR в Puzzle',kind:'anr'});

 // Migration of commands saved with the old core ids: to the app's action when it is added, else «run a chat command».
 const old=[{id:'a',name:'Баги',patterns:['что с багами в {query}'],action:'bugs',output:'Покажи баги в {query}',enabled:true},
  {id:'b',name:'ANR',patterns:['анр {query}'],action:'anr',output:'Проверь ANR {query}',enabled:true},
  {id:'c',name:'Привет',patterns:['привет'],action:'answer',output:'Здравствуйте',enabled:true}];
 const learning=new Learning({state:{version:1,skills:structuredClone(old)}});
 assert.equal(actions.migrate(learning,{module_jira:'true'}),2);
 assert.deepEqual(learning.list().skills.map(s=>[s.id,s.action,s.output]),[['a','jira:bugs','Покажи баги в {query}'],['b','command','Проверь ANR {query}'],['c','answer','Здравствуйте']]);
 assert.equal(actions.migrate(learning,{module_jira:'true',module_googleplay:'true'}),0,'once');
 assert.deepEqual(learning.execute('что с багами в MOBILE'),{action:'jira:bugs',output:'Покажи баги в MOBILE',slots:{query:'MOBILE'}});
 assert.deepEqual(learning.execute('анр Puzzle'),{command:'Проверь ANR Puzzle'},'without Google Play the text runs as a chat command');
 // A command of a removed app keeps its action and is still valid to save.
 assert.ok(learning.put({...learning.list().skills[0],name:'Баги 2'}));

 // The core has no app action: no ids, labels or help texts of Jira / Google Play.
 const root=path.join(__dirname,'..');
 const files=[];const walk=(dir,ok)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory())walk(rel,ok);else if(ok(rel))files.push(rel);}};
 for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js)$/.test(e.name))files.push('src/'+e.name);
 walk('src/features',f=>/\.cjs$/.test(f)&&!/extension-[a-z-]+\.cjs$/.test(f));walk('src/ui',f=>/\.(?:js|html)$/.test(f));
 for(const file of files){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(/live-cases/.test(file))continue;
  assert.ok(!/Проверить баги в Jira|Проверить ANR|проверяю баги|проверяю ANR|value="(?:bugs|anr)"|\['command','answer','bugs'/.test(text),file+' names an app action');
 }
 console.log('Voice actions: Jira and Google Play provide theirs, list follows added apps, legacy commands migrate once, a missing app falls back to a chat command, no app action in the core passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
