// «Перформанс-ревью»: routing and near-misses (code review, PR reviews, store reviews, a 1:1, «что такое»), the period
// words; not added; «ревью Олега» without the perf words only for a colleague of «Команда»; an unknown or missing
// person asked; facts from stubbed Jira (tasks and incidents), GitHub search (authored PRs and reviews of others),
// meeting summaries (tasks and decisions naming the person) and the 1:1 records, each with its source; the model's
// draft checked — points citing no fact, a fact of another section, an invented number or another person's name are
// dropped, empty sections counted by rules; gaps stated («нет данных о …»); a failing Jira kept apart; nothing connected
// → a question; the reply text carries counts, not notes. Fake clock, no network.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/perf-review/feature.cjs');
const facts=require('../src/extensions/perf-review/facts.cjs');
const {check,rules,markdown}=require('../src/extensions/perf-review/draft.cjs');
const offer=require('../src/extensions/perf-review/offer.cjs');
const people=require('../src/features/people.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const NOW=new Date('2026-11-09T10:00:00Z').getTime();
app.deps.now=()=>NOW;
const SITE='https://studio.atlassian.net';
const TEAM=[{name:'Олег Смирнов',aliases:'Олег',role:'Сервер',jiraId:'u-oleg',email:'oleg@studio.example',accounts:{github:{handle:'oleg-smirnov'}}},{name:'Маша Петрова',aliases:'Маша',role:'Клиент'}];
const dirs=[];process.on('exit',()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'petya-perf-'));dirs.push(d);return d;};
const day=ms=>new Date(ms).getTime();
function fixture({settings={},jira,github,model,memory=[],team=TEAM}={}){
 const topic={id:'t1',title:'Чат',messages:[]},calls=[];
 const all={'extension_perf-review':'true',teamMembers:JSON.stringify(team),model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',
  module_jira:'true',jiraUrl:SITE,jiraEmail:'lead@studio.example',jiraToken:'jira-test',jiraProjects:'GAME',extension_github:'true',githubToken:'gh-test',githubRepos:'studio/game',...settings};
 const s={settings:all,companyId:'c1',dataRoot:tmp(),requestProgress:{report(){}},memory:{prune:()=>memory},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  workspace:{api:async(route,options)=>{calls.push({route,body:JSON.parse(options.body)});if(!jira)throw Object.assign(Error('HTTP 500'),{status:500});return jira(route,JSON.parse(options.body));}},
  async request(url,options={}){calls.push({url});const u=new URL(url);
   if(u.pathname==='/api/chat'){assert.ok(model,'the model is not asked here');return model(JSON.parse(options.body));}
   if(u.origin==='https://api.github.com'){assert.equal(options.headers.Authorization,'Bearer gh-test');return github(u);}
   throw Error('unexpected '+url);}};
 s.people=people.create(s,{now:()=>NOW,sources:()=>[]});
 return {s,topic,calls};
}
const jira=(route,body)=>{
 assert.equal(route,'/rest/api/3/search/jql');
 assert.equal(body.jql,'project IN ("GAME") AND assignee = "u-oleg" AND statusCategory = Done AND resolved >= "2026-05-11" ORDER BY resolved DESC');
 return {issues:[
  {key:'GAME-12',fields:{summary:'Матчмейкинг по рейтингу',issuetype:{name:'Story'},labels:[],resolutiondate:'2026-09-03T10:00:00.000+0000'}},
  {key:'GAME-30',fields:{summary:'Падение сервера лиг',issuetype:{name:'Bug'},labels:['incident'],resolutiondate:'2026-10-14T10:00:00.000+0000'}},
  {key:'GAME-9',fields:{summary:'Логи сервера',issuetype:{name:'Task'},labels:[],resolutiondate:'2026-06-01T10:00:00.000+0000'}}]};
};
const github=u=>{
 assert.equal(u.pathname,'/search/issues');
 const q=u.searchParams.get('q');
 if(/ author:oleg-smirnov/.test(q)){assert.equal(q,'repo:studio/game type:pr author:oleg-smirnov created:>=2026-05-11');
  return {items:[{number:41,title:'Новый матчмейкер',state:'closed',pull_request:{merged_at:'2026-09-01T10:00:00Z'},created_at:'2026-08-25T10:00:00Z',html_url:'https://github.com/studio/game/pull/41'},
   {number:44,title:'Черновик кэша',state:'open',pull_request:{merged_at:null},created_at:'2026-11-02T10:00:00Z',html_url:'https://github.com/studio/game/pull/44'}]};}
 assert.equal(q,'repo:studio/game type:pr reviewed-by:oleg-smirnov -author:oleg-smirnov updated:>=2026-05-11');
 return {items:[{number:43,title:'Шейдеры травы',state:'closed',updated_at:'2026-10-20T10:00:00Z',user:{login:'masha-p'},html_url:'https://github.com/studio/game/pull/43'}]};
};
const memory=[
 {kind:'summary',title:'Сводка встречи · 12 окт., 11:00',at:day('2026-10-12T11:00:00Z'),summary:{decisions:['Олег ведёт переход на новый матчмейкер','Перенести релиз на неделю'],tasks:[{who:'Олег',what:'Подготовить план миграции лиг',due:'пятница'},{who:'Маша',what:'Макеты',due:''}],discussed:[],notDiscussed:[]}},
 {kind:'summary',title:'Сводка встречи · 1 янв.',at:day('2026-01-01T11:00:00Z'),summary:{decisions:['Олег — старое'],tasks:[],discussed:[],notDiscussed:[]}}];

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------------
 assert.deepEqual(app.route('собери материалы для ревью Олега за полгода'),{who:'Олега',period:'полгода',explicit:false});
 assert.deepEqual(app.route('подготовь перформанс-ревью Маши за квартал'),{who:'Маши',period:'квартал',explicit:true});
 for(const p of ['Петя, подготовь performance review для Олега за 3 месяца','ревью Олега за полгода','перф-ревью','собери материалы для перф-ревью'])assert.ok(app.route(p),p);
 for(const p of ['сделай код-ревью','ревью кода','ревью PR #42','какие PR ждут моего ревью','отзывы в App Store','подготовь 1:1 с Олегом','что такое перформанс-ревью','ревью дизайна уровня','привет'])assert.equal(app.route(p),null,p);
 assert.deepEqual(['','квартал','год','3 месяца','2 недели','месяц'].map(app.days),[182,91,365,91,14,30]);
 assert.equal(offer.ready({'extension_perf-review':'true'}),false,'added but nothing to read facts from');
 assert.equal(offer.ready({'extension_perf-review':'true',githubToken:'gh-test',extension_github:'true'}),true);

 // --- Not added, people --------------------------------------------------------------------------------------------
 let f=fixture({settings:{'extension_perf-review':'false'}});
 assert.equal(await app.turn(f.s,'подготовь перформанс-ревью Олега'),null);
 f=fixture({jira,github,memory});
 assert.equal(await app.turn(f.s,'ревью Пети за полгода'),null,'not a colleague and no perf words: not ours');
 assert.match((await app.turn(f.s,'подготовь перформанс-ревью Пети')).text,/^Не нашёл «Пети» в «Команде»/);
 let q;try{await app.turn(f.s,'подготовь перф-ревью');}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.deepEqual(q.spec.options,['Олег Смирнов · Сервер','Маша Петрова · Клиент']);
 assert.equal((await app.turn({...f.s,people:null},'подготовь перформанс-ревью Олега')).question,true);

 // --- Facts and the rules draft (no model) ---------------------------------------------------------------------------
 f.s.people.addNote('u-oleg',{date:'2026-10-01',text:'Хочет вести архитектуру матчмейкинга. Устал от дежурств.',followups:[{text:'Подготовит RFC по очередям',owner:'them'},{text:'Выбить бюджет на курсы',owner:'me'}]});
 const fu=f.s.people.followups({member:'u-oleg'}).find(x=>x.owner==='them');f.s.people.setFollowup('u-oleg',fu.id,true);
 const r=await app.turn(f.s,'собери материалы для ревью Олега за полгода');
 const card=r.extensionData.perfReviewCard;
 assert.equal(card.from,'2026-05-11');assert.equal(card.to,'2026-11-09');assert.equal(card.person.name,'Олег Смирнов');
 assert.deepEqual(card.facts.map(x=>[x.id,x.kind,x.date]),[['F1','task','2026-06-01'],['F2','pr','2026-09-01'],['F3','task','2026-09-03'],['F4','note','2026-10-01'],['F5','meeting','2026-10-12'],['F6','meeting','2026-10-12'],
  ['F7','incident','2026-10-14'],['F8','review','2026-10-20'],['F9','pr','2026-11-02'],['F10','followup','2026-11-09']]);
 for(const x of card.facts)assert.ok(x.source?.label,x.id+' has a source');
 assert.equal(card.facts[1].source.url,'https://github.com/studio/game/pull/41');assert.equal(card.facts[2].source.url,SITE+'/browse/GAME-12');
 assert.equal(card.facts[6].text,'Разобран инцидент GAME-30 «Падение сервера лиг»');
 assert.deepEqual(card.facts.filter(x=>x.kind==='meeting').map(x=>x.text),['Взял(а) на встрече: Подготовить план миграции лиг (срок: пятница)','Решение встречи: Олег ведёт переход на новый матчмейкер']);
 assert.equal(card.facts[9].text,'Договорённость с 1:1: Подготовит RFC по очередям — выполнено','only their follow-ups');
 assert.deepEqual(card.gaps,[]);
 assert.equal(card.draft.by,'rules');
 assert.deepEqual(card.draft.sections.map(x=>[x.id,x.items.map(i=>[i.text,i.facts.join(',')])]),[
  ['results',[['Закрыто задач в Jira: 2 (GAME-9, GAME-12)','F1,F3'],['Разобрано инцидентов: 1 (GAME-30)','F7']]],
  ['engineering',[['Pull requests: 2, из них влито 1','F2,F9'],['Код-ревью чужих PR: 1','F8']]],
  ['collaboration',[['Задачи и решения со встреч: 2','F5,F6'],['Договорённости с 1:1: 1, выполнено 1','F10'],['Итогов встреч 1:1 за период: 1','F4']]]]);
 assert.deepEqual(card.months.map(m=>m.month),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
 assert.equal(card.months[5].counts.meeting,2);
 assert.equal(r.text,'Ревью · Олег Смирнов с 11 мая 2026 г. по 9 ноября 2026 г.: фактов 10 — задач 2, инцидентов 1, PR 2, ревью 1, со встреч 2, договорённостей 1:1 1, итогов 1:1 1. В черновике только эти факты, у каждого пункта — ссылки на них.');
 assert.ok(!r.text.includes('дежурств'),'the reply carries counts, not notes');
 assert.match(card.markdown,/^# Перформанс-ревью · Олег Смирнов/);assert.match(card.markdown,/- F2 · 2026-09-01 · PR #41 «Новый матчмейкер» — влит — https:\/\/github\.com\/studio\/game\/pull\/41/);

 // --- The model's draft is checked ---------------------------------------------------------------------------------
 let seen=null;
 const model=body=>{seen=JSON.parse(body.messages[1].content);return {message:{content:JSON.stringify({
  results:[{text:'Довёл до релиза матчмейкинг по рейтингу (GAME-12)',facts:['F3']},{text:'Закрыл 15 задач за полгода',facts:['F1','F3']},{text:'Сильный лидер команды',facts:[]},{text:'Помог Маше с шейдерами',facts:['F1']},{text:'Разобрал падение сервера лиг',facts:['F6','F99']}],
  engineering:[{text:'Сделал ревью PR #43 «Шейдеры травы»',facts:['F7']},{text:'Сделал ревью PR #43 Маши',facts:['F7']},{text:'Закрыл задачу GAME-9',facts:['F1']}],
  collaboration:[]})}};};
 const m=fixture({settings:{model:'qwen3:8b'},jira,github,model,memory});
 const mr=(await app.turn(m.s,'подготовь перформанс-ревью Олега за полгода')).extensionData.perfReviewCard;
 assert.deepEqual(seen.facts.map(x=>x.id),['F1','F2','F3','F4','F5','F6','F7','F8'],'no 1:1 notes in this company');
 assert.deepEqual(mr.draft.sections[0].items,[{text:'Довёл до релиза матчмейкинг по рейтингу (GAME-12)',facts:['F3']},{text:'Разобрал падение сервера лиг',facts:['F6']}],'an invented number, no facts and a name not in the facts are dropped');
 assert.deepEqual(mr.draft.sections[1].items,[{text:'Сделал ревью PR #43 «Шейдеры травы»',facts:['F7']}],'a fact of another section is not a basis; «Маши» is a guess from a login');
 assert.equal(mr.draft.sections[2].items[0].text,'Задачи и решения со встреч: 2','an empty section is counted by rules');
 assert.equal(mr.draft.by,'mixed');assert.equal(mr.draft.dropped,5);
 // check() on its own.
 const fx=[{id:'F1',kind:'task',date:'2026-06-01',text:'Закрыта задача GAME-9 «Логи»'}];
 assert.equal(check({results:[{text:'Закрыта задача GAME-9 за 2 дня',facts:['F1']}]},fx,'Олег Смирнов').sections.results,null);
 assert.deepEqual(check({results:[{text:'Олег закрыл задачу про логи',facts:['F1']}]},fx,'Олег Смирнов').sections.results,[{text:'Олег закрыл задачу про логи',facts:['F1']}],'the person\'s own name is fine');
 assert.deepEqual(rules([]),{results:[],engineering:[],collaboration:[]});

 // --- Gaps and failures --------------------------------------------------------------------------------------------
 const broken=fixture({jira:null,github,memory:[]});
 const b=(await app.turn(broken.s,'подготовь перформанс-ревью Олега')).extensionData.perfReviewCard;
 assert.deepEqual(b.facts.map(x=>x.kind),['pr','review','pr']);
 assert.deepEqual(b.gaps,['нет данных из Jira: HTTP 500','нет данных о встречах: сводок встреч за период нет','нет данных о встречах 1:1: за период нет сохранённых итогов 1:1']);
 const noLogin=fixture({jira,github,memory,team:[{...TEAM[0],accounts:{}},TEAM[1]]});
 const nl=(await app.turn(noLogin.s,'подготовь перформанс-ревью Олега')).extensionData.perfReviewCard;
 assert.ok(nl.gaps.includes('нет данных о PR и код-ревью: в карточке «Команды» нет логина GitHub'));
 assert.equal(nl.draft.sections[1].items.length,0);
 const quiet=fixture({jira:(route,body)=>({issues:[]}),github:()=>({items:[]}),memory:[]});
 const qc=(await app.turn(quiet.s,'подготовь перформанс-ревью Олега')).extensionData.perfReviewCard;
 assert.deepEqual(qc.gaps.slice(0,2),['нет данных о задачах Jira: за период нет закрытых задач на этом аккаунте','нет данных об инцидентах: в Jira за период нет задач-инцидентов этого человека, а мониторинг не хранит, кто их разбирал']);
 // Nothing connected and nothing found: a question, not an invented review.
 const none=fixture({settings:{module_jira:'false',githubToken:''},memory:[]});
 const n=await app.turn(none.s,'подготовь перформанс-ревью Олега');
 assert.equal(n.question,true);assert.match(n.text,/нет ни одного факта/);assert.equal(n.extensionData,undefined);
 assert.equal(facts.INCIDENT.test('Post-mortem'),true);
 console.log('Perf review: routing and near-misses, people asked, facts from Jira/GitHub/meetings/1:1 with sources, rules and checked model drafts, gaps stated, failures apart, nothing invented passed');
})().catch(e=>{console.error(e);process.exit(1);});
