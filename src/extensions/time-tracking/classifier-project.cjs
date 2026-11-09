// Activity classifier: the project a window belongs to, from how editors and tools title their windows — a repo or
// project path («~/Projects/petya», «C:\repos\Bunker»), Unity («Bunker - Main - Windows, Mac, Linux - Unity 6000…»),
// VS Code / Cursor («file — petya — Visual Studio Code»), JetBrains IDEs and Xcode («petya – tracker.cjs»),
// Visual Studio («Bunker - Microsoft Visual Studio»). Only the window title is read, never the files.
const PATH=/(?:^|[\s\[(:"'])(?:~|[A-Za-z]:|\/(?:Users|home)\/[^\/\s]+)?[\\/](?:[^\\/\s]+[\\/])*?(?:Projects|projects|Project|repos|Repos|repositories|src|dev|Dev|work|Work|code|Code|git|GitHub|github|workspace|Workspace|Developer|Проекты)[\\/]([\w.@-]{2,60})/;
const SEP=/\s+[-–—]\s+/;
const IDE=/^(?:visual studio code|code|cursor|windsurf|vscodium)$/i;
const JETBRAINS=/^(?:rider|intellij idea|pycharm|webstorm|clion|goland|phpstorm|rubymine|datagrip|android studio|fleet|xcode)$/i;
const clean=v=>String(v||'').replace(/^[●•*]\s*/,'').replace(/\s*\[[^\]]*\]\s*$/,'').trim().slice(0,60);
module.exports={
 id:'project',name:'Проекты из заголовков редакторов',order:20,
 classify({app,title}){
  const t=String(title||''),a=String(app||'').trim();
  if(!t)return null;
  const p=PATH.exec(t);if(p)return {project:clean(p[1])};
  const parts=t.split(SEP).map(x=>x.trim()).filter(Boolean);
  if(/^unity(?: editor)?$/i.test(a)||/(?:^|\s)Unity \d{4}/.test(parts.at(-1)||'')){
   if(parts.length>=2&&!/^unity hub$/i.test(parts[0]))return {project:clean(parts[0]),category:'work'};
   return null;
  }
  if(IDE.test(a)||/(?:Visual Studio Code|Cursor)$/.test(t)){
   const body=parts.filter(x=>!/^(?:Visual Studio Code|Cursor|Windsurf|VSCodium)(?:\s.*)?$/.test(x)&&!/^\[.*\]$/.test(x));
   const project=body.length>=2?body.at(-1):body[0];
   return project&&!/\.[a-z0-9]{1,5}$/i.test(project)?{project:clean(project),category:'work'}:null;
  }
  if(JETBRAINS.test(a)&&parts.length>=2)return {project:clean(parts[0]),category:'work'};
  if(/^visual studio$/i.test(a)||/Microsoft Visual Studio$/.test(t))return parts.length>=2?{project:clean(parts[0]),category:'work'}:null;
  return null;
 }
};
