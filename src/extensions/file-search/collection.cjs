// «Поиск файлов по смыслу» as an index collection (src/features/semantic-index.cjs): the files of the project
// folders (when «Папки проекта» is on) and of the folders added in the app settings.
const folders=require('./folders.cjs');
const {walk}=require('./walk.cjs');
const {extract}=require('./extract.cjs');

module.exports={
 id:'files',name:'Файлы',type:'text',refresh:30,
 description:'Файлы в папках проекта и в папках, добавленных в настройках «Поиска файлов по смыслу»',
 collects:'Текст файлов в выбранных папках: код, Markdown, текстовые файлы, PDF, Word, PowerPoint и Excel. Пропускаются node_modules, Library, папки сборки, скрытые папки, всё из .gitignore, ключи и файлы .env; похожий на пароли и токены текст заменяется на «[скрыто]».',
 // Ready when there is at least one folder to read.
 ready:settings=>folders.configured(settings),
 async list(s,{signal,gate}={}){
  const roots=folders.roots(s).map(r=>r.path);
  return walk(roots,{signal,gate});
 },
 async read(s,entry){
  // A file outside the current folders (settings changed meanwhile) is not read.
  if(!folders.inside(s,entry.id))return null;
  return extract(entry.id);
 }
};
