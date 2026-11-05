const fs=require('node:fs/promises');
const path=require('node:path');
module.exports={
  id:'files',
  describe(message){
    return (message.attachments||[]).map(file=>({key:file.id,file,title:file.name||'Файл',
      subtitle:file.localSourcePath||file.note||'Вложение чата',
      actions:[{id:'open',label:'Открыть'},...(file.localSourcePath?[{id:'reveal',label:'Показать в папке'},{id:'edit',label:'Изменить'}]:[])]}));
  },
  async perform(action,row,s,check){
    check();
    if(action==='open')return {attachment:row.file};
    if(action!=='reveal')throw Error('Неизвестное действие файла.');
    const file=row.file.localSourcePath;
    if(!path.isAbsolute(file)||file.startsWith('\\\\'))throw Error('Исходный путь недоступен.');
    try{if(await fs.realpath(file)!==file||!(await fs.stat(file)).isFile())throw Error();}
    catch{throw Error('Исходный файл перемещён или удалён. Прикрепите его заново.');}
    check();require('electron').shell.showItemInFolder(file);
    return {handled:true,text:'Показал файл в папке.'};
  }
};
