// Feature: how Petya addresses the user — grammatical gender for «ты сделал / сделала».
// Setting userGender: '' (from the name), 'm' or 'f'. Voice: «обращайся ко мне в женском роде».
const MALE_ON_A=new Set(['саша','женя','валя','шура','никита','илья','кузьма','фома','лука','миша','гоша','паша','костя','дима','вова','петя','ваня','лёша','леша','серёжа','сережа','коля','толя','федя','гриша','боря','сеня','слава','юра','стёпа','степа','тёма','тема','вася','лёва','лева','савва','данила','ilya','nikita','luka','misha','sasha','dima','kostya','vanya']);
const FEMALE_AMBIGUOUS=new Set([]);
function guess(name=''){
 const first=String(name).trim().split(/\s+/)[0].toLowerCase();
 if(!first)return 'm';
 if(MALE_ON_A.has(first))return 'm';
 if(FEMALE_AMBIGUOUS.has(first))return 'f';
 return /[ая]$/u.test(first)||/(?:a|ia|ya)$/u.test(first)?'f':'m';
}
const SAY=/^(?:петя[,!\s]+)?(?:пожалуйста[,\s]+)?(?:обращайся ко мне|говори со мной|называй меня)\s+в\s+(женском|мужском)\s+роде[.!]*$|^(?:петя[,!\s]+)?я\s+(девушка|женщина|парень|мужчина)[.!]*$/iu;
module.exports={matches:t=>SAY.test(String(t||'').trim()),
 name:'address',
 guess,
 defaults:{userGender:''},
 validate(next){if(!['','m','f'].includes(next.userGender))next.userGender='';},
 setup(s){
  require('../informal.cjs').options.gender=()=>s.settings.userGender||guess(s.settings.userName);
  require('../dialogue-request.cjs').rules.push(()=>(s.settings.userGender||guess(s.settings.userName))==='f'?'Собеседник — женщина: о ней говори в женском роде («ты сделала», «ты права»).':'');
  const turn=command=>{const m=SAY.exec(String(command).trim());if(!m)return null;const female=/женск|девушк|женщин/iu.test(m[1]||m[2]);
   s.saveSettings({userGender:female?'f':'m'});const text=female?'Хорошо, буду обращаться к тебе в женском роде.':'Хорошо, буду обращаться к тебе в мужском роде.';s.dialogue.rememberAction(command,text);
   return {handled:true,text,by:'обращение',topicId:s.dialogue.active()?.id,messages:s.dialogue.active()?.messages};};
  return {address:{turn}};
 }
};
