const {createHash}=require('node:crypto');
const levels=[['Джун',0,'Осваивает ваши первые правила'],['Джун+',50,'Запоминает рабочие формулировки'],['Мидл',150,'Накопил набор рабочих навыков'],['Мидл+',350,'Знает больше правил и сценариев'],['Сеньор',650,'Накопил обширную базу знаний'],['Сеньор+',1100,'Расширяет опыт в разных сценариях'],['Лид',1800,'Достиг верхней ступени шкалы знаний']].map(([name,xp,description])=>({name,xp,description}));
const collections=['skills','dictionary','recipes'];
function content(collection,item){
 const fields=collection==='skills'?['action','patterns','output']:collection==='dictionary'?['kind','from','to','scope']:['accounts','allAccounts','phrases','days','unread','skipPromotions','priority','instructions'];
 return Object.fromEntries(fields.map(k=>[k,Array.isArray(item[k])?[...item[k]].sort():item[k]??null]));
}
function fingerprint(collection,item){return createHash('sha256').update(collection+JSON.stringify(content(collection,item))).digest('hex');}
// «Чему я научился» in Petya's own words; the user may rewrite any of them (state.growth.notes).
function describe(collection,item){
 if(collection==='dictionary')return item.kind==='correction'?`Когда вы говорите «${item.from}», вы имеете в виду «${item.to}»${item.scope?' — в проекте '+item.scope:''}. Теперь сразу так и понимаю.`:`«${item.from}» для меня теперь означает «${item.to}»${item.scope?' в проекте '+item.scope:''}.`;
 if(collection==='skills')return `На фразы «${item.patterns.join('», «')}» ${{answer:'отвечаю: '+(item.output||''),command:'выполняю команду «'+(item.output||'')+'»',bugs:'проверяю баги',anr:'проверяю ANR'}[item.action]||'реагирую'}.`;
 return `Когда вы просите «${item.phrases.join('», «')}», проверяю почту за ${item.days} дн.${item.unread?', только непрочитанные':''}${item.skipPromotions?', без рассылок':''}. ${item.instructions||''}`.trim();
}
function record(state,collection,item,before,at,imported=false){
 if(!collections.includes(collection)||!item)return;
 const key=fingerprint(collection,item);
 if(state.growth.events.some(e=>e.key===key))return;
 const points=collection==='dictionary'?10:collection==='skills'?25:40;
 state.growth.events.push({key,collection,itemId:item.id,at:imported?null:at,title:item.name||item.from,points,learned:describe(collection,item),previous:before?describe(collection,before):null,reason:imported?'Знание уже было сохранено до появления шкалы. Исходная дата неизвестна.':before?'Сохранены изменённые инструкции пользователя. Новая версия заменяет предыдущую в расчёте роста.':'Пользователь сохранил новое правило или навык.',source:collection==='dictionary'?(item.origin==='chat'?'Исправление в чате':'Личный словарь'):collection==='recipes'?'Обучение работе с почтой':'Обучение фразам'});
}
function initialize(state){if(state.growth)return;state.growth={version:1,events:[]};for(const collection of collections)for(const item of state[collection]||[])record(state,collection,item,null,null,true);}
// `extra`: knowledge kept elsewhere (recurring commands): {key,title,learned,points,at,source}.
function summary(state,extra=[]){
 const active=new Set();for(const collection of collections)for(const item of state[collection]||[])if(item.enabled!==false)active.add(fingerprint(collection,item));
 const notes=state.growth.notes||{};
 for(const e of extra)active.add(e.key);
 const own=state.growth.events.map(e=>{const item=(state[e.collection]||[]).find(i=>i.id===e.itemId&&fingerprint(e.collection,i)===e.key);let learned=e.learned;if(item)try{learned=describe(e.collection,item);}catch{}return {...e,learned};});
 const events=[...own,...extra.filter(e=>!own.some(o=>o.key===e.key)).map(e=>({collection:'extra',reason:'Вы попросили об этом в чате.',...e}))].sort((a,b)=>(a.at||0)-(b.at||0))
  .map(e=>({...e,active:active.has(e.key),...(notes[e.key]?{learned:notes[e.key],edited:true}:{})}));
 const xp=events.reduce((sum,e)=>sum+(e.active?e.points:0),0);const index=levels.findLastIndex(l=>xp>=l.xp),level=levels[index],next=levels[index+1]||null;
 return {xp,level,next,levels,percent:next?Math.min(100,Math.floor((xp-level.xp)/(next.xp-level.xp)*100)):100,events:events.reverse(),count:events.filter(e=>e.active).length};
}
module.exports={initialize,record,summary,describe};
