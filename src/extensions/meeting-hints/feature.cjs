// «Подсказки на встрече»: while the user records a meeting, a small panel over the screen hints at what Petya already
// knows about the talk — «Это уже решали 3 октября», «Ты обещал прислать …», what a project term means — with the
// source of each hint, at most one per 30 seconds. Built on the live meeting stream (docs/foundations/meeting-stream.md)
// through the app's meeting listener. Off by default even when added: on for one meeting («включи подсказки»), for
// every recorded meeting («подсказывай на встречах»), or off («выключи подсказки»). Everything stays on this computer:
// the talk is matched in memory against meeting summaries and the glossary, and nothing is sent anywhere.
const kit=require('../app-kit.cjs');
const hub=require('./hub.cjs');
const {HintEngine,MODES,KINDS}=require('./engine.cjs');
const knowledge=require('./knowledge.cjs');
const ID='meeting-hints',BY='Подсказки на встрече';
const MEETING=/(?:встреч|созвон|звонк|митинг|синк|совещани|планёрк|планерк)\p{L}*/iu;
// Hints of other kinds: in code, in a game, on the keyboard, in a tracker task.
const OTHER=/(?:код|ide|редактор|vscode|xcode|unity|юнити|клавиатур|автодополн|в\s+игр|для\s+игрок|подсказк\p{L}*\s+(?:к|в|для)\s+(?:задач|тикет|баг))/iu;
const OFF=/(?:выключи|отключи|убери|останови|прекрати|хватит|не\s+(?:надо|нужно|показывай|давай))\s+(?:\p{L}+\s+)?подсказ\p{L}*|не\s+подсказывай|без\s+подсказок/iu;
const ALWAYS=/подсказывай\s+(?:мне\s+)?(?:на|во\s+время|по\s+ходу)\s+(?:\p{L}+\s+)?(?:встреч|созвон|звонк|митинг|синк)|(?:включи|включай|показывай)\s+(?:\p{L}+\s+)?подсказк\p{L}*\s+(?:на\s+(?:всех|каждой)\s+(?:\p{L}+\s+)?(?:встреч|созвон)|всегда)/iu;
const ON=/(?:включи|включай|запусти|давай|нужны|хочу)\s+(?:\p{L}+\s+)?подсказк\p{L}*|подсказывай\s+(?:мне\s+)?(?:на\s+)?(?:этой|этом|сейчас)/iu;
const STATUS=/^(?:(?:покажи|какие|что\s+с|что\s+там\s+с)\s+)?подсказк\p{L}*(?:\s+(?:на|с|со|за|во\s+время)\s+(?:\p{L}+\s+)?(?:встреч|созвон)\p{L}*)?\??$/iu;

// What the request asks for: 'always', 'meeting', 'off', 'status' or null (not this app).
function parse(text){
 const t=String(text||'').trim().replace(/[.!]+$/,'');
 if(!/подсказ/iu.test(t))return null;
 if(OTHER.test(t)&&!MEETING.test(t))return null;
 if(OFF.test(t))return 'off';
 if(ALWAYS.test(t))return 'always';
 if(ON.test(t))return 'meeting';
 if(STATUS.test(t))return 'status';
 return null;
}

let engine=null,panel=null;
function card(s){
 const state=engine?engine.state():{mode:'off',muted:[],hidden:false,meeting:null,hints:[]};
 const stream=s.meetingStream?.status?.()||{active:false};
 let summaries=0;try{summaries=(s.memory?.prune?.()||[]).filter(r=>r?.kind==='summary').length;}catch{summaries=0;}
 return {...state,recording:!!stream.active,glossary:kit.installed(s,'glossary'),calendar:s.settings?.extension_calendar==='true',summaries};
}
function setup(s){
 const smoke=!!s.smoke||process.env.PETYA_SMOKE_TEST==='1';
 const installed=()=>kit.installed(s,ID);
 panel=new (require('./panel.cjs').HintPanel)({onAction:(action,arg)=>{
  if(!engine)return;
  if(action==='dismiss'||action==='timeout')engine.dismiss();
  else if(action==='mute'&&KINDS.includes(arg))engine.mute(arg);
  else if(action==='hide')engine.hideForMeeting();
 }});
 engine=new HintEngine({
  settings:()=>s.settings,save:values=>s.saveSettings(values,true),
  knowledge:meeting=>knowledge.load(s,meeting),
  search:(text,meeting)=>{const find=knowledge.semantic(s);return find?find(text,meeting):null;},
  // The panel is a real window only in the app; the smoke test renders it itself.
  show:hint=>{if(installed()&&!smoke)panel.show(hint).catch(()=>{});},hide:()=>panel.hide(),
  calendar:()=>knowledge.calendar(s),annotate:(id,context)=>s.meetingStream?.annotate?.(id,context)
 });
 hub.engine=engine;
 try{require('electron').app?.once?.('before-quit',()=>panel.dispose());}catch{/* outside Electron */}
 const ready=()=>{if(!installed())throw Error('Приложение «Подсказки на встрече» не добавлено.');};
 return {ipc:{
  state:()=>card(s),
  setMode:mode=>{ready();if(!MODES.includes(mode))throw Error('Неизвестный режим подсказок.');engine.setMode(mode);return card(s);},
  unmute:()=>{ready();engine.unmute();return card(s);},
  showAgain:()=>{ready();engine.showAgain();return card(s);}
 }};
}
function validate(next){
 if(next.meetingHintsMode!==undefined&&!MODES.includes(next.meetingHintsMode))throw Error('Проверьте режим подсказок на встречах.');
 if(next.meetingHintsMuted!==undefined&&String(next.meetingHintsMuted).split(',').some(k=>k&&!KINDS.includes(k)))throw Error('Проверьте скрытые виды подсказок.');
}
async function turn(s,command){
 const kind=parse(command);
 if(!kind||!kit.installed(s,ID))return null;
 if(!engine)return kit.reply(s,command,{by:BY,error:true,text:'Подсказки ещё запускаются. Повторите через несколько секунд.'});
 const recording=!!s.meetingStream?.status?.().active;
 let text;
 if(kind==='off'){engine.setMode('off');text='Подсказки на встречах выключены.';}
 else if(kind==='always'){engine.setMode('always');text='Буду подсказывать на каждой записываемой встрече: прошлые решения, обещания из сводок и термины глоссария — не чаще раза в 30 секунд.'+(recording?' Эта встреча уже записывается — начинаю.':'');}
 else if(kind==='meeting'){engine.setMode(engine.mode()==='always'?'always':'meeting');text=engine.mode()==='always'?'Подсказки и так включены на всех встречах.':recording?'Подсказки включены на этой встрече. Панель появится в углу экрана, когда будет что подсказать.':'Включу подсказки на следующей записанной встрече. Подсказки работают только во время записи.';}
 else text=engine.mode()==='off'?'Подсказки на встречах выключены. Скажите «включи подсказки» — на одну встречу, или «подсказывай на встречах» — на все.':engine.mode()==='always'?'Подсказки включены на всех записываемых встречах.':'Подсказки включены на одну встречу.';
 return kit.reply(s,command,{by:BY,text,data:{meetingHints:card(s)}});
}
module.exports={name:'meetingHints',defaults:{['extension_'+ID]:'false',meetingHintsMode:'off',meetingHintsMuted:''},validate,setup,turn,parse};
