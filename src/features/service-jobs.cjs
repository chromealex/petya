// Background work of service apps (a sync, a watcher of an open window) driven by Petya's background round
// (main.cjs backgroundTick, every few seconds while the window is open), so the core knows no service by name.
// An app adds a job from its feature `setup`:
//   services.serviceJobs.add({id, tick?(), status?() → {message, pending?, updatedAt?}, busy?() → bool,
//     changed?(previous, next) → bool, reset?(), clear?()})
// `tick` runs once per round (errors are logged, never stop the round); `status` is published to the window as
// `background-status` under the job id; `busy` blocks a company switch while true; `changed` is told about every
// settings save and returns true when the job's source changed (its derived watchers are reset then); `reset` runs on
// a company switch, `clear` (or `reset`) on «Очистить материалы». Jobs live with their company: a new setup (company
// switch) starts with none, so a job never outlives the company that added it.
let current=null;
function create(){
 const jobs=new Map();
 const each=fn=>{for(const job of jobs.values()){try{fn(job);}catch(error){console.error('Service job '+job.id+':',error.message);}}};
 return {
  add(job){
   if(!job||typeof job.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(job.id))throw Error('Service job needs an id');
   jobs.set(job.id,job);return ()=>{if(jobs.get(job.id)===job)jobs.delete(job.id);};
  },
  async tick(){for(const job of [...jobs.values()]){try{await job.tick?.();}catch(error){console.error('Service job '+job.id+':',error.message);}}},
  status(){const out={};each(job=>{if(typeof job.status==='function')out[job.id]=job.status();});return out;},
  busy(){let busy=false;each(job=>{if(job.busy?.())busy=true;});return busy;},
  changed(previous,next){const hit=[];each(job=>{if(job.changed?.(previous||{},next||{}))hit.push(job.id);});return hit;},
  reset(){each(job=>job.reset?.());},
  clear(){each(job=>(job.clear||job.reset)?.call(job));},
  ids:()=>[...jobs.keys()]
 };
}
module.exports={name:'serviceJobs',defaults:{},validate(){},create,current:()=>current,
 setup(){current=create();return {serviceJobs:current};}};
