// Voice-command actions apps provide: what a learned voice command («Мои голосовые команды» on «Навыки») can do besides
// Petya's own «Выполнить команду в чате» and «Ответить заданным текстом». An app declares in its extension.json
//   "provides": { "voice-action": "<file>.cjs" }
// and the file exports
//   { id,                       // a-z0-9-, unique in the app; the command stores "<app id>:<id>"
//     label,                    // Russian, for the action list in the command editor
//     help?,                    // Russian, a line under the list: what to write in «Ответ или запрос к сервису»
//     order?,                   // lower first (default 100)
//     legacy?,                  // the action id Petya's core used before the app owned it, for the migration
//     ready?(settings),         // the app's service is connected; the editor lists only added and ready actions
//     async run(services, {output, command, slots}) }
//                               // → {ask, kind?}: a chat request Petya runs (kind: the dialogue reader to use), or a
//                               //   chat turn result of its own
// A command whose action is missing (the app was removed or is not added) runs its filled-in output as a chat command,
// like «Выполнить команду в чате», so it keeps working.
const CORE=['command','answer'];
const ID=/^[a-z][a-z0-9-]{0,40}:[a-z][a-z0-9-]{0,40}$/;
const KIND='voice-action';
const registry=()=>require('./extension-registry.cjs');
function load(dir){
 const build=()=>require('./features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const valid=p&&typeof p.id==='string'&&/^[a-z][a-z0-9-]{0,40}$/.test(p.id)&&typeof p.label==='string'&&p.label.trim()&&p.label.length<=80&&typeof p.run==='function'
   &&(p.ready===undefined||typeof p.ready==='function')&&(p.help===undefined||typeof p.help==='string'&&p.help.length<=400)&&(p.legacy===undefined||typeof p.legacy==='string');
  if(!valid){
   const error=Error('Invalid voice action '+x.extension+'/'+x.file+': {id, label, help?, order?, legacy?, ready?(settings), run(services, {output, command, slots})}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:x.extension+':'+p.id,extension:x.extension,setting:x.setting,app:x.name,provider:p}];
 }).sort((a,b)=>(a.provider.order??100)-(b.provider.order??100)||a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
// Added (the app's catalog switch) and connected (its own `ready`).
function available(x,settings={}){
 if(x.setting&&settings[x.setting]!=='true')return false;
 try{return typeof x.provider.ready!=='function'||!!x.provider.ready(settings);}catch{return false;}
}
// For the command editor: [{id, label, help, app}] of added apps.
const list=(settings,{actions}={})=>(actions||load()).filter(x=>available(x,settings)).map(x=>({id:x.id,label:x.provider.label,help:x.provider.help||'',app:x.app}));
const find=(id,settings,{actions}={})=>(actions||load()).find(x=>x.id===id&&available(x,settings))||null;
// Commands saved with an action id of Petya's core from before apps owned those actions: the app that
// declares it as `legacy` takes them when it is added; otherwise they become «Выполнить команду в чате» with the same
// text, which asks Petya the same request. Returns how many changed.
function migrate(learning,settings,{actions}={}){
 const all=actions||load();let changed=0;
 for(const skill of learning.list().skills||[]){
  if(CORE.includes(skill.action)||ID.test(skill.action||''))continue;
  const owner=all.find(x=>x.provider.legacy===skill.action&&available(x,settings));
  try{if(learning.replaceSkill(skill.id,{action:owner?owner.id:'command'}))changed++;}
  catch(e){console.error('Voice command «'+skill.name+'»:',e.message);}
 }
 return changed;
}
module.exports={KIND,CORE,ID,load,list,find,migrate,available};
