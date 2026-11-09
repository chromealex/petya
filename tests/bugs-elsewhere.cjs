const assert=require('node:assert/strict');const {JiraInsights}=require('../src/extensions/jira/insights.cjs');
(async()=>{
 const queries=[];let all=[];
 const w={settings:()=>({jiraUrl:'https://fixture.invalid',jiraProjects:'BW',jiraToken:'token'}),pages:async()=>[{key:'BW',name:'Bunker Wars'}],
  api:async(route,o)=>{
   if(route.endsWith('/versions'))return [{id:'119',name:'1.19.0',released:true,releaseDate:'2026-10-01'},{id:'118',name:'1.18.0',released:true,releaseDate:'2026-09-01'}];
   if(route.endsWith('/project/BW'))return {issueTypes:[{id:'1',name:'Bug'}]};
   if(route.endsWith('/search/jql')){const {jql}=JSON.parse(o.body);queries.push(jql);
    if(/affectedVersion/.test(jql))return {isLast:true,issues:[]};
    return {isLast:true,issues:all};}
   throw Error('Unexpected read '+route);}};
 const reader=new JiraInsights(w);
 all=[{key:'BW-10',fields:{summary:'Краш на старте',status:{name:'Open'}}},{key:'BW-11',fields:{summary:'Не грузится карта',status:{name:'In Progress'}}}];
 let r=await reader.read('Какие баги открыты в BW?',{},'','bugs');
 assert.match(r.text,/версия 1\.19\.0: найдено 0 багов/);assert.match(r.text,/Всего открытых багов в Bunker Wars без привязки к версии — 2/);assert.match(r.text,/BW-10 — Краш на старте \(Open\)\nBW-11/);
 assert.equal(queries.length,2);assert.match(queries[1],/statusCategory != Done/);assert.doesNotMatch(queries[1],/Version/);
 all=[];queries.length=0;r=await reader.read('Какие баги открыты в BW?',{},'','bugs');assert.match(r.text,/нет и без привязки к версии/);
 console.log('Bugs elsewhere: no open bugs in the version → open bugs of the whole project with the latest ones listed passed');
})().catch(e=>{console.error(e);process.exit(1);});
