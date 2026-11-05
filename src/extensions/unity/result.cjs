module.exports={
  id:'unity',
  describe(message,topic){
    const item=message.unitySelection;
    if(!item||item.project!==topic.projectId)return [];
    return [{key:[item.url,item.instance,item.guid],title:'Unity · '+item.path.split('/').at(-1),
      subtitle:[item.instance,item.path].filter(Boolean).join(' · '),
      actions:[{id:'open',label:'Открыть в Unity',command:'Открой в Unity'},
        {id:'rotate',label:'Повернуть',command:'Поверни вправо'},{id:'details',label:'Подробнее'}]}];
  }
};
