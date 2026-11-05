// Slack rate limit during «Заполни команду»: offer to read the Slack window, ask for computer control
// when it is off, and fill the team only from quotes found on screen.
const assert=require('node:assert/strict');const {TeamFill}=require('../src/team-fill.cjs');
(async()=>{
 let saved=null,screenCalls=0,approved=null,screenError=null;const settings={teamMembers:'[]',teamRoles:''};
 const fill=new TeamFill({settings:()=>settings,save:m=>{saved=m;settings.teamMembers=JSON.stringify(m);},scope:()=>'s',sources:()=>[],
  roster:async()=>{throw Object.assign(Error('Slack временно ограничил запросы (HTTP 429). Повторите через 30 с.'),{status:429,retryAfter:30});},
  extract:async sources=>({members:[{name:'Полина',responsibilities:'тестирование',source:sources[0].id,evidence:'Полина — тестирование'}]}),
  screen:async()=>{screenCalls++;if(screenError)throw screenError;return {title:'Экран Slack · #team',text:'Участники канала\nПолина — тестирование\nИван'};},
  approve:(command,action)=>{approved=action;return {handled:true,computerApproval:'id',text:'Нужен доступ'};}});
 let r=await fill.turn('Заполни команду');assert.equal(r.question,true);assert.match(r.text,/Могу сам посмотреть в приложении Slack/);assert.match(r.text,/30 с/);
 assert.deepEqual(r.clarificationOptions,['Посмотреть в Slack','Не сейчас']);assert(r.clarificationInput.choicesOnly);
 r=await fill.turn('Не сейчас',true);assert.match(r.text,/через 30 с/);assert.equal(screenCalls,0,'no screen reading without consent');
 await fill.turn('Заполни команду');r=await fill.turn('Посмотреть в Slack',true);assert.equal(screenCalls,1);assert.match(r.text,/Добавлено коллег: 1/);assert.equal(saved[0].name,'Полина');
 // Computer control off: the standard approval is requested, then the same fill runs.
 screenError=Object.assign(Error('Нужно разрешение'),{code:'COMPUTER_PERMISSION_REQUIRED'});await fill.turn('Заполни команду');r=await fill.turn('давай',true);assert.equal(r.computerApproval,'id');assert.deepEqual(approved,{type:'teamFillScreen'});
 screenError=null;settings.teamMembers='[]';r=await fill.fromScreen('Заполни команду');assert.match(r.text,/Добавлено коллег: 1/);
 // Nothing readable on screen: ask to open the channel and try again.
 const empty=new TeamFill({settings:()=>({teamMembers:'[]'}),save(){},scope:()=>'s',sources:()=>[],roster:async()=>{throw Object.assign(Error('HTTP 429'),{status:429});},screen:async()=>({text:''})});
 await empty.turn('Заполни команду');r=await empty.turn('да',true);assert.match(r.text,/Открой в Slack канал/);assert.equal(r.question,true);
 console.log('Team fill from the Slack screen: consent, decline, approval, grounded fill and empty window passed');
})().catch(e=>{console.error(e);process.exit(1);});
