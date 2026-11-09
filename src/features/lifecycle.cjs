// Company lifecycle events for apps' per-company state: Petya's core says what happened, the app decides what its
// own state does about it (so the core resets no app by name). A feature subscribes in `setup(s)`:
//   const lifecycle=require('../../features/lifecycle.cjs');
//   lifecycle.on('settings-saved',({before,after})=>…, s.companyId);
// Events (all synchronous, in the company that is open):
//   'settings-saved'   {before, after}  — the company's settings were saved (after is now s.settings);
//   'project-switched' {project}        — the working project changed (project memory);
//   'topic-removed'    {id}             — a chat was forgotten (its watches, pending choices… go with it);
//   'contexts-cleared' {}               — «Очистить контекст»: everything Petya remembers of this company is cleared;
//   'company-closing'  {companyId}      — the company is being switched away from; its listeners are dropped after.
// A listener that throws is reported and does not stop the others. Listeners of a company that is not the one in
// the event are never called.
const listeners=new Map();
function on(event,fn,company=''){
 if(typeof fn!=='function')throw Error('lifecycle.on: listener must be a function');
 if(!listeners.has(event))listeners.set(event,new Set());
 const row={fn,company:String(company||'')};listeners.get(event).add(row);
 return ()=>listeners.get(event)?.delete(row);
}
function emit(event,payload={},company=''){
 for(const row of [...listeners.get(event)||[]]){
  if(row.company&&company&&row.company!==String(company))continue;
  try{row.fn(payload);}catch(error){console.error('Lifecycle '+event+':',error?.message||error);}
 }
}
// Drops every listener of a company (after 'company-closing'), so a company opened again subscribes afresh.
function drop(company){for(const set of listeners.values())for(const row of [...set])if(row.company===String(company||''))set.delete(row);}
module.exports={on,emit,drop};
