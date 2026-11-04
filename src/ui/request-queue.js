class RequestQueue {
 constructor({execute,blocked=()=>false,change=()=>{}}){Object.assign(this,{execute,blocked,change});this.items=[];this.active=null;this.paused=false;this.nextId=1;}
 add(text,first=false){text=String(text).trim();if(!text)return null;if(this.items.length>=30)throw Error('В очереди уже 30 запросов. Удалите лишние или дождитесь выполнения.');const item={id:this.nextId++,text};first?this.items.unshift(item):this.items.push(item);this.change();return item;}
 edit(id,text){const item=this.items.find(i=>i.id===id);if(item&&text.trim())item.text=text.trim();this.change();}
 remove(id){this.items=this.items.filter(i=>i.id!==id);this.change();}
 first(id){const item=this.items.find(i=>i.id===id);if(item){this.items=this.items.filter(i=>i.id!==id);this.items.unshift(item);this.change();}}
 async drain(){if(this.active||this.paused||this.blocked()||!this.items.length)return;const item=this.items.shift();this.active=item;this.change();try{await this.execute(item.text);}catch(error){this.items.unshift(item);this.paused=true;throw error;}finally{this.active=null;this.change();}}
}
if(typeof module!=='undefined')module.exports={RequestQueue};
