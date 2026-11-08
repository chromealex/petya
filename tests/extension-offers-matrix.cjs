// Offers do not confuse extensions: with nothing added, each app's typical requests offer exactly that app,
// and neighbours' subjects or ordinary talk offer nothing wrong. All real offer.cjs files take part at once.
const assert=require('node:assert/strict');
const offers=require('../src/features/extension-offers.cjs');
const all=offers.load();
const ids=new Set(all.map(o=>o.id));
const settings={};
function offered(text){const d=offers.decide(offers.candidates(text,{offers:all,settings}));return d?d.one?[d.one.offer.id]:d.tie.map(r=>r.offer.id):[];}
// app → requests that must offer exactly it
const own={
 'regex-cron':['объясни регулярку /^a+$/','составь крон на каждый будний день в 9','что значит cron */15 * * * *'],
 crashes:['какие крэши за неделю','топ крэшей','новые крэши после релиза 1.4.2','что в Sentry за сутки'],
 'store-reviews':['что пишут в отзывах','отзывы в App Store за неделю','жалобы игроков в Google Play','плохие отзывы после обновления'],
 calendar:['что у меня сегодня в календаре','найди час с Машей и Олегом на этой неделе','когда я свободен в пятницу','поставь встречу с Олегом в четверг в 15:00'],
 'ci-builds':['статус CI','последние сборки в GitHub Actions','что с билдом на андроид в CI'],
 'pull-requests':['какие PR ждут моего ревью','мои пулл-реквесты','что в PR 123'],
 'disk-usage':['чем забит диск','сколько места свободно на диске','что можно почистить на диске'],
 dependencies:['какие пакеты устарели','есть ли уязвимости в зависимостях','npm audit'],
 'build-size':['почему билд вырос','сравни размер этих двух apk','из чего состоит ipa'],
 localization:['что не переведено в локализации','проверь локализацию','недостающие ключи на немецкий'],
 zoom:['запиши встречу в Zoom','покажи мои встречи в зуме','что было на созвоне в Zoom'],
 'google-meet':['созвон в Meet','запиши созвон в мите','поставь созвон в гугл мит с Олегом','запиши встречу в Google Meet','подключись к созвону через Meet'],
 teams:['встреча в Teams','запиши встречу в тимсе','поставь встречу в тимс на завтра','что было на звонке в Microsoft Teams'],
 discord:['что нового в дискорде','баги из дискорда за неделю','покажи частые вопросы игроков','отправь в Discord: сервер перезапустится в 18:00'],
 support:['что жалуются в поддержку','тикеты про оплату за неделю','ответь на тикет 1234','покажи тикеты в Zendesk'],
 'sprint-planning':['спланируй спринт','что влезет в следующий спринт','какая у нас скорость','кто перегружен в спринте','velocity команды'],
 standup:['собери стендап','что вчера делала команда','у кого блокеры','настрой стендап на 10:30']
};
// phrases that must not offer a given app (neighbours' subjects and ordinary talk)
const not={
 crashes:['ANR за неделю','упала сборка','сервер упал','падение продаж за неделю'],
 'store-reviews':['сделай код-ревью','ревью PR #42','перфоманс-ревью','отзыв о кандидате','фидбэк по встрече'],
 calendar:['сводка встречи','что решили на встрече','срок задачи','календарь отпусков','дни рождения'],
 'pull-requests':['отзывы в App Store','задачи на ревью в Jira'],
 'ci-builds':['почини билд','размер сборки','сколько весит билд'],
 'disk-usage':['место встречи','свободное место в спринте','диск в Google Drive'],
 dependencies:['зависимости между задачами','эмоциональная зависимость','от чего зависит дедлайн'],
 'build-size':['размер команды','размер экрана','сборка упала'],
 localization:['переведи эту фразу','перевод денег','перевести задачу в другой статус'],
 'regex-cron':['регулярно созваниваемся','регулярные встречи по понедельникам'],
 // Zoom by name only: zooming a picture or the screen is not the meeting app, and meetings in general are Petya's.
 zoom:['зум фото','увеличь картинку','сделай zoom in на графике','приблизь изображение','зум камеры','запиши встречу','слушай встречу','сводка встречи','созвон в Meet','встреча в тимсе'],
 // Meet and Teams by name only: «meeting», «митинг», «митап», meetings in general, the calendar and Zoom are not them.
 'google-meet':['митинг протеста','митап по Unity','сводка встречи','Zoom','запиши встречу в Zoom','поставь встречу с Олегом завтра','what is the meeting about','meetup в пятницу','что у меня сегодня в календаре','встреча в Teams','тимлид на встрече'],
 teams:['митинг протеста','митап по Unity','сводка встречи','Zoom','запиши встречу в Zoom','поставь встречу с Олегом завтра','созвон в Meet','тимлид сказал','тимбилдинг в пятницу','команда в Slack','teams в слаке'],
 // Discord by name: the user's own client, coding with discord.js, other messengers and support tickets are not it.
 discord:['дискорд не работает','как подключить discord.js','напиши бота для дискорда','что нового в слаке','что пишут в телеграме','тикеты про оплату','что жалуются в поддержку'],
 // Player tickets: vendors' support, Petya's help, cheering up, store reviews and tracker tickets are not it.
 support:['поддержка Unity','техподдержка Пети','отзывы в сторах','поддержи меня','создай тикет в Jira','частые вопросы игроков в дискорде','поддерживает ли Unity webp'],
 // Sprint planning: running sprints, weekend plans, a task's work plan and team workload right now are not it.
 'sprint-planning':['спринт в беге','планы на выходные','план работ по задаче','загрузка команды','кто перегружен','какая скорость интернета'],
 // Standup: comedy, getting up, meeting summaries and the meeting in the calendar are not it.
 standup:['стенд-ап комедия','встань','сводка встречи','во сколько стендап','сходим на стендап шоу'],
 teams:['митинг протеста','митап по Unity','сводка встречи','Zoom','запиши встречу в Zoom','поставь встречу с Олегом завтра','созвон в Meet','тимлид сказал','тимбилдинг в пятницу','команда в Slack','teams в слаке']
};
const problems=[];
for(const [id,phrases] of Object.entries(own)){
 if(!ids.has(id))continue;
 for(const p of phrases){const got=offered(p);if(got.length!==1||got[0]!==id)problems.push('«'+p+'» → '+(got.join(', ')||'ничего')+', ожидалось '+id);}
}
for(const [id,phrases] of Object.entries(not)){
 if(!ids.has(id))continue;
 for(const p of phrases)if(offered(p).includes(id))problems.push('«'+p+'» не должно предлагать '+id);
}
// Ordinary talk offers nothing at all.
for(const p of ['привет','как дела?','спасибо, отлично','посчитай 2+2','что такое крэш-репорт?','расскажи анекдот'])if(offered(p).length)problems.push('«'+p+'» → '+offered(p).join(', '));
assert.deepEqual(problems,[],'\n'+problems.join('\n'));
console.log('Extension offers matrix: '+all.length+' offers, own requests offer exactly their app, neighbours and small talk offer nothing wrong passed');

// Installed but not connected: each app's request is claimed by that app only (it answers with the question
// where to connect); no other app's chat turn takes it. Service apps only — local apps would scan the disk.
(async()=>{
 const apps=['crashes','store-reviews','calendar','ci-builds','pull-requests','regex-cron','discord','support','sprint-planning','standup'].filter(id=>ids.has(id));
 const features=Object.fromEntries(apps.map(id=>[id,require('../src/extensions/'+id+'/feature.cjs')]));
 const wrong=[];
 for(const id of apps)for(const phrase of own[id]){
  const claimed=[];
  for(const [other,f] of Object.entries(features)){
   const topic={id:'t',title:'Чат',messages:[]};
   const s={settings:Object.fromEntries(apps.map(a=>['extension_'+a,'true'])),requestProgress:{report(){}},modules:{enabled:()=>true},
    dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}},
    attachments:{list:()=>[]},clarifications:null,
    async request(){throw Object.assign(Error('нет сети в тесте'),{code:'ENOTFOUND'});}};
   let reply=null;try{reply=await f.turn(s,phrase);}catch(e){reply={error:e.message};}
   if(reply)claimed.push(other);
  }
  if(claimed.length!==1||claimed[0]!==id)wrong.push('«'+phrase+'» → '+(claimed.join(', ')||'никто')+', ожидалось '+id);
 }
 assert.deepEqual(wrong,[],'\n'+wrong.join('\n'));
 console.log('Installed apps: each request claimed by its own app only ('+apps.length+' apps) passed');
})().catch(e=>{console.error(e);process.exit(1);});
