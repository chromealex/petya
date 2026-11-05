module.exports={
  id:'blender',
  describe(message){
    if(!message.motionMode)return [];
    const file=message.motionFile;
    return [{key:message.motionId,title:'Blender · '+(file?.name||'Анимация'),subtitle:file?'Исходный файл · '+file.name:'Выберите исходный файл в сообщении',
      actions:[{id:'details',label:'К превью'},...(file?[{id:'reveal',label:'Показать в папке'}]:[])]}];
  },
  async perform(action,row,s,check){
    if(action!=='reveal')throw Error('Неизвестное действие Blender.');
    await s.blenderMotion.reveal(row.message.motionFile.id,check);
    return {handled:true,text:'Показал исходный файл в папке.'};
  }
};
