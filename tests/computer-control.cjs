const assert=require('node:assert/strict');
const {ComputerControl,parseCommand}=require('../src/computer-control.cjs');
(async()=>{
 let calls=[];const run=async a=>{calls.push(a);return a.type==='apps'?[{pid:123,name:'Editor',identity:'test.editor'}]:{ok:true};};
 let granted=false;const permission=new ComputerControl({platform:'darwin',run,access:()=>granted});
 assert.equal(permission.status().accessGranted,false);granted=true;assert.equal(permission.status().accessGranted,true);granted=false;assert.equal(permission.status().accessGranted,false);
 const c=new ComputerControl({platform:'darwin',run});
 assert.deepEqual(parseCommand('Петя, введи текст Привет'),{type:'text',text:'Привет'});
 assert.equal(parseCommand('объясни, как нажми ввод'),null);
 assert.equal(parseCommand('не нажми ввод'),null);
 assert.equal(parseCommand('нажми выделить всё').key,'selectAll');
 await assert.rejects(c.execute({type:'text',text:'hello'}),/Включите/);
 await c.start({mode:'app',pid:123});
 await assert.rejects(c.execute({type:'click',x:1,y:1}),/только/);
 await assert.rejects(c.execute({type:'key',key:'shell'}),/не поддерживается/);
 await assert.rejects(c.execute({type:'text',text:'x'.repeat(4001)}),/4000/);
 await c.command('введи текст $(touch /tmp/no)');assert.equal(calls.at(-1).text,'$(touch /tmp/no)');
 const before=calls.length;await c.start({mode:'desktop'});assert.equal(calls.length,before,'Desktop mode must not enumerate or select apps');assert.equal(c.status().target,null);
 await c.command('клик 500 300');assert.equal(calls.at(-1).type,'click');assert.ok(!('pid' in calls.at(-1)));
 await c.command('нажми ввод');assert.equal(calls.at(-1).mode,'desktop');assert.ok(!('pid' in calls.at(-1)));
 await c.command('введи текст Привет');assert.ok(!('pid' in calls.at(-1)));
 await c.command('останови управление');assert.equal(c.status().mode,'off');
 await assert.rejects(c.start({mode:'app',pid:999}),/Выберите/);
 const denied=new ComputerControl({platform:'darwin',run,access:()=>false});await assert.rejects(denied.start({mode:'app',pid:123}),/доступ/);
 let release;const slow=new ComputerControl({platform:'darwin',run:()=>new Promise(r=>release=r)});const starting=slow.start({mode:'app',pid:123});slow.stop();release([{pid:123,name:'Editor',identity:'test.editor'}]);await assert.rejects(starting,/отменено/);assert.equal(slow.status().mode,'off');
 let aborted=false;const active=new ComputerControl({platform:'darwin',run:async(a,signal)=>a.type==='apps'?[{pid:123,name:'Editor',identity:'test.editor'}]:new Promise((r,j)=>signal.addEventListener('abort',()=>{aborted=true;j(Error('aborted'));}))});await active.start({mode:'app',pid:123});const action=active.execute({type:'key',key:'enter'});await assert.rejects(active.execute({type:'key',key:'enter'}),/Дождитесь/);active.stop();await assert.rejects(action,/aborted/);assert.ok(aborted);

 let saved=null;const storage={load:()=>saved,save:value=>{saved=structuredClone(value);}};
 const persistent=new ComputerControl({platform:'darwin',run,...storage});await persistent.start({mode:'desktop'});persistent.suspend();
 const restored=new ComputerControl({platform:'darwin',run,...storage});assert.equal(restored.status().mode,'desktop');assert.equal(restored.status().persistent,true);
 restored.stop();assert.equal(new ComputerControl({platform:'darwin',run,...storage}).status().mode,'off');
 await persistent.start({mode:'app',pid:123});assert.equal(saved.target.identity,'test.editor');assert.ok(!('pid' in saved.target));
 let sent;
 const rebound=new ComputerControl({platform:'darwin',...storage,run:async a=>a.type==='apps'?[{pid:456,name:'Editor',identity:'test.editor'}]:(sent=a,{ok:true})});
 await rebound.execute({type:'key',key:'enter'});assert.equal(sent.pid,456);
 await assert.rejects(rebound.execute({type:'focus',name:'Editor'}),/только/);
 await assert.rejects(rebound.execute({type:'hotkey',key:'tab',modifiers:['meta']}),/переключить/);
 const wrong=new ComputerControl({platform:'darwin',...storage,run:async()=>[{pid:123,name:'Editor',identity:'other.app'}]});await assert.rejects(wrong.execute({type:'key',key:'enter'}),/не запущено/);
 const revoked=new ComputerControl({platform:'darwin',...storage,run,access:()=>false});assert.equal(revoked.status().mode,'app');await assert.rejects(revoked.execute({type:'key',key:'enter'}),/ОС/);
 assert.equal(new ComputerControl({platform:'darwin',load:()=>{throw Error('bad json');}}).status().mode,'off');
 await c.start({mode:'desktop'});
 for(const command of ['нажми Cmd+Shift+S','прокрути вниз 5','двойной клик -10 20','правый клик 10 20','перетащи 10 20 в 30 40','переключись на приложение Editor'])await c.command(command);
 assert.equal(calls.at(-1).type,'focus');assert.equal(calls.at(-1).pid,123);
 await assert.rejects(c.execute({type:'hotkey',key:'x',modifiers:['shell']}),/Некорректное/);
 await assert.rejects(c.execute({type:'scroll',direction:'down',amount:101}),/100/);
 await assert.rejects(c.execute({type:'drag',x:0,y:0,toX:Infinity,toY:0}),/координаты/);
 await assert.rejects(c.execute({type:'click',x:0,y:0,count:3}),/клик/);
 assert.equal(parseCommand('не прокрути вниз 5'),null);
 assert.equal(parseCommand('объясни перетащи 10 20 в 30 40'),null);
 assert.deepEqual(parseCommand('нажми Cmd+Shift+S'),{type:'hotkey',key:'s',modifiers:['meta','shift']});

 const cleanup=[];
 const dragging=new ComputerControl({platform:'darwin',run:async(a,signal)=>{cleanup.push(a.type);if(a.type==='drag')return new Promise((r,j)=>signal.addEventListener('abort',()=>j(Error('aborted'))));return {};}});
 await dragging.start({mode:'desktop'});const drag=dragging.execute({type:'drag',x:0,y:0,toX:20,toY:20});dragging.stop();await assert.rejects(drag,/aborted/);assert.deepEqual(cleanup,['drag','release']);
 console.log('computer control: ok');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Desktop actions must not activate a saved process before sending input.
{
 const vm=require('node:vm'),fs=require('node:fs');
 const sent=[];
 const se={applicationProcesses:{whose(){throw Error('Desktop mode must not select a process');}},keystroke:text=>sent.push(text),keyCode:key=>sent.push(key),click:point=>sent.push(point)};
 const context={Application:()=>se,delay(){throw Error('Desktop mode must not activate an app');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/computer-macos.js'),'utf8'),context);
 context.run([JSON.stringify({mode:'desktop',type:'text',text:'Hello'})]);
 context.run([JSON.stringify({mode:'desktop',type:'key',key:'enter'})]);
 context.run([JSON.stringify({mode:'desktop',type:'click',x:10,y:20})]);
 assert.equal(sent[0],'Hello');assert.equal(sent[1],36);assert.equal(sent[2].at[0],10);
}
