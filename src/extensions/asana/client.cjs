// Asana calls of the plugin: my open tasks and quick edits (done / due date) of one task.
const {Asana}=require('../../asana.cjs');
const FIELDS='name,notes,completed,due_on,permalink_url,projects.name,workspace.gid,modified_at';
const gid=v=>{if(typeof v!=='string'||!/^\d{1,40}$/.test(v))throw Error('Некорректный ID Asana.');return v;};
const client=s=>new Asana({settings:()=>s.settings,request:s.request});
const item=t=>({gid:t.gid,name:String(t.name||'').slice(0,300),completed:!!t.completed,due:t.due_on||'',url:/^https:\/\/app\.asana\.com\//.test(t.permalink_url||'')?t.permalink_url:'',project:(t.projects||[]).map(p=>p.name).filter(Boolean)[0]||''});
async function mine(s){
  s.modules.assertEnabled(s.settings,'asana');
  const asana=client(s),session=asana.session();
  const q=new URLSearchParams({assignee:'me',workspace:session.workspace,completed_since:'now',limit:'50',opt_fields:FIELDS});
  const r=await asana.api('/tasks?'+q);asana.same(session);
  if(!Array.isArray(r.data))throw Error('Asana вернула некорректный список задач.');
  return r.data.map(item).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
}
async function task(s,id){s.modules.assertEnabled(s.settings,'asana');const t=await client(s).task(gid(id));return {...item(t),notes:String(t.notes||'').slice(0,20000)};}
async function update(s,id,data){
  s.modules.assertEnabled(s.settings,'asana');const asana=client(s),session=asana.session();
  await asana.task(gid(id));asana.same(session);
  const r=await asana.api('/tasks/'+gid(id)+'?opt_fields='+FIELDS,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
  if(r?.data?.gid!==id)throw Error('Asana не подтвердила изменение.');return item(r.data);
}
module.exports={mine,task,update,item};
