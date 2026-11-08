// Feature: a morning brief on weekdays at the time the user chose. It runs as a background chat that hands
// the parts to Petya's agents (my tasks in progress, overdue, Slack) and ends with one combined answer;
// the usual chat notification tells the user it is ready. Voice: «присылай сводку по утрам в 9:30».
const SET=/^(?:петя[,!\s]+)?(?:присылай|делай|готовь|собирай|включи)\s+(?:мне\s+)?(?:утреннюю\s+)?сводку(?:\s+(?:каждое утро|по утрам|по будням|каждый день))*\s+в\s+(\d{1,2})(?:[:.\s](\d{2}))?(?:\s*(?:утра|часов|ч))?[.!]*$/iu;
const OFF=/^(?:петя[,!\s]+)?(?:не\s+присылай|выключи|отключи|убери|останови)\s+(?:утреннюю\s+)?сводку[.!]*$/iu;
const REQUEST='Раздай агентам: 1) какие задачи на мне в работе, 2) какие задачи на мне просрочены, 3) что нового в Slack';
const valid=v=>v===''||/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(v);
// Extension point: other features add their own part to the brief chat without the agents. `addPart(name, part)`
// registers `part(services, now) -> {text, by?, data?} | null` (sync or async; `data` becomes the message's
// extensionData, rendered by that app's card). Parts are shown first in the «Утренняя сводка» chat, before the
// agents' answer, in the order they were added; a failing part is skipped. Re-adding a name replaces it.
// Used by «Дневник дня» (src/extensions/journal) for the plan the user carried over to today.
const parts=new Map();
function addPart(name,part){if(typeof name!=='string'||!name||typeof part!=='function')throw Error('Invalid morning brief part');parts.set(name,part);}
async function partsFor(s,now=new Date()){
 const out=[];
 for(const [name,part] of parts){try{const r=await part(s,now);if(r?.text)out.push({role:'assistant',text:String(r.text),at:Date.now(),by:r.by||name,...(r.data?{extensionData:r.data}:{})});}catch(e){console.error('Morning brief part '+name+':',e.message);}}
 return out;
}
const pad=v=>String(v).padStart(2,'0');
function due({time,days='1-5',last='',now=new Date()}){
 if(!time)return false;const [h,m]=time.split(':').map(Number);const day=now.getDay()||7;
 const [from,to]=String(days).split('-').map(Number);if(!(day>=(from||1)&&day<=(to||7)))return false;
 const today=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
 return last!==today&&(now.getHours()>h||now.getHours()===h&&now.getMinutes()>=m)&&now.getHours()<h+3?today:false; // not hours late after the Mac slept all morning
}
module.exports={matches:t=>{t=String(t||'').trim();return SET.test(t)||OFF.test(t);},
 name:'morning-brief',due,REQUEST,addPart,partsFor,
 defaults:{morningBrief:'',morningBriefDays:'1-5',morningBriefLast:''},
 validate(next){if(!valid(next.morningBrief))next.morningBrief='';if(!/^[1-7]-[1-7]$/.test(next.morningBriefDays))next.morningBriefDays='1-5';if(!/^(?:\d{4}-\d{2}-\d{2})?$/.test(next.morningBriefLast))next.morningBriefLast='';},
 setup(s){
  const run=()=>{
   const project=s.dialogue.state.projects.find(p=>p.id==='general')||s.dialogue.state.projects[0];if(!project)return null;
   const started=s.chatJobs.start(null,project.id,REQUEST);if(!started?.topicId)return null;
   const topic=s.dialogue.state.topics.find(t=>t.id===started.topicId);if(topic){topic.title='Утренняя сводка · '+new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});s.dialogue.persist();
    // Registered parts go before the request, so the chat reads: parts, the request, the agents' answer.
    if(parts.size)partsFor(s).then(extra=>{if(!extra.length||!s.dialogue.state.topics.includes(topic))return;topic.messages.splice(0,0,...extra);s.dialogue.persist();}).catch(()=>{});}
   return started.topicId;
  };
  const tick=()=>{try{const today=due({time:s.settings.morningBrief,days:s.settings.morningBriefDays,last:s.settings.morningBriefLast});if(!today)return;s.saveSettings({morningBriefLast:today});run();}catch(e){console.error('Morning brief:',e.message);}};
  if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'&&!process.env.PETYA_LIVE_CHECK){const timer=setInterval(tick,30000);timer.unref?.();require('electron').app.once('will-quit',()=>clearInterval(timer));}
  const turn=command=>{
   const text=String(command).trim();let reply=null;
   const m=SET.exec(text);if(m){const time=pad(Math.min(23,Number(m[1])))+':'+pad(Math.min(59,Number(m[2]||0)));s.saveSettings({morningBrief:time});reply='Хорошо: по будням в '+time+' соберу сводку — мои задачи в работе, просроченные и что нового в Slack. Придёт отдельным чатом «Утренняя сводка».';}
   else if(OFF.test(text)){s.saveSettings({morningBrief:''});reply='Выключил утреннюю сводку.';}
   if(!reply)return null;
   s.dialogue.rememberAction(command,reply);const t=s.dialogue.active();const last=t?.messages?.at(-1);if(last?.role==='assistant')last.by='утренняя сводка';s.dialogue.persist();
   return {handled:true,text:reply,by:'утренняя сводка',topicId:t?.id,topicTitle:t?.title,messages:t?.messages};
  };
  return {morningBrief:{turn,run},ipc:{run:()=>({topicId:run()})}};
 }
};
