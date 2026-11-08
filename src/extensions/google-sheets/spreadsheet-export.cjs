// Capability «spreadsheet-export» of «Google Таблицы»: a card's table ({title, sheet?, app?, header, rows}) goes to
// the chat as an export request; the export card there previews it, asks where to put it (a new spreadsheet or a tab
// of a known one) and writes only on «Выгрузить».
const exportsStore=require('./exports.cjs');
const auth=require('./auth.cjs');
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
module.exports={
 label:'Выгрузить в Google Таблицы',
 ready:settings=>auth.connected(settings),
 hint:settings=>auth.writable(settings)?'Петя покажет таблицу и спросит, куда выгрузить':'Сначала разрешите запись в настройках «Google Таблицы»',
 async run(services,payload){
  if(!auth.writable(services.settings||{}))return {settings:'google-sheets',text:'Чтобы выгружать, разрешите запись в настройках «Google Таблицы».'};
  const id=exportsStore.put(payload);
  const n=payload.rows.length;
  return {ask:'Выгрузи в Google Таблицы «'+String(payload.title||'Выгрузка Пети').replace(/[«»#]/g,'').slice(0,100)+'» · '+n+' '+plural(n,['строка','строки','строк'])+' · #'+id,send:true};
 }
};
