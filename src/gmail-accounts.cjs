const {Gmail}=require('./gmail.cjs');
const {randomUUID}=require('node:crypto');
class GmailAccounts{
 constructor(options){Object.assign(this,options);this.Client=options.Client||Gmail;this.clients=new Map();const old=this.load();if(old.tokens)this.save({client:old.client,accounts:[{id:randomUUID(),label:'',email:old.email||'',client:old.client,tokens:old.tokens}]});
  this.login=new this.Client({...options,load:()=>({client:this.load().client}),save:value=>this.accept(value)});
 }
 accounts(){return (this.load().accounts||[]).map(({id,email,label})=>({id,email,label,name:label?(label+' · '+(email||'адрес ещё не определён')):email||'Ранее подключённый Gmail'}));}
 status(){return {configured:!!this.load().client,connected:!!this.accounts().length,accounts:this.accounts(),pending:!!this.login.pending,error:this.login.lastError||''};}
 accept(value){const state=this.load(),accounts=state.accounts||[];const existing=accounts.find(a=>a.email.toLowerCase()===value.email.toLowerCase());if(!existing&&accounts.length>=20)throw Error('Можно подключить до 20 аккаунтов Gmail.');if(existing){this.clients.get(existing.id)?.stop();Object.assign(existing,value);}else accounts.push({id:randomUUID(),label:'',...value});this.save({...state,accounts});}
 importClient(client){this.login.stop();this.login.lastError='';this.save({...this.load(),client});}
 start(){return this.login.start();}
 stop(){this.login.stop();for(const client of this.clients.values())client.stop();}
 disconnect(id){const state=this.load();if(!state.accounts?.some(a=>a.id===id))throw Error('Выберите подключённый аккаунт.');this.login.stop();this.clients.get(id)?.stop();this.clients.delete(id);this.save({...state,accounts:state.accounts.filter(a=>a.id!==id)});}
 rename(id,label){if(typeof label!=='string'||label.length>80)throw Error('Название аккаунта — до 80 символов.');const state=this.load(),row=state.accounts?.find(a=>a.id===id);if(!row)throw Error('Аккаунт отключён.');row.label=label.trim();this.save(state);}
 client(id){if(!this.clients.has(id))this.clients.set(id,new this.Client({enabled:this.enabled,open:this.open,...this.fetcher?{fetcher:this.fetcher}:{},load:()=>{const row=this.load().accounts?.find(a=>a.id===id);if(!row)throw Error('Аккаунт отключён.');return row;},save:value=>{const state=this.load(),index=state.accounts?.findIndex(a=>a.id===id);if(index===undefined||index<0)throw Error('Аккаунт отключён.');state.accounts[index]={...state.accounts[index],client:value.client,tokens:value.tokens,...value.email?{email:value.email}:{}};this.save(state);}}));return this.clients.get(id);}
 async read(recipe){const accounts=this.accounts();let selected=recipe.allAccounts?accounts:recipe.accounts?.length?recipe.accounts.map(id=>accounts.find(a=>a.id===id)||{id,name:'Отключённый аккаунт',missing:true}):accounts.length===1?accounts:[];
  if(!selected.length)throw Error(accounts.length?'Укажите аккаунты в почтовом навыке или скажите при обучении «все аккаунты». Доступны: '+accounts.map(a=>a.name).join(', '):'Подключите аккаунт Gmail в «Подключениях».');
  const results=[];for(const account of selected){try{if(account.missing)throw Error('Этот аккаунт отключён. Измените выбор в навыке.');const client=this.client(account.id);if(!account.email){const token=await client.access();const profile=await client.json('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token}});if(!profile.emailAddress)throw Error('Не удалось определить адрес Gmail.');const state=this.load(),row=state.accounts.find(a=>a.id===account.id);if(!row)throw Error('Аккаунт отключён.');row.email=profile.emailAddress;this.save(state);account.name=account.label?account.label+' · '+row.email:row.email;}
    results.push({account:account.name,...await client.read(recipe)});
   }catch(e){results.push({account:account.name,error:e.message});}}
  return {results};
 }
}
module.exports={GmailAccounts};
