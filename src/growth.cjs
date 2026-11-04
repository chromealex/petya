const {createHash}=require('node:crypto');
const levels=[['Джун',0,'Осваивает ваши первые правила'],['Джун+',50,'Запоминает рабочие формулировки'],['Мидл',150,'Накопил набор рабочих навыков'],['Мидл+',350,'Знает больше правил и сценариев'],['Сеньор',650,'Накопил обширную базу знаний'],['Сеньор+',1100,'Расширяет опыт в разных сценариях'],['Лид',1800,'Достиг верхней ступени шкалы знаний']].map(([name,xp,description])=>({name,xp,description}));
const collections=['skills','dictionary','recipes'];
function content(collection,item){
 const fields=collection==='skills'?['action','patterns','output']:collection==='dictionary'?['kind','from','to','scope']:['accounts','allAccounts','phrases','days','unread','skipPromotions','priority','instructions'];
 return Object.fromEntries(fields.map(k=>[k,Array.isArray(item[k])?[...item[k]].sort():item[k]??null]));
}
function fingerprint(collection,item){return createHash('sha256').update(collection+JSON.stringify(content(collection,item))).digest('hex');}
function describe(collection,item){
 if(collection==='dictionary')return `«${item.from}» → «${item.to}». Область: ${item.scope||'все проекты'}.`;
 if(collection==='skills')return `Фразы: ${item.patterns.join('; ')}. Действие: ${{answer:'ответ',reminder:'напоминание',bugs:'проверка багов',anr:'проверка ANR'}[item.action]}. ${item.output||'Время и текст берутся из команды.'}`;
 return `Фразы: ${item.phrases.join('; ')}. Письма за ${item.days} дн.; ${item.unread?'только непрочитанные':'все'}, ${item.skipPromotions?'без рассылок':'с рассылками'}. Приоритет: ${item.priority.join(', ')||'не задан'}. Аккаунты: ${item.allAccounts?'все':item.accounts.join(', ')||'единственный подключённый'}. Указания: ${item.instructions}`;
}
function record(state,collection,item,before,at,imported=false){
 if(!collections.includes(collection)||!item)return;
 const key=fingerprint(collection,item);
 if(state.growth.events.some(e=>e.key===key))return;
 const points=collection==='dictionary'?10:collection==='skills'?25:40;
 state.growth.events.push({key,collection,itemId:item.id,at:imported?null:at,title:item.name||item.from,points,learned:describe(collection,item),previous:before?describe(collection,before):null,reason:imported?'Знание уже было сохранено до появления шкалы. Исходная дата неизвестна.':before?'Сохранены изменённые инструкции пользователя. Новая версия заменяет предыдущую в расчёте роста.':'Пользователь сохранил новое правило или навык.',source:collection==='dictionary'?'Личный словарь':collection==='recipes'?'Обучение работе с почтой':'Обучение фразам'});
}
function initialize(state){if(state.growth)return;state.growth={version:1,events:[]};for(const collection of collections)for(const item of state[collection]||[])record(state,collection,item,null,null,true);}
function summary(state){
 const active=new Set();for(const collection of collections)for(const item of state[collection]||[])if(item.enabled!==false)active.add(fingerprint(collection,item));
 const events=state.growth.events.map(e=>({...e,active:active.has(e.key)}));
 const xp=events.reduce((sum,e)=>sum+(e.active?e.points:0),0);const index=levels.findLastIndex(l=>xp>=l.xp),level=levels[index],next=levels[index+1]||null;
 return {xp,level,next,levels,percent:next?Math.min(100,Math.floor((xp-level.xp)/(next.xp-level.xp)*100)):100,events:events.reverse(),count:events.filter(e=>e.active).length};
}
module.exports={initialize,record,summary};
