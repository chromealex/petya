// Versioned user assertions, never assistant guesses. This does not edit the staff directory.
const normalize=s=>String(s||'').toLowerCase().replace(/ё/gu,'е').trim();
const rolePattern='(?:тестировщик(?:и)?|дизайнер(?:ы)?|разработчик(?:и)?|программист(?:ы)?|аналитик(?:и)?|менеджер(?:ы)?|QA|backend-разработчик|frontend-разработчик)';
function roleFacts(topic={}){
 const versions=[],current=new Map();let project='';
 for(const [source,m] of (topic.messages||[]).entries()){
  if(m.role!=='user'||typeof m.text!=='string')continue;
  const text=m.text;
  if(/[«»"“”]|цитат|если|допустим|представь|например|гипотет/iu.test(text))continue;
  const assertions=text.split(/(?<=[.!?])\s+|\n+/u).filter(s=>!s.trim().endsWith('?')&&!/^(?:кто|что|как|почему|скажи|назови|ответь|покажи)/iu.test(s.trim()));
  for(const assertion of assertions){
   const projects=[...assertion.matchAll(/проект[аеу]?\s+([\p{L}\d_-]+)/giu)];if(projects.length>1)continue;
   if(projects.length===1)project=normalize(projects[0][1]);
   const denied=new RegExp('([А-ЯЁA-Z][\\p{L}-]+)\\s+(?:больше\\s+|уже\\s+)?не\\s+('+rolePattern+')(?=$|[\\s,.;!])','gu');
   for(const m of assertion.matchAll(denied)){const key=project+'\0'+normalize(m[1]),previous=current.get(key);if(previous&&normalize(previous.role)===normalize(m[2])){const fact={name:previous.name,role:null,removedRole:previous.role,project,source,previousSource:previous.source};versions.push(fact);current.set(key,fact);}}
   if(/(?:^|\s)не(?=\s)/iu.test(assertion))continue;
   const re=new RegExp('([А-ЯЁA-Z][\\p{L}-]+(?:\\s+[А-ЯЁA-Z][\\p{L}-]+)?)\\s+(?:[—–-]\\s*|теперь\\s+)('+rolePattern+')(?=$|[\\s,.;!])','gu');
   for(const match of assertion.replace(/(?:в\s+)?проект[аеу]?\s+[\p{L}\d_-]+/giu,' ').matchAll(re)){
    const name=match[1],role=match[2],key=project+'\0'+normalize(name);
    const fact={name,role,project,source,previousSource:current.get(key)?.source??null};versions.push(fact);current.set(key,fact);
   }
  }
 }
 return {current:[...current.values()],versions};
}
function roleFactReply(command,topic={}){
 const original=String(command).trim();const suffix=/(?:^|[.!]\s+)(Кто[^.!]*(?:[?!.])?(?:\s*Ответь только именем[.!]?)?)$/iu.exec(original)?.[1];
 if(suffix&&suffix!==original){if(topic.messages?.at(-1)?.role!=='user'||topic.messages.at(-1).text!==command)return null;command=suffix;}

 const match=new RegExp('^Кто\\s+('+rolePattern+')(?:\\s+(?:в (?:описанной мной|нашей|этой|учебной) команде|у нас|в проекте [\\p{L}\\d_-]+))?[?!.]?(?:\\s*Ответь только именем[.!]?)?$','iu').exec(String(command).trim());
 if(!match)return null;
 const state=roleFacts(topic),project=/в проекте\s+([\p{L}\d_-]+)/iu.exec(command)?.[1];
 let rows=state.current;if(project)rows=rows.filter(f=>f.project===normalize(project));
 else if(new Set(rows.map(f=>f.project)).size>1)return 'Уточни проект: роли в разных проектах могут отличаться.';
 const found=rows.filter(f=>normalize(f.role)===normalize(match[1]));
 if(!found.length)return rows.some(f=>f.role===null)?'После поправки нет подтверждённого назначения на эту роль. Уточни, кто теперь её выполняет.':null;
 const names=[...new Set(found.map(f=>f.name))];
 if(names.length>1)return 'В описанной команде несколько сотрудников с этой ролью: '+names.join(', ')+'. Уточни, кто нужен.';
 return /только именем/iu.test(command)?names[0]:'По последнему описанию команды: '+names[0]+' — '+found[0].role+'.';
}
module.exports={roleFacts,roleFactReply};
