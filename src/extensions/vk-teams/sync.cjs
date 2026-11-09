// Takes the VK Teams bot's events from the queue (events/get after the last event id) into the local store. One sync
// per company folder at a time; a new token (another bot) starts a new store. Progress already taken from the queue is
// saved even when a later batch fails, so no event is read twice or lost on our side.
const crypto=require('node:crypto');
const client=require('./client.cjs');
const store=require('./store.cjs');
const running=new Map();
const tokenKey=settings=>crypto.createHash('sha256').update(client.config(settings).api+'\n'+client.config(settings).token).digest('hex').slice(0,16);

async function sync(s,{rounds=10,now=Date.now}={}){
 if(!client.connected(s.settings))throw Error('VK Teams не подключён.');
 const key=String(s.dataRoot||'');
 if(running.has(key))return running.get(key);
 const work=(async()=>{
  let state=store.read(s.dataRoot);
  const token=tokenKey(s.settings);
  if(state.token!==token){
   const me=await client.self(s);
   state={...store.empty(),token,bot:me.id,botName:me.nick||me.name};
  }
  let added=0,taken=0,round=0;
  try{
   for(;round<rounds;round++){
    const events=await client.events(s,state.lastEventId,0);
    if(!events.length)break;
    taken+=events.length;added+=store.apply(state,events,{now:now()});
   }
   state.syncedAt=now();state.error='';
   return {added,taken,more:round===rounds,state};
  }catch(e){state.error=e.message;throw e;}
  finally{store.write(s.dataRoot,state);}
 })().finally(()=>running.delete(key));
 running.set(key,work);
 return work;
}
// Reads the store after a fresh sync (at most every `fresh` ms). When the service fails but something is stored, the
// stored messages answer with a note instead of an error.
async function current(s,{fresh=30000,now=Date.now}={}){
 const before=store.read(s.dataRoot);
 if(before.token===tokenKey(s.settings)&&now()-before.syncedAt<fresh)return {state:before,notes:[]};
 try{return {state:(await sync(s,{now})).state,notes:[]};}
 catch(e){
  const state=store.read(s.dataRoot);
  if(state.token===tokenKey(s.settings)&&(state.messages.length||Object.keys(state.chats).length))return {state,notes:['Не удалось обновить VK Teams: '+e.message+' Показано полученное раньше.']};
  throw e;
 }
}
module.exports={sync,current,tokenKey};
