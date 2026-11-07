const assert=require('node:assert/strict');
const approve=require('../src/extensions/unity/approval.cjs');
function fixture(){const topic={id:'t',projectId:'p',messages:[]},project={id:'p'},s={companyId:'c',settings:{module_unity:'true',unityUrl:'http://localhost:8080/mcp',unityToken:''},dialogue:{active:()=>topic,state:{projects:[project]}}};let calls=0;const offer=()=>{try{approve(s,'Исследуй баг',()=>{calls++;return {text:'Продолжаю исходный запрос'};});}catch(e){assert.equal(e.name,'InputRequired');return e;}};return {s,topic,project,offer,calls:()=>calls};}
{const f=fixture(),q=f.offer();assert.deepEqual(q.spec.options,['Разрешить','Отмена']);assert(q.spec.strictChoices);assert.equal(f.calls(),0);assert.equal(q.resume('Разрешить').text,'Продолжаю исходный запрос');assert.equal(f.calls(),1);assert.throws(()=>q.resume('Разрешить'));}
{const f=fixture(),q=f.offer();assert(q.resume('Отмена').cancelled);assert.equal(f.calls(),0);}
for(const change of [f=>f.s.companyId='other',f=>f.topic.versionIndex=2,f=>f.s.settings.unityUrl='http://localhost:8081/mcp',f=>f.project.disabledServices=['unity'],f=>f.topic.archived=true]){const f=fixture(),q=f.offer();change(f);assert.throws(()=>q.resume('Разрешить'),/устарело/);assert.equal(f.calls(),0);}
console.log('Unity chat approval: exact continuation, cancellation, duplicate clicks and stale scopes passed');
