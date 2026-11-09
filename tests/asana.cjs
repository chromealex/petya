const assert=require('node:assert/strict');const {Asana}=require('../src/extensions/asana/asana.cjs');
(async()=>{
 let s={asanaCredential:'secret',asanaWorkspace:'1'},writes=0,modified='old';
 const task=()=>({gid:'3',name:'Before',notes:'Text',due_on:null,completed:false,modified_at:modified,workspace:{gid:'1'},projects:[{gid:'2'}]});
 const a=new Asana({settings:()=>s,request:async(url,o={})=>{
  assert.ok(url.startsWith('https://app.asana.com/api/1.0/'));
  if(o.method){writes++;const b=JSON.parse(o.body).data;assert.equal(b.name,'After');assert.equal(b.secret,undefined);return {data:{gid:'3'}};}
  if(url.includes('/projects/2?'))return {data:{gid:'2',name:'Project',workspace:{gid:'1'}}};
  if(url.includes('/tasks/3?'))return {data:task()};
  return {data:[],next_page:{offset:'next'}};
 }});
 const input={project:'2',task:'3',name:'After',notes:'New',due_on:null,completed:false};
 const p=await a.preview(input);assert.equal(writes,0);modified='new';await assert.rejects(a.apply(p.id),/изменилась/);assert.equal(writes,0);
 const q=await a.preview(input);const results=await Promise.allSettled([a.apply(q.id),a.apply(q.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes,1);
 const r=await a.preview(input);s={...s,asanaCredential:'different'};await assert.rejects(a.apply(r.id),/изменилось/);assert.equal(writes,1);
 await assert.rejects(a.preview({...input,project:'../../evil'}));
 await assert.rejects(a.preview({...input,due_on:'2026-02-30'}));
 const page=await a.projects();assert.equal(page.next,'next');
 const c=await a.preview({...input,task:null});await a.apply(c.id);assert.equal(writes,2);
 const originalProjects=a.projects.bind(a);
 a.projects=async()=>({items:[{gid:'2',name:'Project'},{gid:'4',name:'Other'}],next:null});
 const compose=async()=>({summary:'After',description:'New',questions:[]});
 const ambiguous=await a.prepareVoice('создай задачу',{text:'Новый экран'},compose);assert.equal(ambiguous.ready,false);assert.equal(writes,2);
 const needed=await a.prepareVoice('создай задачу',{text:'Project'},async()=>({questions:['Что изменить?']}));assert.equal(needed.ready,false);assert.equal(writes,2);
 const auto=await a.prepareVoice('создай задачу в Asana',{text:'Project'},compose);assert.equal(auto.ready,true);await a.apply(auto.id);assert.equal(writes,3);
 await assert.rejects(a.apply(auto.id));assert.equal(writes,3);
 await assert.rejects(a.prepareVoice('создай задачу',{text:'Project'},compose,'999'));
 a.projects=async()=>({items:[],next:'same'});await assert.rejects(a.prepareVoice('создай задачу',{text:'Project'},compose),/повторила/);
 console.log('Asana preview, conflict, one-shot writes, session binding and validation passed');
})().catch(e=>{console.error(e);process.exit(1)});
