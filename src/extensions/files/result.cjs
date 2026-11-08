const fs=require('node:fs/promises');
const path=require('node:path');
module.exports={
  id:'files',
  describe(message){
    return (message.attachments||[]).map(file=>({key:file.id,file,title:file.name||'Файл',
      subtitle:file.localSourcePath||file.note||'Вложение чата',
      // A file Petya made (src/features/office-files.cjs) opens in its own app and is not edited as text.
      actions:file.generated?[{id:'launch',label:'Открыть'},{id:'reveal',label:'Показать в папке'}]:[{id:'open',label:'Открыть'},...(file.localSourcePath?[{id:'reveal',label:'Показать в папке'},{id:'edit',label:'Изменить'}]:[])]}));
  },
  async perform(action,row,s,check){
    check();
    if(action==='open')return {attachment:row.file};
    if(action!=='reveal'&&!(action==='launch'&&row.file.generated))throw Error('Неизвестное действие файла.');
    const file=row.file.localSourcePath;
    if(!path.isAbsolute(file)||file.startsWith('\\\\'))throw Error('Исходный путь недоступен.');
    try{if(await fs.realpath(file)!==file||!(await fs.stat(file)).isFile())throw Error();}
    catch{throw Error('Исходный файл перемещён или удалён. Прикрепите его заново.');}
    check();
    if(action==='launch'){const error=await require('electron').shell.openPath(file);if(error)throw Error('Не удалось открыть файл: '+error);return {handled:true,text:'Открыл файл.'};}
    require('electron').shell.showItemInFolder(file);
    return {handled:true,text:'Показал файл в папке.'};
  }
};
