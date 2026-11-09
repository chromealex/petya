// The generic registries that let apps plug into Petya's core without the core naming them: chat routes
// (src/features/chat-routes.cjs), the company lifecycle (src/features/lifecycle.cjs) and project detectors
// (src/features/project-detectors.cjs).
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 // --- Chat routes: stage, order, added apps only (unless handlesOff), null passes on, claims, capabilities, resume.
 const routes=require('../src/features/chat-routes.cjs');
 const calls=[];
 const row=(extension,setting,route)=>({id:route.id,extension,setting,route});
 const fixed=[
  row('a','extension_a',{id:'a',stage:'commands',order:20,route:t=>/^альфа/.test(t)?{x:1}:null,run:async()=>{calls.push('a');return {handled:true,by:'a'};}}),
  row('b','extension_b',{id:'b',stage:'commands',order:10,foreground:true,route:t=>/^альфа|^бета/.test(t)?{}:null,run:async(s,r,{text})=>{calls.push('b');return text==='бета'?{handled:true,by:'b'}:null;},
   capability:{id:'b-read',says:'бета',examples:['бета'],reads:()=>true},resume:{kind:'b-input',answer:(s,restart)=>answer=>'b:'+restart.p+answer}}),
  row('c','extension_c',{id:'c',stage:'builds',handlesOff:true,run:async()=>({handled:true,by:'c'})})
 ];
 const s={settings:{extension_a:'true',extension_b:'true'}};
 assert.equal((await routes.turn(s,'альфа',{stage:'commands',routes:fixed})).by,'a','b passed (null), a took it');
 assert.deepEqual(calls,['b','a'],'in order within the stage');
 assert.equal((await routes.turn({settings:{extension_a:'true'}},'бета',{stage:'commands',routes:fixed})),null,'b is not added');
 assert.equal((await routes.turn({settings:{}},'что угодно',{stage:'builds',routes:fixed})).by,'c','handlesOff and no route: asked for everything');
 assert.equal(routes.claims('бета',{routes:fixed}),true);assert.equal(routes.claims('альфа x',{routes:fixed}),true);assert.equal(routes.claims('гамма',{routes:fixed}),false);
 const caps=routes.capabilities({routes:fixed});assert.deepEqual(caps.map(c=>c.id),['b-read']);assert.equal(caps[0].accepts('бета'),true);assert.equal(caps[0].accepts('гамма'),false);
 assert.equal(routes.resume(s,{kind:'b-input',p:'>'},{routes:fixed})('1'),'b:>1');assert.equal(routes.resume(s,{kind:'other'},{routes:fixed}),null);
 // The short form ({id, ready?, turn(services, command)}) answers at the default stage 'shortcuts'.
 const short=[row('d','extension_d',{id:'d',ready:st=>st.dReady==='true',turn:async(_s,command)=>command==='дельта'?{handled:true,by:'d'}:null})];
 assert.equal((await routes.turn({settings:{extension_d:'true',dReady:'true'}},'дельта',{routes:short})).by,'d');
 assert.equal(await routes.turn({settings:{extension_d:'true'}},'дельта',{routes:short}),null,'not ready');
 assert.equal(await routes.turn({settings:{extension_d:'true',dReady:'true'}},'дельта',{stage:'commands',routes:short}),null,'another stage');
 // The bundled routes load and validate.
 assert.deepEqual(routes.load().map(x=>x.id).sort(),['ci-builds','git','mail','slack-digest','slack-media','slack-people','slack-reference','slack-screen','slack-send','telegram-media','telegram-sync','unity']);

 // --- Lifecycle: listeners of the event's company only, a throwing listener stops nothing, drop.
 const lifecycle=require('../src/features/lifecycle.cjs');const seen=[];
 lifecycle.on('topic-removed',({id})=>seen.push('x:'+id),'x');lifecycle.on('topic-removed',()=>{throw Error('boom');},'x');lifecycle.on('topic-removed',({id})=>seen.push('y:'+id),'y');
 const error=console.error;console.error=()=>{};lifecycle.emit('topic-removed',{id:'1'},'x');console.error=error;
 assert.deepEqual(seen,['x:1']);lifecycle.drop('x');lifecycle.emit('topic-removed',{id:'2'},'x');assert.deepEqual(seen,['x:1']);lifecycle.drop('y');

 // --- Project detectors: roots one or two folders down, icon, ranking, versions, a throwing detector skipped.
 const detectors=require('../src/features/project-detectors.cjs');
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'petya-detectors-'));
 try{
  fs.mkdirSync(path.join(base,'Client','Game'),{recursive:true});fs.writeFileSync(path.join(base,'Client','Game','kind.txt'),'v1.2');
  const fixture=[{id:'kind',origin:'bundled',setting:'',detector:{detect:async dir=>fs.existsSync(path.join(dir,'kind.txt')),
   icon:async(project,{load})=>({value:await load(path.join(project,'kind.txt')),file:path.join(project,'kind.txt')}),
   rank:async root=>fs.existsSync(path.join(root,'kind.txt'))?async(file,value)=>value+1:null,versions:async root=>['Версия: '+fs.readFileSync(path.join(root,'kind.txt'),'utf8')]}},
   {id:'broken',origin:'bundled',setting:'',detector:{detect:async()=>{throw Error('x');}}},
   {id:'external',origin:'installed',setting:'extension_external',detector:{detect:async()=>true,versions:async()=>['никогда']}}];
  const found=await detectors.icon(base,{detectors:fixture,load:async file=>'icon:'+path.basename(file)});
  assert.equal(found.value,'icon:kind.txt');assert.ok(found.file.endsWith(path.join('Client','Game','kind.txt')));
  assert.equal(await detectors.ranker(base,{detectors:fixture}),null,'the folder itself is not of that kind');
  assert.equal(await (await detectors.ranker(path.join(base,'Client','Game'),{detectors:fixture}))('f',5),6);
  assert.deepEqual(await detectors.versions(path.join(base,'Client','Game'),{detectors:fixture}),['Версия: v1.2'],'an installed detector counts only while added');
  assert.deepEqual(await detectors.detect(path.join(base,'Client','Game'),{detectors:fixture,settings:{extension_external:'true'}}),['kind','external']);
  assert.deepEqual(detectors.load().map(x=>x.id),['unity']);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
 console.log('Core registries: chat routes (stages, order, added apps, claims, capabilities, resume), company lifecycle and project detectors passed');
})().catch(e=>{console.error(e);process.exit(1);});
