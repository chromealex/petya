// «Профайлер»: where captures come from — files attached to the chat (read from disk when they were picked there, so
// a large table is not cut at the attachment text limit), files attached earlier in this chat, and paths written in
// the request. Reading is bounded: a capture over 150 MB is refused with a hint to export a shorter range.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

const EXT=/\.(?:csv|tsv|json|txt|log|data|raw|trace|pftrace|perfetto-trace|snap)$/i;
const MAX=150*1024*1024;

function written(command){
 const out=[],text=String(command||''),ext='(?:csv|tsv|json|txt|log|data|raw|trace|pftrace|perfetto-trace|snap)';
 const re=new RegExp('«([^»]+?\\.'+ext+')»|"([^"]+?\\.'+ext+')"|`([^`]+?\\.'+ext+')`|((?:~|/|[A-Za-z]:\\\\)[^\\s"\'«»`]+?\\.'+ext+')(?=$|[\\s,;.!?)»])','giu');
 let m;while((m=re.exec(text)))out.push((m[1]||m[2]||m[3]||m[4]).trim());
 return [...new Set(out)].map(p=>p.startsWith('~')?path.join(os.homedir(),p.slice(1)):p);
}

// Composer attachments that look like captures: {id, name, path, text, truncated}.
function attached(s){
 let files=[];try{files=s.attachments?.list?.()||[];}catch{files=[];}
 return files.filter(f=>EXT.test(f.name||'')).map(f=>{const item=s.attachments.pending?.get?.(f.id)||{};
  return {id:f.id,name:f.name,path:item.localSourcePath||'',text:item.text||'',truncated:/первые \d+ символов/.test(item.note||'')};});
}
// Captures attached earlier in this chat (moved from the composer with the request that used them).
function earlier(s){
 const topic=s.dialogue?.active?.();
 return (topic?.attachments||[]).filter(f=>EXT.test(f.name||'')).map(f=>({id:f.id,name:f.name,path:f.localSourcePath||'',text:f.text||'',truncated:/первые \d+ символов/.test(f.note||''),earlier:true}));
}

// Full text of a file on disk, or the attachment text when there is no path.
async function read(file){
 if(file.path){
  const st=await fs.stat(file.path);
  if(!st.isFile())throw Error('«'+file.name+'» — не файл.');
  if(st.size>MAX)throw Error('«'+file.name+'» больше 150 МБ. Экспортируйте меньший диапазон кадров.');
  if(/\.(?:data|raw|trace|pftrace|perfetto-trace|snap)$/i.test(file.path))return {text:'',name:path.basename(file.path)};
  const raw=await fs.readFile(file.path);
  return {text:raw[0]===255&&raw[1]===254?raw.subarray(2).toString('utf16le'):raw.toString('utf8'),name:path.basename(file.path)};
 }
 return {text:file.text||'',name:file.name,truncated:file.truncated};
}

function projectRoots(s){
 try{
  const state=s.dialogue.state,topic=s.dialogue.active();
  const project=state.projects?.find(p=>p.id===(topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId));
 }catch{return [];}
}

// Moves used attachments from the composer into the chat, like other extensions do.
function adopt(s,used){
 if(!used.length)return;
 try{
  const rows=s.attachments.take(used.map(f=>f.id)),topic=s.dialogue.active();
  topic.attachments=[...(topic.attachments||[]),...rows.filter(f=>!topic.attachments?.some(old=>old.id===f.id))];
  const user=topic.messages.at(-2);if(user?.role==='user')user.attachments=rows.map(f=>s.attachments.info(f));
  for(const f of rows)s.attachments.remove(f.id);
  s.dialogue.persist();
 }catch{/* attachments stay in the composer */}
}

module.exports={written,attached,earlier,read,projectRoots,adopt,EXT,MAX};
