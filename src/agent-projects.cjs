const path = require('node:path');
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function matchProjects(text, projects) {
  const hay=' '+norm(text)+' ';
  return projects.filter(p=>[p.name,...(p.aliases||[])].some(n=>norm(n).length>=2&&hay.includes(' '+norm(n)+' ')));
}
async function chooseProject(command, context, projects, semantic) {
  const explicit=matchProjects(command,projects);
  if(explicit.length===1)return {...explicit[0],selectionReason:'Название или сокращение проекта найдено в команде',selectionEvidence:command.slice(0,500)};
  if(explicit.length>1)return null;
  const matches=matchProjects(context,projects);
  if(matches.length===1)return {...matches[0],selectionReason:'Название или сокращение проекта найдено в контексте',selectionEvidence:context.slice(0,500)};
  if(matches.length>1)return null;
  // Even a single installed project is not evidence that this task belongs to it.
  return semantic ? await semantic(command,context,projects) : null;
}
function folderProject(cwd) {return {id:cwd,cwd,name:path.basename(cwd),description:cwd};}
module.exports={chooseProject,matchProjects,folderProject};
