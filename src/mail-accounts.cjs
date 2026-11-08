const {GmailAccounts}=require('./gmail-accounts.cjs');
class MailAccounts{
 constructor({google,microsoft}){this.google=new GmailAccounts(google);this.microsoft=new GmailAccounts({...microsoft,Client:require('./outlook.cjs').Outlook});}
 accounts(){return [...this.google.accounts().map(a=>({...a,provider:'Google'})),...this.microsoft.accounts().map(a=>({...a,id:'microsoft:'+a.id,provider:'Microsoft'}))];}
 target(id){return id.startsWith('microsoft:')?[this.microsoft,id.slice(10)]:[this.google,id];}
 rename(id,label){const [m,key]=this.target(id);return m.rename(key,label);}
 disconnect(id){const [m,key]=this.target(id);return m.disconnect(key);}
 stop(){this.google.stop();this.microsoft.stop();}
 status(){const g=this.google.status(),m=this.microsoft.status();return {...g,accounts:this.accounts(),connected:!!this.accounts().length,pending:g.pending||m.pending,error:g.error||m.error,microsoft:m};}
 importClient(c){return this.google.importClient(c);}
 start(){return this.google.start();}
 // A Gmail query over every connected Google account (Outlook has no search here yet).
 async search(q,max=5){const out=[];for(const a of this.google.accounts()){try{out.push(...(await this.google.client(a.id).search(q,max)).map(m=>({...m,account:a.name})));}catch{}}return out;}
 async read(recipe){const all=this.accounts(),ids=recipe.allAccounts?all.map(a=>a.id):recipe.accounts?.length?recipe.accounts:all.length===1?[all[0].id]:[];
  if(!ids.length)throw Error(all.length?'Выберите аккаунты в почтовом навыке.':'Подключите почту в разделе «Подключения → Почта».');
  const results=[];for(const id of ids){const [manager,key]=this.target(id);const r=await manager.read({...recipe,allAccounts:false,accounts:[key]});results.push(...r.results.map(part=>({...part,provider:manager===this.microsoft?'microsoft':'google'})));}return {results};
 }
}
module.exports={MailAccounts};
