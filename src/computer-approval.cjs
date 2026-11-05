const {randomUUID}=require('node:crypto');
class ComputerApproval{
 constructor({computer,scope,execute,now=Date.now}){Object.assign(this,{computer,scope,execute,now});this.pending=new Map();this.resumers=new Map();}
 register(type,handler){this.resumers.set(type,handler);}
 request(command,action){for(const [id,p]of this.pending)if(this.now()-p.at>600000)this.pending.delete(id);const id=randomUUID();this.pending.set(id,{command,action:structuredClone(action),scope:this.scope(),at:this.now()});return {handled:true,computerApproval:id,text:'Для этого запроса нужен доступ к управлению компьютером. Разрешить на время выполнения запроса?'};}
 async decide(id,allow){const p=this.pending.get(id);if(!p)throw Error('Этот запрос уже завершён или отменён.');if(allow!==true){this.pending.delete(id);return {handled:true,text:'Доступ не предоставлен. Запрос отменён.',denied:true};}if(this.now()-p.at>600000||p.scope!==this.scope()){this.pending.delete(id);throw Error('Чат или компания изменились либо запрос устарел. Отправьте его в нужном чате.');}const status=this.computer.status();if(!status.accessGranted)return {needsSystemPermission:true};this.pending.delete(id);const temporary=status.mode==='off';try{if(temporary)await this.computer.start({mode:'desktop',remember:false});return await (this.resumers.get(p.action?.type)||this.execute)(p.command,p.action);}finally{if(temporary)this.computer.stop();}}
}
module.exports={ComputerApproval};
