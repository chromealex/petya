function projectFolders(project,memory){
 if(!project||project.id==='general')return [];
 const values=Array.isArray(project.folders)?project.folders:Object.hasOwn(project,'folder')?[project.folder]:Array.isArray(memory?.localFolders)?memory.localFolders:[memory?.localFolder];
 return [...new Set(values.filter(p=>typeof p==='string'&&p.trim()))];
}
module.exports={projectFolders};
