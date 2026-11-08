// «Кто знает»: routing (person searches vs factual questions and small talk), a fixture git repository in a temp
// folder (authors, recency, numstat, renames, commit messages), stubbed Jira search, Slack and meeting memory, team
// matching by email / Jira ID / Slack ID / name, the transparent score and per-person evidence with links.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const query=require('../src/extensions/who-knows/query.cjs');
const terms=require('../src/extensions/who-knows/terms.cjs');
const git=require('../src/extensions/who-knows/git.cjs');
const jira=require('../src/extensions/who-knows/jira.cjs');
const app=require('../src/extensions/who-knows/feature.cjs');
const offer=require('../src/extensions/who-knows/offer.cjs');
const {GitWorkspace}=require('../src/git-workspace.cjs');
const DAY=86400000,NOW=Date.UTC(2026,10,9,12);

// --- fixture repository ------------------------------------------------------------------------------------
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-who-knows-'));
const run=(args,env={})=>execFileSync('git',['-C',root,...args],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',HOME:root,...env},stdio:['ignore','pipe','pipe']}).toString();
run(['init','-q','-b','main']);
function commit(file,lines,author,email,daysAgo,message){
 const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});
 const old=fs.existsSync(full)?fs.readFileSync(full,'utf8'):'';
 fs.writeFileSync(full,old+Array.from({length:lines},(_,i)=>'// '+message+' '+i).join('\n')+'\n');
 run(['add','--',file]);
 const date=new Date(NOW-daysAgo*DAY).toISOString();
 run(['-c','user.name='+author,'-c','user.email='+email,'commit','-q','-m',message],{GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date,GIT_AUTHOR_NAME:author,GIT_AUTHOR_EMAIL:email,GIT_COMMITTER_NAME:author,GIT_COMMITTER_EMAIL:email});
}
commit('Assets/Scripts/Net/NetworkManager.cs',120,'Ivan Petrov','ivan@studio.dev',20,'Network manager with reconnect');
commit('Assets/Scripts/Net/Client.cs',60,'Ivan Petrov','ivan@studio.dev',5,'Client keeps the session alive');
commit('Assets/Scripts/Net/Client.cs',200,'Anna Smirnova','anna.s@studio.dev',420,'First client prototype');
commit('Assets/Scripts/Shop/ShopWindow.cs',80,'Anna Smirnova','anna.s@studio.dev',10,'Shop window layout');
commit('Assets/Scripts/Shop/ShopWindow.cs',10,'Oleg K','oleg.k@gmail.com',2,'Shop prices from config');
commit('Assets/UI/MainMenu.cs',15,'Anna Smirnova','anna.s@studio.dev',3,'Fix network error dialog in menu');
commit('Assets/Scripts/Player/PlayerController.cs',90,'Oleg K','oleg.k@gmail.com',30,'Player movement');
commit('Assets/Scripts/Inventory/Inventory.cs',40,'Oleg K','oleg.k@gmail.com',1,'Inventory stacking');
commit('Assets/Scripts/Inventory/Inventory.cs',25,'Ivan Petrov','ivan@studio.dev',15,'Inventory sync over the network');
fs.mkdirSync(path.join(root,'Assets/Scripts/Camera'),{recursive:true});
fs.writeFileSync(path.join(root,'Assets/Scripts/Camera/Follow.cs'),'class Follow { PlayerController target; }\n');
run(['add','--','Assets/Scripts/Camera/Follow.cs']);
{const date=new Date(NOW-8*DAY).toISOString();run(['-c','user.name=Анна Смирнова','-c','user.email=anna.s@studio.dev','commit','-q','-m','Camera follows the player'],{GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date,GIT_AUTHOR_NAME:'Анна Смирнова',GIT_AUTHOR_EMAIL:'anna.s@studio.dev',GIT_COMMITTER_NAME:'Анна Смирнова',GIT_COMMITTER_EMAIL:'anna.s@studio.dev'});}
run(['remote','add','origin','git@github.com:studio/game.git']);

(async()=>{
 // --- routing -------------------------------------------------------------------------------------------------
 const own={'Кто разбирается в сетевом коде?':['expert','сетевом коде'],'к кому идти по магазину':['expert','магазину'],'кто писал PlayerController':['author','PlayerController'],
  'кто последний трогал инвентарь':['last','инвентарь'],'Петя, кто у нас лучше всех знает про сохранения?':['expert','сохранения'],'кого спросить про матчмейкинг':['expert','матчмейкинг'],
  'кто знает, как устроены сохранения':['expert','сохранения'],'кто занимается сетевым кодом':['expert','сетевым кодом'],'кто последним менял Assets/Scripts/Net/Client.cs':['last','Assets/Scripts/Net/Client.cs']};
 for(const [text,[mode,topic]] of Object.entries(own))assert.deepEqual(query.parse(text),{mode,topic},text);
 for(const text of ['кто ты','кто ты такой?','кто знает, когда релиз','кто знает где ключи от офиса','знаешь ли ты, что такое мана','ты знаешь Ивана?','кто знает','кто написал Войну и мир','кто написал «Мастера и Маргариту»',
  'кто работает завтра','кто занимается спортом','кто знает как пройти в библиотеку','кто тестировщик в команде','что такое сетевой код'])assert.equal(query.parse(text),null,text);
 // Offer: person searches only.
 const offered=t=>offer.topics.some(r=>r.test(t))&&!offer.avoid.some(r=>r.test(t));
 for(const t of ['кто разбирается в сетевом коде','к кому идти по магазину','кто писал PlayerController','кто последний трогал инвентарь'])assert.ok(offered(t),t);
 for(const t of ['кто знает, когда релиз','кто ты','знаешь ли ты, кто такой Гагарин','заполни команду'])assert.ok(!offered(t),t);

 // --- terms and git ---------------------------------------------------------------------------------------------
 const net=terms.build('сетевом коде');
 assert.ok(net.paths.includes('net')&&net.text.includes('сетев'));
 assert.equal(terms.pathScore('Assets/Scripts/Net/Client.cs',net),1);assert.equal(terms.pathScore('Assets/Scripts/Internet.cs',net),0);
 assert.deepEqual(git.parseLog('\x1eabc1234def\x1fA\x1fa@x.dev\x1f1700000000\x1fmsg\n\n3\t1\tsrc/{old => new}/a.cs\n-\t-\timg.png\n')[0].files,[{file:'src/new/a.cs',lines:4},{file:'img.png',lines:0}]);
 assert.equal(git.web('git@github.com:studio/game.git').commit('abc'),'https://github.com/studio/game/commit/abc');
 assert.equal(git.web('https://gitlab.com/studio/game.git').file('abc','a b.cs'),'https://gitlab.com/studio/game/-/blob/abc/a%20b.cs');
 assert.equal(git.web('/srv/repo.git'),null);
 assert.ok(git.recency(NOW-120*DAY,NOW)>0.49&&git.recency(NOW-120*DAY,NOW)<0.51,'half weight after 120 days');
 assert.match(jira.jql(['сетев','network','"x) OR 1=1'],['NET']),/^project IN \("NET"\) AND \(text ~ "сетев\*" OR text ~ "network" OR text ~ "xOR11"\)/);

 // --- chat turns with stubs --------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 const members=[{name:'Иван Петров',email:'ivan@studio.dev',role:'Сетевой программист',slackId:'U01IVAN',jiraId:'acc-ivan'},{name:'Анна Смирнова',role:'UI-программист',slackId:'U02ANNA'}];
 let jiraCalls=[],jiraFail=null;
 const settings={model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',teamMembers:JSON.stringify(members),jiraUrl:'https://studio.atlassian.net',jiraEmail:'me@studio.dev',jiraToken:'t',jiraProjects:'NET,GAME'};
 const iso=d=>new Date(NOW-d*DAY).toISOString();
 const memory=[
  {id:'slack:C1:1',source:'Slack',channel:'C1',title:'Сетевой слой',url:'https://app.slack.com/archives/C1/p1762000000000100',at:NOW-2*DAY,messages:[
   {ts:'1762000000.000100',at:NOW-2*DAY,user:'U01IVAN',text:'Переписал сетевой слой, реконнект теперь в NetworkManager'},
   {ts:'1762000100.000200',at:NOW-2*DAY,user:'U02ANNA',text:'А сетевые ошибки в меню показываем?'},
   {ts:'1762000200.000300',at:NOW-2*DAY,user:'U09BOT',bot_id:'B1',text:'сетевой бот'}]},
  {id:'m1-0',sessionId:'m1',source:'Встреча',speaker:'Ivan Petrov',title:'Планёрка · 1 ноября',text:'По сетевому коду: переходим на новый транспорт.',at:NOW-8*DAY},
  {id:'m1-1',sessionId:'m1',source:'Микрофон',title:'Планёрка',text:'сетевой код это важно',at:NOW-8*DAY}
 ];
 const s={settings,requestProgress:{report(){}},memory:{prune:()=>memory},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  gitWorkspace:new GitWorkspace({context:()=>({id:'p1',name:'Game',folders:[root]})}),
  workspace:{settings:()=>settings,async api(route,options){jiraCalls.push([route,JSON.parse(options.body)]);if(jiraFail)throw jiraFail;if(!/сетев|network/.test(JSON.parse(options.body).jql))return {isLast:true,issues:[]};return {isLast:true,issues:[
   {key:'NET-12',fields:{summary:'Реконнект при потере сети',status:{name:'In Progress'},updated:iso(3),assignee:{accountId:'acc-ivan',displayName:'Ivan Petrov'},reporter:{accountId:'acc-anna',displayName:'Anna Smirnova'},
    comment:{comments:[{author:{accountId:'acc-ivan',displayName:'Ivan Petrov'},created:iso(3)},{author:{accountId:'acc-pavel',displayName:'Pavel Q'},created:iso(4)}]}}},
   {key:'NET-15',fields:{summary:'Сетевые таймауты на 3G',status:{name:'Done'},updated:iso(200),assignee:{accountId:'acc-pavel',displayName:'Pavel Q'},reporter:null,comment:{comments:[]}}}]};}},
  async request(){throw Error('no model calls expected');}};
 assert.equal(await app.turn(s,'кто разбирается в сетевом коде'),null,'not added: nothing here');
 settings['extension_who-knows']='true';
 for(const t of ['кто знает, когда релиз','кто ты','знаешь ли ты, что такое мана'])assert.equal(await app.turn(s,t),null,t);

 const r=await app.turn(s,'Кто разбирается в сетевом коде?');
 const card=r.extensionData.whoKnows;
 assert.equal(topic.messages.at(-1).by,'Кто знает');
 assert.equal(card.people[0].name,'Иван Петров','Ivan leads: recent network code, Jira assignee, Slack and meeting');
 const ivan=card.people[0];
 assert.ok(ivan.points.code>0&&ivan.points.jira>3&&ivan.points.slack>0&&ivan.points.meetings>0,JSON.stringify(ivan.points));
 assert.equal(ivan.member,true);assert.equal(ivan.role,'Сетевой программист');
 assert.ok(ivan.files.some(f=>f.path==='Assets/Scripts/Net/NetworkManager.cs'&&f.url.startsWith('https://github.com/studio/game/blob/')));
 assert.ok(ivan.commits.every(c=>c.url.startsWith('https://github.com/studio/game/commit/')));
 assert.deepEqual(ivan.issues.find(i=>i.key==='NET-12').roles,['исполнитель','комментарии: 1']);
 assert.equal(ivan.issues[0].url,'https://studio.atlassian.net/browse/NET-12');
 assert.equal(ivan.threads[0].url,'https://app.slack.com/archives/C1/p1762000000000100');
 assert.equal(ivan.meetings[0].title,'Планёрка');
 const anna=card.people.find(p=>p.name==='Анна Смирнова');
 assert.ok(anna,'Anna matched by Jira name and git email to the team');assert.ok(anna.points.jira>0&&anna.points.code>0&&anna.points.slack>0);
 assert.ok(anna.commits.some(c=>c.subject==='Fix network error dialog in menu'&&c.byMessage),'commit found by its message');
 assert.ok(anna.points.code<ivan.points.code,'an old prototype weighs less than recent work');
 assert.ok(card.people.some(p=>p.name==='Pavel Q'&&!p.member),'people outside «Команда» stay with their own name');
 assert.ok(!card.people.some(p=>/бот|U09BOT/.test(p.name)),'bots and the user\'s own microphone are not people');
 assert.ok(card.people.every(p=>p.score===Math.round(Object.values(p.points).reduce((a,b)=>a+b,0)*10)/10),'the score is the sum of its parts');
 assert.deepEqual(card.sources.map(x=>[x.kind,x.state]),[['code','ok'],['jira','ok'],['slack','ok'],['meetings','ok']]);
 assert.match(jiraCalls[0][1].jql,/^project IN \("NET","GAME"\) AND \(text ~ "сетев\*"/);
 assert.match(r.text,/^По теме «сетевом коде» больше всех знают: Иван Петров \(код [\d.]+, Jira [\d.]+, Slack [\d.]+, встречи [\d.]+\)/);
 assert.ok(r.text.length<400);

 // Author of an identifier: the file named after it and files that use it (git grep).
 const author=(await app.turn(s,'кто писал PlayerController')).extensionData.whoKnows;
 assert.equal(author.mode,'author');assert.equal(author.people[0].name,'Oleg K');assert.equal(author.people[0].member,false);
 assert.ok(author.people.some(p=>p.name==='Анна Смирнова'&&p.files.some(f=>f.path==='Assets/Scripts/Camera/Follow.cs')),'git grep finds code using the identifier; the Cyrillic git name matches the team');
 // Last touch: by the latest commit, not by the score.
 const last=await app.turn(s,'кто последний трогал инвентарь');
 assert.equal(last.extensionData.whoKnows.people[0].name,'Oleg K');
 assert.match(last.text,/^Последним «инвентарь» трогал\(а\) Oleg K — .+, «Inventory stacking» \([0-9a-f]{8}\)\./);

 // Jira failure: the card still comes from the other sources and says what failed.
 jiraFail=Object.assign(Error('HTTP 401'),{status:401});
 const partial=(await app.turn(s,'к кому идти по магазину')).extensionData.whoKnows;
 assert.equal(partial.sources.find(x=>x.kind==='jira').state,'error');
 assert.equal(partial.people[0].name,'Анна Смирнова','shop: Anna\'s window outweighs Oleg\'s small change');
 jiraFail=null;

 // The model only adds search words; a word it makes up cannot add people by itself.
 settings.model='qwen3:4b';
 s.request=async(url,options)=>{const body=JSON.parse(options.body);assert.match(body.messages[0].content,/Не называй людей/);return {message:{content:JSON.stringify({terms:['Photon','Иван Петров — эксперт','../../etc']})}};};
 const withModel=(await app.turn(s,'кто разбирается в сетевом коде')).extensionData.whoKnows;
 assert.ok(withModel.search.paths.includes('photon'));assert.ok(!withModel.search.text.some(t=>/\.\./.test(t)));
 assert.equal(withModel.people[0].name,'Иван Петров');
 settings.model='';

 // Nothing to look at: a question, not an error.
 const bare={...s,gitWorkspace:new GitWorkspace({context:()=>null}),memory:{prune:()=>[]},settings:{...settings,jiraUrl:''},workspace:null};
 const none=await app.turn(bare,'кто разбирается в сетевом коде');
 assert.equal(none.question,true);assert.match(none.text,/Подключите папку проекта с Git/);
 // Sources are there but say nothing about the subject.
 const empty=await app.turn({...s,workspace:{...s.workspace,async api(){return {isLast:true,issues:[]};}}},'кто разбирается в квантовой физике');
 assert.deepEqual(empty.extensionData.whoKnows.people,[]);assert.match(empty.text,/не нашёл следов/);

 fs.rmSync(root,{recursive:true,force:true});
 console.log('Who knows: routing and near-misses, fixture git history with recency, Jira roles, Slack and meetings, team matching, transparent score passed');
})().catch(e=>{console.error(e);fs.rmSync(root,{recursive:true,force:true});process.exit(1);});
