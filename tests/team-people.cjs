// Team refresh: one card per person across alphabets, names in Russian, deactivated Slack accounts dropped,
// each service keeps its own name and ID on the card.
const assert=require('node:assert/strict');
const {TeamFill}=require('../src/team-fill.cjs'),{enrich}=require('../src/team-enrich.cjs');
const {russian}=require('../src/name-ru.cjs');
assert.equal(russian('Konstantin Shishlov'),'Константин Шишлов');assert.equal(russian('Dmitry Zhukovsky'),'Дмитрий Жуковский');assert.equal(russian('John Smith'),'');assert.equal(russian('Полина'),'');
(async()=>{
 const settings={teamMembers:JSON.stringify([{name:'Полина',role:'QA/PM',projects:'BW, MW2'},{name:'Old Colleague',slackId:'U9'}]),teamRoles:''};
 const slack={profiles:[{slackId:'U2',names:['polina samarina'],name:'Polina Samarina',handle:'polina',title:'',email:''},{slackId:'U3',names:['konstantin shishlov'],name:'Konstantin Shishlov',handle:'kostya',title:'',email:''}],
  deleted:[{slackId:'U9',names:['old colleague'],name:'Old Colleague'},{slackId:'U8',names:['gone person'],name:'Gone Person'}],complete:true};
 const fill=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>[],scope:()=>'s',
  roster:async()=>[
   {member:{name:'Polina Samarina',slackId:'U2',accounts:{slack:{id:'U2',name:'Polina Samarina'}}},evidence:'Slack',source:'Slack'},
   {member:{name:'Konstantin Shishlov',slackId:'U3'},evidence:'Slack',source:'Slack'},
   {member:{name:'Gone Person'},evidence:'Slack',source:'Slack'}],
  enrich:async(rows)=>{const out=enrich(rows,slack,new Map());out.slack=slack;return out;}});
 const r=await fill.turn('Заполни команду',false,null,null,{force:true});
 const saved=JSON.parse(settings.teamMembers);
 assert.deepEqual(saved.map(m=>m.name).sort(),['Константин Шишлов','Полина Самарина'],r.text);
 const polina=saved.find(m=>m.name==='Полина Самарина');
 assert.equal(polina.role,'QA/PM','the hand-written role is kept');assert.equal(polina.slackId,'U2');
 assert.match(polina.aliases,/Полина/);assert.match(polina.aliases,/Polina Samarina/);
 assert.equal(polina.accounts.slack.id,'U2');assert.equal(polina.accounts.slack.handle,'polina');
 assert.match(r.text,/Деактивированы в Slack.*Gone Person/);assert.match(r.text,/Old Colleague/);
 // A duplicate saved by an earlier refresh is joined into one card.
 {const st={teamMembers:JSON.stringify([{name:'Полина',role:'QA/PM'},{name:'Polina Samarina',role:'тестирование и пм',slackId:'U2'},{name:'Lev Silaev',slackId:'U5'}]),teamRoles:''};
  const f=new TeamFill({settings:()=>st,save:m=>{st.teamMembers=JSON.stringify(m);},sources:()=>[],scope:()=>'s',roster:async()=>[{member:{name:'Lev Silaev',slackId:'U5'},evidence:'Slack',source:'Slack'}],
   enrich:async rows=>{const out=enrich(rows,{profiles:[],deleted:[]},new Map());out.slack={profiles:[],deleted:[],complete:true};return out;}});
  const res=await f.turn('Заполни команду',false,null,null,{force:true});const rows=JSON.parse(st.teamMembers);
  assert.deepEqual(rows.map(m=>m.name),['Полина Самарина','Лев Силаев'],res.text);assert.equal(rows[0].role,'QA/PM');assert.equal(rows[0].slackId,'U2');assert.match(res.text,/Объединил повторяющиеся карточки: 1/);}
 // Photos: Slack picture first, Jira as fallback, only known hosts, kept as a small data URL.
 {const photos=require('../src/team-photos.cjs');const got=[];const nativeImage={createFromBuffer:b=>({isEmpty:()=>!b.length,resize:()=>({toDataURL:()=>'data:image/png;base64,'+b.toString('base64')})})};
  const ms=[{name:'A',accounts:{slack:{image:'https://avatars.slack-edge.com/a.png'}}},{name:'B',accounts:{slack:{image:'https://evil.example/x.png'},jira:{image:'https://secure.gravatar.com/b.png'}}},{name:'C',photo:'data:image/png;base64,AA=='}];
  const n=await photos.fill(ms,{nativeImage,get:async url=>{got.push(url);return Buffer.from('img');}});
  assert.equal(n,2);assert.deepEqual(got,['https://avatars.slack-edge.com/a.png','https://secure.gravatar.com/b.png']);assert.match(ms[0].photo,/^data:image\/png;base64,/);assert.equal(ms[2].photo,'data:image/png;base64,AA==');
  assert.equal(require('../src/team.cjs').validate([{name:'X',photo:ms[0].photo}])[0].photo,ms[0].photo);assert.equal(require('../src/team.cjs').validate([{name:'X',photo:'javascript:1'}])[0].photo,undefined);}
 console.log('Team people: one card across alphabets, Russian names, deactivated accounts dropped, service accounts kept, saved duplicates joined, photos passed');
})().catch(e=>{console.error(e);process.exit(1);});
