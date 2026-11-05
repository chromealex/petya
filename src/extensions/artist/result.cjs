module.exports={
  id:'artist',
  describe(message){
    if(!message.generatedImage)return [];
    return [{key:[message.id,message.at,message.text],title:'Изображение',subtitle:String(message.text||'Результат генерации').slice(0,180),
      actions:[{id:'details',label:'Посмотреть и сохранить'}]}];
  }
};
