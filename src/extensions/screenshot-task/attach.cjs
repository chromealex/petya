// «Скриншот → задача»: the picture goes into the task the tracker's own flow created. Petya's Jira and Asana flows
// create tasks from text only (their task-tracker providers hand a chat request to a preview with «Создать»), so
// the image is uploaded after that, to the created task, when the user presses «Прикрепить скриншот к KEY»:
//  - Jira Cloud: POST {site}/rest/api/3/issue/{key}/attachments, multipart field «file», header
//    X-Atlassian-Token: no-check (API token Basic auth, or Petya's Atlassian OAuth via the shared request).
//  - Asana: POST https://app.asana.com/api/1.0/attachments, multipart «parent» = task gid and «file»
//    (Petya's Asana OAuth via the shared request).
// The created task is recognised from the chat after the hand-off (Jira browse links and keys, Asana task links).
const fs=require('node:fs');

const JIRA_KEY=/^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const ASANA_GID=/^\d{1,40}$/;
const jiraReady=s=>!!s.settings.jiraUrl&&!!(s.settings.atlassianCredential||s.settings.jiraEmail&&s.settings.jiraToken)&&(!s.modules||s.modules.enabled(s.settings,'jira'));
const asanaReady=s=>!!s.settings.asanaCredential&&(!s.modules||s.modules.enabled(s.settings,'asana'));

// Tasks mentioned in the chat after `since`: [{provider:'jira'|'asana', key, url}], newest last.
function recent(messages,since,{jiraUrl=''}={}){
 const out=[];const site=(()=>{try{return new URL(jiraUrl).origin;}catch{return '';}})();
 const seen=new Set();const add=x=>{const k=x.provider+':'+x.key;if(seen.has(k))return;seen.add(k);out.push(x);};
 for(const m of messages||[]){
  if(m.role!=='assistant'||(m.at||0)<since)continue;
  const text=[m.text,...(m.sources||[]).map(x=>x.url),JSON.stringify(m.extensionData||{}),JSON.stringify(m.jiraItems||[])].join(' ');
  for(const hit of text.matchAll(/https:\/\/[\w.-]+\/browse\/([A-Z][A-Z0-9_]{0,19}-\d{1,9})/g))if(!site||hit[0].startsWith(site))add({provider:'jira',key:hit[1],url:hit[0]});
  for(const hit of text.matchAll(/https:\/\/app\.asana\.com\/0\/\d+\/(\d+)/g))add({provider:'asana',key:hit[1],url:hit[0]});
  // «Создал задачу PROJ-12» without a link.
  for(const hit of String(m.text||'').matchAll(/(?:создал\p{L}*|заведен\p{L}*|создан\p{L}*)[^.\n]{0,40}?\b([A-Z][A-Z0-9_]{0,19}-\d{1,9})\b/gu))add({provider:'jira',key:hit[1],url:site?site+'/browse/'+hit[1]:''});
 }
 return out;
}
// Key or link typed by the user → the key the API wants.
function parseTarget(provider,value){
 const v=String(value||'').trim();
 if(provider==='jira'){const m=v.match(/([A-Z][A-Z0-9_]{0,19}-\d{1,9})(?:[?#/]|$)/);if(!m||!JIRA_KEY.test(m[1]))throw Error('Укажите ключ задачи Jira, например PROJ-123, или ссылку на неё.');return m[1];}
 if(provider==='asana'){const m=v.match(/app\.asana\.com\/0\/\d+\/(\d+)/)||v.match(/^(\d{1,40})$/)||v.match(/\/task\/(\d+)/);if(!m||!ASANA_GID.test(m[1]))throw Error('Укажите ссылку на задачу Asana или её номер (gid).');return m[1];}
 throw Error('Прикрепить картинку можно к задаче Jira или Asana.');
}
// `type` is the file's media type: a PNG by default (≤ 20 MB); «Запись экрана → баг» uploads its video and log
// excerpt the same way (≤ 100 MB; Jira Cloud's own limit is set by the site admin, a refusal is reported as is).
async function upload(s,{provider,key,file,name,type='image/png'}){
 const bytes=fs.readFileSync(file);
 const image=/^image\//.test(type);
 if(image&&(!bytes.length||bytes.length>20*1024*1024))throw Error('Картинка пустая или больше 20 МБ.');
 if(!image&&(!bytes.length||bytes.length>100*1024*1024))throw Error('Файл пустой или больше 100 МБ.');
 const form=new FormData();
 if(provider==='jira'){
  if(!jiraReady(s))throw Error('Подключите Jira в настройках.');
  form.append('file',new Blob([bytes],{type}),name);
  const basic=!s.settings.atlassianCredential&&s.settings.jiraEmail&&s.settings.jiraToken?{Authorization:'Basic '+Buffer.from(s.settings.jiraEmail+':'+s.settings.jiraToken).toString('base64')}:{};
  const r=await s.request(s.settings.jiraUrl.replace(/\/+$/,'')+'/rest/api/3/issue/'+encodeURIComponent(key)+'/attachments',{method:'POST',headers:{...basic,'X-Atlassian-Token':'no-check'},body:form});
  const a=Array.isArray(r)?r[0]:null;
  if(!a?.id)throw Error('Jira не подтвердила вложение.');
  return {provider,key,name:a.filename||name,url:s.settings.jiraUrl.replace(/\/+$/,'')+'/browse/'+key};
 }
 if(provider==='asana'){
  if(!asanaReady(s))throw Error('Подключите Asana в настройках.');
  form.append('parent',key);form.append('file',new Blob([bytes],{type}),name);
  const r=await s.request('https://app.asana.com/api/1.0/attachments',{method:'POST',body:form});
  if(!r?.data?.gid)throw Error('Asana не подтвердила вложение.');
  return {provider,key,name:r.data.name||name,url:r.data.parent?.permalink_url||''};
 }
 throw Error('Прикрепить картинку можно к задаче Jira или Asana.');
}
const fileName=(id,window='')=>'screenshot-'+(String(window).replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,40)||'screen')+'-'+String(id).slice(0,8)+'.png';
module.exports={recent,parseTarget,upload,jiraReady,asanaReady,fileName,JIRA_KEY};
