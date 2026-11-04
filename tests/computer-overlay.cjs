const assert=require('node:assert/strict');
const {ComputerOverlay}=require('../src/computer-overlay.cjs');
class Window{
 constructor(options){this.options=options;this.visible=false;this.webContents={send:(name,state)=>this.message={name,state},setWindowOpenHandler:fn=>this.openHandler=fn,on:()=>{}};}
 setIgnoreMouseEvents(...args){this.ignore=args;}setAlwaysOnTop(...args){this.top=args;}setVisibleOnAllWorkspaces(...args){this.workspaces=args;}
 async loadFile(file){this.file=file;}isDestroyed(){return !!this.destroyed;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}destroy(){this.destroyed=true;}setBounds(bounds){this.bounds=bounds;}
}
(async()=>{
 const screen={getDisplayMatching:()=>({bounds:{x:-1920,y:0,width:1920,height:1080}}),screenToDipPoint:p=>({x:p.x/2,y:p.y/2}),screenToDipRect:(_w,r)=>({x:r.x/2,y:r.y/2,width:r.width/2,height:r.height/2})};
 let timer;const overlay=new ComputerOverlay({BrowserWindow:Window,screen,platform:'darwin',setTimer:fn=>(timer=fn,1),clearTimer:()=>{}});
 await overlay.begin({type:'click'});overlay.update({window:{x:-1800,y:100,width:800,height:600,name:'Telegram'},pointer:{x:-1200,y:200}});
 assert.equal(overlay.windows.cursor.bounds.x,-1208);assert.equal(overlay.windows.badge.bounds.x,-1264);
 for(const w of Object.values(overlay.windows)){assert.equal(w.options.focusable,false);assert.deepEqual(w.ignore,[true,{forward:true}]);assert.equal(w.visible,true);assert.equal(w.openHandler().action,'deny');}
 overlay.finish(true);assert.equal(overlay.windows.badge.message.state.phase,'done');const oldTimer=timer;
 await overlay.begin({type:'search'});overlay.update({pointer:{x:-100,y:90}});oldTimer();assert.equal(overlay.windows.cursor.visible,true,'Old finish timer must not hide the next action');
 overlay.clear();overlay.update({pointer:{x:20,y:20}});assert.equal(overlay.windows.cursor.visible,false,'Late native events must not resurrect a stopped overlay');
 await overlay.begin({type:'key'});overlay.update({pointer:{x:0,y:0}});overlay.finish(false);assert.equal(overlay.windows.cursor.visible,false);
 const windows=new ComputerOverlay({BrowserWindow:Window,screen,platform:'win32'});await windows.begin({type:'drag'});windows.update({pointer:{x:800,y:400}});assert.equal(windows.windows.cursor.bounds.x,392);assert.equal(windows.windows.cursor.bounds.y,192);windows.dispose();
 overlay.dispose();assert.deepEqual(overlay.windows,{});
 const {ComputerControl}=require('../src/computer-control.cjs');const calls=[];
 const control=new ComputerControl({platform:'darwin',visual:{begin:async()=>calls.push('begin'),finish:ok=>calls.push(ok?'done':'failed'),clear:()=>calls.push('clear')},run:async()=>{calls.push('native');return {};}});
 await control.start({mode:'desktop'});calls.length=0;await control.execute({type:'click',x:10,y:10});assert.deepEqual(calls,['begin','native','done']);control.stop();assert.equal(calls.at(-1),'clear');

 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');const sandbox={module:{exports:{}},__dirname:path.dirname(require.resolve('../src/computer-control.cjs')),process,Buffer,AbortController};
 const progress=[];sandbox.require=name=>name==='node:child_process'?{execFile:(_file,args,_options,callback)=>{assert.equal(JSON.parse(args.at(-1)).visual,true);const stderr=new EventEmitter();setImmediate(()=>{stderr.emit('data','ignored log\nPETYA_CON');stderr.emit('data','TROL:'+JSON.stringify({pointer:{x:7,y:8}})+'\n');callback(null,'{"ok":true}');});return {stderr};}}:require(name);
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/computer-control.cjs'),'utf8'),sandbox);
 const NativeControl=sandbox.module.exports.ComputerControl;const native=new NativeControl({platform:'darwin',visual:{begin:async()=>{},update:event=>progress.push(event),clear:()=>{},finish:()=>{}}});await native.start({mode:'desktop'});await native.execute({type:'click',x:7,y:8});assert.equal(progress.length,1);assert.equal(progress[0].pointer.x,7);
 console.log('Control overlay: passthrough, no focus, native lifecycle, negative coordinates, DPI and cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
