// Synthetic local chat history for «Петя-наставник» tests (tests/mentor.cjs, tests/mentor-ui.cjs): a chain of three
// apps every weekday morning, a long instruction at irregular times, a short app request, a catalog app's subject,
// a pasted weekly update, a daily web search, a mail check that is already a recurring command, and noise.
const NOW=new Date(2026,10,9,12,0).getTime();// Monday 9 Nov 2026, 12:00 local time
const at=(daysAgo,h,m=0)=>{const d=new Date(NOW);d.setDate(d.getDate()-daysAgo);d.setHours(h,m,0,0);return d.getTime();};
const workdays=[1,2,3,4,7,8,9,10,11,14];// days ago that are weekdays
function chat(id,title,turns){return {id,title,kind:'chat',projectId:'general',at:NOW,messages:turns.flatMap(([text,time,by,extra])=>[{role:'user',text,at:time},{role:'assistant',text:'ок',at:time+20000,...by?{by}:{},...extra}])};}
const morning=workdays.slice(0,6).flatMap(d=>[['покажи PR, которые ждут моего ревью',at(d,9,30+(d%3)),'Pull requests'],['статус CI',at(d,9,34+(d%3)),'Сборки'],['мои задачи в Jira на сегодня',at(d,9,38+(d%3)),'Jira']]);
const report=[[3,10],[6,15,30],[9,19],[13,12]].map(([d,h,m])=>['напиши короткий отчёт для заказчика по итогам дня: что сделано, что в работе, какие риски',at(d,h,m||0)]);
const release=[[2,11],[5,16],[12,14],[15,10]].map(([d,h])=>['сколько дней до релиза',at(d,h),'Релизы']);
const crashes=[[1,13],[8,17],[16,11]].map(([d,h])=>['какие крэши за неделю',at(d,h)]);
const update=(done,next)=>'Привет! Еженедельный апдейт по проекту Бункер.\nСделано за неделю: '+done+'\nВ работе: магазин и ивент на Хэллоуин\nБлокеры: нет, всё идёт по плану\nСледующий шаг: '+next+'\nЕсли есть вопросы — пишите в личку, отвечу до вечера. Спасибо, Саша';
const pastes=[[4,'сундуки и награды','релиз 1.5'],[11,'новые уровни 12–15','тесты магазина'],[18,'оптимизация загрузки','релиз 1.4']].map(([d,a,b])=>[update(a,b),at(d,18)]);
const search=[1,2,3,4].map(d=>['найди в интернете новости Unity 6',at(d,8,5),'поиск в интернете']);
const mail=[1,2,3,4,5].map(d=>['проверь почту',at(d,10),'почта']);
const noise=[['привет',at(1,9)],['посчитай 2+2',at(2,9)],['что такое ANR',at(3,9)],['что мне автоматизировать?',at(1,12),'Петя-наставник'],['спасибо',at(4,9)]];
function topics(){
 return [chat('a','Работа',[...morning,...report,...release,...noise]),chat('b','Крэши',crashes),chat('c','Апдейты',pastes),chat('d','Новости',search),chat('e','Почта',mail),
  // Runs of a recurring command and the mentor's own chat are not «by hand».
  chat('r','По расписанию · Проверь почту',[1,2,3,4,5,6].map(d=>['Проверь почту',at(d,9)])),{...chat('m','Петя-наставник',[]),mentor:true}];
}
module.exports={NOW,at,chat,topics};
