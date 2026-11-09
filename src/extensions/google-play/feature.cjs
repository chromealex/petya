// Google Play on dashboards (src/features/dashboards.cjs). In the chat ANR is answered by Petya's own Google Play
// reader (the «anr» step, src/google-play.cjs `read`), so this feature has no chat `turn`: it only lets a dashboard
// repeat that read. `dashboard.load` runs the same reader and turns its rows into the same `playVitals` card data
// (result.cjs), so the widget is the ANR card the chat shows. Google Play is connected in Petya's own service settings
// (`googlePlayCredential`, module «googleplay»), not by adding the app.
const {GooglePlay}=require('../../google-play.cjs');
const result=require('./result.cjs');
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const ANR=new RegExp(W+'(?:anr|анр)\\p{L}{0,3}'+E+'|'+W+'зависани\\p{L}*','iu');
// How-to and talk about ANR, and anything that changes something, are not widgets.
const QUIET=/^(?:а\s+)?(?:что такое|зачем|почему|как (?:подключить|настроить|считается|работает|снизить|уменьшить|исправить)|объясни)|(?:исправ|почин|пофикс|созда|заведи|напиши|отправ)\p{L}*/iu;
const connected=settings=>settings?.module_googleplay!=='false'&&!!settings?.googlePlayCredential;

const dashboard={
 accepts:text=>{const t=String(text||'').trim();return !!t&&t.length<=300&&ANR.test(t)&&!QUIET.test(t);},
 size:'m',
 choosable:true,
 widgets:[{title:'ANR за неделю',command:'ANR за неделю'}],
 ready:connected,
 connect:()=>({names:['Google Play Console'],where:'Подключения → «Google Play Console»',offers:[]}),
 async load(s,command,{topic,selected}={}){
  if(!connected(s.settings))throw Error('Google Play не подключён: Подключения → «Google Play Console».');
  const play=new GooglePlay({settings:()=>s.settings,request:s.request});
  // The app chosen on the card (`selected`, apps/<package>) is the reader's own choice for this topic.
  const scope=topic||{};if(/^apps\/[a-zA-Z0-9._-]+$/.test(String(selected||'')))scope.playApp=selected;
  const answer=await play.read(String(command||''),scope,'');
  // Several apps and none named or chosen: the card asks which one (the choice is kept with the widget).
  if(answer?.question)return {choice:{text:'В Google Play несколько приложений — выберите, чьи ANR показывать.',options:answer.options||[]}};
  const data=result.extract(answer);
  return {text:String(answer?.text||''),extensionData:data||null};
 }
};
module.exports={name:'googlePlayDashboard',defaults:{},validate(){},setup(){return {};},dashboard};
