// The checklist template of a project: items in order, each either an automatic check (`check` names a release-check
// id that some app provides) or a manual item the user ticks per release. The default fits a mobile game.
const {randomUUID}=require('node:crypto');
const DEFAULT=[
 {id:'ci',group:'Сборка',title:'CI зелёный на релизной ветке',check:'ci.green'},
 {id:'versions',group:'Сборка',title:'Номера версии и сборки согласованы',check:'versions.consistent'},
 {id:'size',group:'Сборка',title:'Размер билда без резкого роста и замечаний',check:'build.size'},
 {id:'crashes',group:'Качество',title:'Нет новых крэшей, crash-free не хуже прошлой версии',check:'crashes.release'},
 {id:'blockers',group:'Качество',title:'Нет открытых блокирующих багов в версии',check:'jira.blockers'},
 {id:'smoke',group:'Качество',title:'Смоук-тест на реальных устройствах пройден'},
 {id:'reviews',group:'Стор и игроки',title:'Оценки после прошлой версии не просели',check:'reviews.trend'},
 {id:'notes',group:'Стор и игроки',title:'Патчноут готов на всех языках и в лимитах сторов',check:'patchnotes.ready'},
 {id:'store-page',group:'Стор и игроки',title:'Скриншоты и описание в сторах обновлены'},
 {id:'loc',group:'Контент',title:'Нет непереведённых строк',check:'loc.missing'},
 {id:'deps',group:'Код',title:'Нет уязвимых зависимостей',check:'deps.vulnerable'},
 {id:'server',group:'Запуск',title:'Сервер и удалённые конфиги готовы к версии'},
 {id:'rollout',group:'Запуск',title:'Поэтапная раскатка настроена'},
 {id:'support',group:'Запуск',title:'Поддержка предупреждена о релизе'}
];
const MAX=40;
const clean=(v,max)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const defaults=()=>DEFAULT.map(x=>({...x}));
// A template from the settings editor or the saved file: bounded, unique ids, known shape. Throws on nonsense.
function normalize(items){
 if(!Array.isArray(items))throw Error('Чек-лист должен быть списком пунктов.');
 if(items.length>MAX)throw Error('В чек-листе не больше '+MAX+' пунктов.');
 const seen=new Set();
 return items.map(raw=>{
  const title=clean(raw?.title,160);if(!title)throw Error('У каждого пункта чек-листа должно быть название.');
  let id=clean(raw?.id,60);if(!/^[a-z0-9-]{1,60}$/i.test(id)||seen.has(id))id=randomUUID().slice(0,8);seen.add(id);
  const check=clean(raw?.check,60);
  if(check&&!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(check))throw Error('Некорректная проверка «'+check+'».');
  return {id,group:clean(raw?.group,60)||'Другое',title,...check?{check}:{}};
 });
}
// Whether an item still says exactly what the default says (shown translated) or the user wrote it (shown as is).
function custom(item){const d=DEFAULT.find(x=>x.id===item.id);return !d||d.title!==item.title;}
function customGroup(group){return !DEFAULT.some(x=>x.group===group);}
module.exports={DEFAULT,MAX,defaults,normalize,custom,customGroup};
