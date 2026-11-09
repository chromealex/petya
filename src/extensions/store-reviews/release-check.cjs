// «Отзывы в сторах» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs):
// the average rating of the latest version in the stores against the version before it, per game. Read-only.
const stores=require('./stores.cjs');
const feature=require('./feature.cjs');
// Fewer reviews than this say nothing; a drop of this many stars (or an average below FLOOR) is a problem.
const MIN_REVIEWS=10,MAX_DROP=0.3,FLOOR=3.5;
const stars=v=>v==null?'—':v.toLocaleString('ru-RU',{maximumFractionDigits:2})+'★';

module.exports={
 checks:[{id:'reviews.trend',title:'Оценки после прошлой версии не просели',group:'Стор и игроки'}],
 ready:settings=>{const c=feature.connected(settings);return !!(c.play||c.appstore);},
 hint:()=>'Подключите App Store Connect или Google Play в настройках «Отзывы в сторах».',
 async run(s,release){
  const c=feature.connected(s.settings),usable=['appstore','play'].filter(x=>c[x]);
  const apps=[];
  for(const store of usable){try{apps.push(...await (store==='play'?stores.playApps(s):stores.ascApps(s)));}catch{/* the other store may still answer */}}
  if(!apps.length)return [{id:'reviews.trend',status:'unknown',summary:'Не вижу приложений в сторах — укажите их в настройках «Отзывы в сторах».'}];
  const evidence=[],problems=[];let counted=0;
  for(const game of feature.games(apps).slice(0,3)){
   let r;try{r=await feature.read(s,game,usable,'отзывы после обновления',release.now||new Date());}catch(e){evidence.push({text:game.label+': '+e.message});continue;}
   const sum=r.summary;
   if(sum.count<MIN_REVIEWS){evidence.push({text:game.label+': отзывов о версии '+(r.version||'')+' пока '+sum.count});continue;}
   counted++;
   evidence.push({text:game.label+(r.version?' '+r.version:'')+': '+stars(sum.average)+(sum.previous?.average!=null?' (было '+stars(sum.previous.average)+')':'')+', отзывов '+sum.count});
   if(sum.delta!=null&&sum.delta<=-MAX_DROP)problems.push(game.label+': оценка упала на '+stars(Math.abs(sum.delta)));
   else if(sum.average!=null&&sum.average<FLOOR)problems.push(game.label+': средняя оценка '+stars(sum.average));
  }
  const action={label:'Отзывы',ask:'плохие отзывы после обновления'};
  if(problems.length)return [{id:'reviews.trend',status:'problem',summary:problems.join('; ')+'.',evidence,action}];
  if(!counted)return [{id:'reviews.trend',status:'unknown',summary:'Отзывов о последней версии пока мало для вывода.',evidence,action}];
  return [{id:'reviews.trend',status:'ok',summary:'Оценки последней версии не хуже прошлой.',evidence,action}];
 }
};
