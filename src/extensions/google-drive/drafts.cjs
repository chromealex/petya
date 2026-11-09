// Texts other apps' cards hand over for «Сохранить в Google Документы» (cross-app kind `document-export`), kept in
// memory until the chat turn turns them into a confirmation card. Nothing is written here: the card shows a preview,
// the user checks the title and presses «Создать документ».
const {randomBytes}=require('node:crypto');
const TTL=2*3600000,MAX_TEXT=200000;
const pending=new Map();
const line=(v,n)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
// payload: {title, text (Markdown), app?} → a clean draft or an error.
function clean(payload){
 const text=String(payload?.text??'').replace(/\r\n?/g,'\n').trim();
 if(!text)throw Error('Нет текста для документа.');
 return {title:line(payload?.title,200),text:text.slice(0,MAX_TEXT),truncated:text.length>MAX_TEXT,app:line(payload?.app,60)};
}
function put(payload,now=Date.now()){
 for(const [k,v] of pending)if(now-v.at>TTL)pending.delete(k);
 const id=randomBytes(4).toString('hex');
 pending.set(id,{...clean(payload),at:now});
 return id;
}
function take(id,now=Date.now()){const v=pending.get(String(id||''));if(!v||now-v.at>TTL)return null;pending.delete(String(id));return v;}
module.exports={put,take,clean,MAX_TEXT,_pending:pending};
