// A profile owns its IPC handlers and lifecycle listeners; the application stays alive.
class CompanyLifecycle {
 constructor({app,powerMonitor,ipcMain}) {
  Object.assign(this,{app,powerMonitor,ipcMain});this.names=new Set();this.closed=false;this.controller=new AbortController();
  this.before=new Map([app,powerMonitor].map(emitter=>[emitter,new Map(emitter.eventNames().map(event=>[event,new Set(emitter.rawListeners(event))]))]));
 }
 capture(){
  this.listeners=[];
  for(const [emitter,events] of this.before)for(const event of emitter.eventNames())for(const listener of emitter.rawListeners(event)){
   if(!events.get(event)?.has(listener))this.listeners.push({emitter,event,listener});
  }
 }
 options(options={}){return {...options,signal:options.signal?AbortSignal.any([options.signal,this.controller.signal]):this.controller.signal};}
 check(){if(this.closed)throw Error('Компания уже переключена. Повторите действие в текущей компании.');}
 async close(){
  if(this.closed)return;if(!this.listeners)this.capture();this.closed=true;this.controller.abort(Error('Компания переключена.'));
  for(const name of this.names)this.ipcMain.removeHandler('petya:'+name);
  for(const {emitter,event,listener} of this.listeners||[])emitter.removeListener(event,listener);
  const errors=[];
  for(const {emitter,event,listener} of this.listeners||[])if(emitter===this.app&&['before-quit','will-quit'].includes(event)){
   try{await (listener.listener||listener).call(emitter,{preventDefault(){}});}catch(error){errors.push(error);}
  }
  if(errors.length)throw new AggregateError(errors,'Не удалось закрыть операции компании.');
 }
}
module.exports={CompanyLifecycle};
