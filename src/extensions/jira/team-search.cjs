const {allowed}=require('./routing.cjs');
async function search(workspace,query){
 if(typeof query!=='string'||query.trim().length<2||query.length>200)throw Error('Введите хотя бы две буквы имени.');
 const s={...workspace.settings()};if(s.module_jira==='false')throw Error('Включите Jira в настройках.');const projects=allowed(s);if(!projects.length)throw Error('Выберите доступные проекты Jira в настройках.');
 const signature=v=>JSON.stringify([v.jiraUrl,v.jiraEmail,v.jiraToken,v.atlassianCredential,v.jiraProjects,v.jiraProject,v.module_jira]);const found=new Map();
 for(const project of projects){const rows=await workspace.people(query.trim(),{...s,jiraProject:project});if(signature(s)!==signature(workspace.settings()))throw Error('Подключение Jira изменилось. Повторите поиск.');for(const person of rows){if(!found.has(person.id))found.set(person.id,{...person,projects:[]});found.get(person.id).projects.push(project);}}
 return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru')).slice(0,50);
}
module.exports={search};
