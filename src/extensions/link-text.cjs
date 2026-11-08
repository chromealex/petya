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
// Several tasks at once (e.g. a meeting's tasks): «по встрече «…»:\n- …» for the tracker's batch flow.
function taskList({title,tasks}={}){
 const rows=(Array.isArray(tasks)?tasks:[]).map(t=>one(typeof t==='string'?t:t?.title).slice(0,300)).filter(Boolean).slice(0,30);
 if(!rows.length)throw Error('Нет задач.');
 return (one(title)?' по встрече «'+one(title).slice(0,200)+'»':'')+':\n'+rows.map(r=>'- '+r).join('\n');
}
module.exports={taskBody,taskList,one,safe};
