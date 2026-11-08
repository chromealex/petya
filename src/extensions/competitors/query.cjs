// «Конкуренты»: which requests are about tracked competitor games and what they ask (add, remove, list, what is new,
// mechanics in updates, rating trends, comparison with our games). Neighbours: a contest («конкурс»), an opponent in
// chess or sports, comparing devices («сравни iPad и iPhone»), competitive advantage talk, our own store reviews.
const itunes=require('./itunes.cjs');
const play=require('./play.cjs');
const COMP=/конкурент\p{L}*|competitors?/iu;
const NEAR=/конкурент\p{L}*\s+(?:\p{L}+\s+)?(?:в|по|на)\s+(?:шахмат|футбол|хоккей|теннис|спорт|турнир|бокс|забег|гонк|олимпиад|выбор|конкурс|тендер|рынке труда|вакан|собесед)\p{L}*|шахмат\p{L}*|конкурентн\p{L}* (?:преимуществ|цен|зарплат|среда)|конкурентоспособн\p{L}*|конкуренци\p{L}* (?:на рынке труда|за кадры|за вакан)|(?:^|[^\p{L}])конкурс\p{L}*/iu;
const RATING=/(?:у кого|чей|кто)\s+(?:\p{L}+\s+)?(?:вырос|упал|поднял|снизил|просел|подрос|растёт|растет|падает)\p{L}*\s+(?:\p{L}+\s+)?рейтинг\p{L}*|(?:у кого|чей)\s+рейтинг\p{L}*\s+(?:вырос|упал|поднял|снизил|просел|подрос|растёт|растет|падает)/iu;
const MECHANICS=/(?:какие|что за|новые)\s+(?:\p{L}+\s+)?(?:механик|фич|режим|ивент)\p{L}*\s+(?:\p{L}+\s+){0,2}(?:добавил|добавля|появил|ввели|выпустил)\p{L}*|(?:механик|фич)\p{L}*\s+(?:\p{L}+\s+){0,3}(?:в обновлени|в апдейт|в патч)\p{L}*/iu;
const ADD=/(?:^|[^\p{L}])(?:добавь|добавить|добавим|добавьте|следи|следить|отслеживай|отслеживать|начни следить|запомни)(?=$|[^\p{L}])/iu;
const REMOVE=/(?:^|[^\p{L}])(?:убери|убрать|удали|удалить|исключи|перестань следить|не следи|больше не следи|не отслеживай)(?=$|[^\p{L}])/iu;
const LINK=s=>!!(itunes.fromUrl(s)||play.fromUrl(s));

function about(text){
 const t=String(text||'').trim();
 if(!t||NEAR.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|кто такие|зачем нуж|как (?:подключить|настроить|работает))/iu.test(t))return false;
 if(COMP.test(t))return true;
 if(RATING.test(t)||MECHANICS.test(t))return true;
 // «следи за https://apps.apple.com/…/id123» — a store link with a tracking verb.
 if(LINK(t)&&(ADD.test(t)||REMOVE.test(t)))return true;
 return false;
}

// The app the user names: a store link, a numeric App Store id, a Play package or a name.
function target(text){
 const t=String(text||'');
 const apple=itunes.fromUrl(t);if(apple)return {store:'appstore',id:apple.id,country:apple.country};
 const pkg=play.fromUrl(t);if(pkg)return {store:'play',id:pkg};
 const id=t.match(/(?:^|[^\d])(?:id)?(\d{8,12})(?!\d)/i);if(id&&/app ?store|эпп?стор|апп?стор|(?:^|\s)id\d/iu.test(t)||id&&/^\D*\d{8,12}\D*$/.test(t.replace(/конкурент\p{L}*/giu,'')))return {store:'appstore',id:id[1]};
 const p=t.match(/(?:^|\s)([a-z][a-z0-9_]*(?:\.[a-z0-9_]+){2,})(?=$|[\s,.!?])/i);if(p&&play.PACKAGE.test(p[1]))return {store:'play',id:p[1]};
 // A name: what is left after the verb and «в конкуренты» / «из конкурентов» / «за».
 let name=t.replace(/[«»"“”]/g,' ')
  .replace(/^(?:\s*(?:петя|пожалуйста|давай|а|и|ещё|еще)[,\s]+)+/iu,'')
  .replace(/(?:^|\s)(?:добавь(?:те)?|добавить|добавим|следи(?:ть)?|отслеживай|отслеживать|начни следить|запомни|убери|убрать|удали(?:ть)?|исключи|перестань следить|не следи|больше не следи|не отслеживай)(?=$|\s)/giu,' ')
  .replace(/(?:^|\s)(?:в|из|к|от|за|для)\s+(?:список\s+)?(?:наших\s+|моих\s+)?конкурент\p{L}*/giu,' ')
  .replace(/(?:^|\s)(?:как|в качестве)\s+конкурент\p{L}*/giu,' ')
  .replace(/(?:^|\s)конкурент\p{L}*(?=$|\s)/giu,' ')
  .replace(/(?:^|\s)(?:игру|игра|игрой|приложение|приложением|за)(?=\s)/giu,' ')
  .replace(/(?:^|\s)(?:в|из)\s+(?:app ?store|апп?стор\p{L}*|эпп?стор\p{L}*|google play|гугл[- ]?пле\p{L}*)(?=$|\s)/giu,' ')
  .replace(/[.!?,]+$/,'').replace(/\s+/g,' ').trim();
 const store=/google play|гугл[- ]?пле|андроид|android/iu.test(t)?'play':/app ?store|апп?стор|эпп?стор|ios|айфон/iu.test(t)?'appstore':null;
 return name&&name.length<=80?{name,store}:null;
}
function intent(text){
 const t=String(text||'');
 if(REMOVE.test(t)&&(COMP.test(t)||LINK(t)))return 'remove';
 if(ADD.test(t)&&(COMP.test(t)||LINK(t))&&!/что нового|какие механики/iu.test(t))return 'add';
 if(RATING.test(t)||/рейтинг\p{L}*/iu.test(t))return 'rating';
 if(/сравни\p{L}*|с нами|против нас|наш\p{L}* (?:игр|приложени|рейтинг)|чем мы хуже|отста[её]м/iu.test(t))return 'compare';
 if(MECHANICS.test(t)||/механик\p{L}*|фич\p{L}*|нововведени\p{L}*/iu.test(t))return 'mechanics';
 if(/(?:список|какие|кто|покажи|перечисли|за кем)\s+(?:\p{L}+\s+)?(?:конкурент|следим|следишь)/iu.test(t)&&!/нового|обновлен|апдейт/iu.test(t))return 'list';
 return 'news';
}
// «за неделю», «за месяц» — how far back «что нового» looks; a month by default.
function days(text){
 const t=String(text||'').toLowerCase();
 if(/за (?:эту |последнюю )?недел|за 7 дней/u.test(t))return 7;
 if(/за (?:два|2) месяц|за 60/u.test(t))return 60;
 if(/за (?:две|2) недел|за 14/u.test(t))return 14;
 if(/вчера|за сутки|сегодня/u.test(t))return 2;
 return 30;
}
module.exports={about,target,intent,days,NEAR,COMP};
