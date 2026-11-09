// Capability «reminder» of «Напоминания»: a date from another app's card (a contract deadline, a planned event) becomes
// the chat request «Напомни 12 декабря 2026 в 10:00: …», which this app parses and confirms in the chat like any other
// reminder. Nothing is stored here; a date that has passed is refused.
const {one}=require('../link-text.cjs');
const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
module.exports={
 label:'Напомнить',order:10,
 ready:settings=>settings.extension_reminders==='true',
 hint:()=>'Петя поставит напоминание через чат',
 async run(services,payload){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(payload.date||''));if(!m)throw Error('Нет даты для напоминания.');
  const text=one(payload.text).replace(/[\r\n]+/g,' ').slice(0,240);if(!text)throw Error('Нет текста напоминания.');
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(payload.time||''))?payload.time:'10:00';
  const [y,mo,d]=[Number(m[1]),Number(m[2]),Number(m[3])];
  const [hh,mm]=time.split(':').map(Number);
  if(new Date(y,mo-1,d,hh,mm).getTime()<=Date.now())return {text:'Эта дата уже прошла — напоминание не поставить.'};
  return {ask:'Напомни '+d+' '+MONTHS[mo-1]+' '+y+' в '+time+': '+text,send:true};
 }
};
