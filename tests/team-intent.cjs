const assert=require('node:assert/strict');const feature=require('../src/features/team-intent.cjs');
(async()=>{
 // the model decides; the feature only routes. Unrelated messages never ask the model.
 let asked=[],answer='fill';const calls=[];
 const s={settings:{model:'m',ollamaUrl:'http://127.0.0.1:11434',teamMembers:JSON.stringify([{name:'Полина'}])},core:{localEndpoint:u=>u},requestProgress:{report(){}},attachments:{list:()=>[]},dialogue:{active:()=>null},
  request:async(_u,o)=>{asked.push(JSON.parse(JSON.parse(o.body).messages[1].content).request);return {message:{content:JSON.stringify({intent:answer,confidence:.9})}};},
  teamFill:{turn:async(text,a,b,c,opts)=>{calls.push([text,opts]);return {handled:true,text:'ok'};}}};
 const {teamIntent}=feature.setup(s);
 for(const [q,intent,existing] of [['Можешь команде добавить роли?','existing',true],['Подтяни почты коллег','existing',true],['Найди, кто у нас в команде, и запиши','fill',false],['Полина теперь отвечает за релизы','facts',false]]){
  answer=intent;calls.length=0;const r=await teamIntent.turn(q);assert.equal(r.text,'ok',q);assert.equal(calls[0][1].force,true);assert.equal(!!calls[0][1].existing,existing,q);}
 answer='workload';calls.length=0;assert.equal(await teamIntent.turn('Что делает команда на этой неделе?'),null);assert.equal(calls.length,0,'workload stays with the Jira reports');
 asked.length=0;for(const q of ['Как сварить гречку?','Какая погода в Москве?','Напиши команду git для отката коммита'])assert.equal(await teamIntent.turn(q),null,q);assert.equal(asked.length,0,'no model call for messages not about the team');
 answer='fill';s.request=async()=>({message:{content:JSON.stringify({intent:'fill',confidence:.4})}});assert.equal(await teamIntent.turn('Что там с командой?'),null,'low confidence falls back');
 s.settings.model='';assert.equal(await teamIntent.turn('Заполни команду'),null,'no model: the regex routing handles it');
 console.log('Team intent: fill / existing / facts by meaning, workload and other requests stay with the pipeline, no model call off-topic, low confidence and no model fall back passed');
})().catch(e=>{console.error(e);process.exit(1);});
