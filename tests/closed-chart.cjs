// «Покажи график по закрытым задачам» draws closed issues per week or day in the chat from Jira.
const assert=require('node:assert/strict');const r=require('../src/extensions/jira/chat-reply.cjs');
for(const t of ['Покажи график по закрытым задачам','график закрытых багов за месяц','Динамика выполненных задач по неделям'])assert.ok(r.closedChart(t),t);
for(const t of ['не показывай график закрытых задач','Какие баги открыты?','Создай задачу и закрой её'])assert.ok(!r.closedChart(t),t);
(async()=>{
 const now=Date.parse('2026-11-07T12:00:00Z');let asked;
 const page=async path=>{asked=decodeURIComponent(path);return {issues:[{id:'1',fields:{resolutiondate:'2026-11-06T10:00:00Z'}},{id:'2',fields:{resolutiondate:'2026-11-04T10:00:00Z'}},{id:'2',fields:{resolutiondate:'2026-11-04T10:00:00Z'}}],isLast:true};};
 const week=await r.closed('Покажи график по закрытым задачам за неделю',{projects:['BW'],searchPage:page},now);
 assert.match(asked.replace(/\+/g," "),/statusCategory = Done/);assert.match(asked.replace(/\+/g,' '),/resolved >= -7d/);
 assert.match(week[0].text,/по дням/);assert.match(week[0].text,/Всего: 2/);assert.equal(week[1].type,'image');
 const mine=await r.closed('график моих закрытых багов',{projects:['BW'],searchPage:page},now);
 assert.match(asked.replace(/\+/g,' '),/assignee = currentUser\(\)/);assert.match(asked.replace(/\+/g,' '),/issuetype = Bug/);assert.match(mine[0].text,/по неделям/);
 console.log('closed chart: closed issues per day and week, mine and bugs passed');
})().catch(e=>{console.error(e);process.exit(1);});
