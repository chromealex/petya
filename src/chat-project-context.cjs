function snapshot({dialogue,projectMemory,settings,slackAccount,attachments=[]}){
 const group=dialogue.state.projects.find(p=>p.id===dialogue.state.activeProjectId),topic=dialogue.active();
 const linked=projectMemory.get(group?.memoryId),effective=projectMemory.get(topic?.projectMemoryId)||(!topic?linked:null);
 const allowed=String(settings.jiraProjects||settings.jiraProject||'').split(/[\s,;]+/).filter(Boolean);
 const jira=effective?.jira?.site===settings.jiraUrl&&allowed.includes(effective.jira.key)?effective.jira.key:'';
 const channels=Object.values(effective?.slack||{}).filter(c=>c.account===slackAccount).map(c=>({name:c.name,role:c.role}));
 const disabled=group?.disabledServices||[];
 return {folders:require('./project-folders.cjs').projectFolders(group),context:group?.context||'',disabledServices:disabled,folder:group?.id==='general'?'':group?.folder||'',projectId:group?.id,projectName:group?.name,memoryId:group?.memoryId||'',linkedName:linked?.name||'',effectiveName:effective?.name||'',choices:projectMemory.state.projects.map(p=>({id:p.id,name:p.name})),jira:disabled.includes('jira')?'':topic?.jiraProject&&allowed.includes(topic.jiraProject)?topic.jiraProject:jira,channels:disabled.includes('slack')?[]:channels,files:[...(topic?.attachments||[]).map(a=>({name:a.name,scope:'chat'})),...attachments.map(a=>({name:a.name,scope:'draft'}))],usesCompanyMaterials:true};
}
module.exports={snapshot};
