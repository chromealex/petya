const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const notifications=[];let receive,requested;
 const snapshot={id:'python:one',busy:true,text:'Выполняю Python…',version:'running'};
 const context={window:{petyaEvents:{onPythonProgress:fn=>{receive=fn;}},petya:{feature:async(...args)=>{requested=args;return snapshot;}}},document:{dispatchEvent:event=>notifications.push(event.detail)},CustomEvent:class{constructor(name,{detail}){this.detail=detail;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/extensions/python/notifications.js'),'utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requested,['python','progress']);assert.equal(notifications[0],snapshot);
 receive({...snapshot,busy:false,version:'success'});assert.equal(notifications[1].id,notifications[0].id);assert.equal(notifications[1].busy,false);
 const element=tag=>({tag,children:[],append(...items){this.children.push(...items);}});
 context.document.createElement=element;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/extensions/python/chat.js'),'utf8'),context);
 const parent=element('div');context.window.renderPythonExecution(parent,{code:'<img onerror="bad()">',ok:true});
 assert.equal(parent.children[0].children[1].children[0].textContent,'<img onerror="bad()">');
 console.log('Python UI: settings-independent progress, snapshot restoration, stable completion and plain-text source rendering passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
