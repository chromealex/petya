// Shared text helpers for cross-app links (src/features/app-links.cjs): the chat requests that hand a prepared
// task or message to the app whose own flow previews and confirms it.
const one=v=>String(v||'').replace(/\s+/g,' ').trim();
const safe=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}};
// «Заголовок. Описание. Ссылка: …» — one line, bounded, links only http(s).
function taskBody({title,description,link}={}){
 const head=one(title).slice(0,300);if(!head)throw Error('Нет названия задачи.');
 const text=[head.replace(/[.\s]+$/,''),one(description).slice(0,1500)].filter(Boolean).join('. ');
 const url=safe(link);
 return (text+(url?'. Ссылка: '+url:'')).slice(0,2000);
}
module.exports={taskBody,one,safe};
