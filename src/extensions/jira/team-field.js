// Jira on «Команда»: the «Jira» row under «В сервисах» of every person — find the person among the people of the
// allowed Jira projects and link them (the team keeps `jiraId`/`jiraName` and `accounts.jira`). Drawn by team.js
// through window.petyaTeamServices; loaded while Jira is added.
(()=>{
 if(!window.petyaTeamServices)return;
 window.petyaTeamServices.register('jira',{title:'Jira',order:10,
  // Older cards keep the link only in their Jira fields: show it in the row too.
  init({field,read,write}){const next=read();if(field('jiraId')?.value&&!next.jira){next.jira={id:field('jiraId').value,...(field('jiraName').value?{name:field('jiraName').value}:{})};write(next);}},
  unlink({field}){if(field('jiraId'))field('jiraId').value='';if(field('jiraName'))field('jiraName').value='';},
  link(panel,open,{member,field,read,write,mark,paint,node}){
   const query=node('input');query.type='search';query.placeholder='Имя или фамилия в Jira';query.maxLength=200;query.setAttribute('aria-label','Найти человека в Jira');
   const find=node('button',null,'Найти');find.type='button';const message=node('p','small');message.setAttribute('role','status');const results=node('div','team-account-results');let revision=0;
   const bar=node('div','team-account-search');bar.append(query,find);panel.append(bar,message,results);
   open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){query.value=field('jiraName').value||field('name').value||member.name||'';query.focus();query.select();}};
   query.addEventListener('input',e=>{e.stopPropagation();revision++;results.replaceChildren();message.textContent='';});
   query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();find.click();}if(e.key==='Escape'){e.stopPropagation();panel.hidden=true;}});
   find.onclick=async()=>{const current=++revision;results.replaceChildren();if(query.value.trim().length<2){message.textContent='Введите хотя бы две буквы имени.';return;}find.disabled=true;message.textContent='Ищу людей в доступных проектах Jira…';
    try{const found=await window.petya.teamJiraSearch(query.value);if(current!==revision||!panel.isConnected)return;message.textContent=found.length?'Выберите человека:':'Никого не найдено. Попробуйте фамилию или написание имени в Jira.';
     for(const person of found){const choice=node('button',null,person.name+' · '+person.projects.join(', '));choice.type='button';choice.title=person.name+' · '+person.id;choice.dataset.noI18n='';
      choice.onclick=()=>{field('jiraId').value=person.id;field('jiraName').value=person.name;const next=read();next.jira={id:person.id,name:person.name};write(next);
       const local=field('name');if(!local.value.trim()){local.value=person.name;local.dispatchEvent(new Event('input',{bubbles:true}));}
       revision++;results.replaceChildren();message.textContent='';panel.hidden=true;mark();paint('jira');};results.append(choice);}
    }catch(e){if(current===revision)message.textContent=e.message;}finally{find.disabled=false;}};
  }});
})();
