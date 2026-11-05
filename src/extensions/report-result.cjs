module.exports=id=>({
  id,
  describe(message,topic){
    const report=message.extensionResult;
    if(report?.provider!==id||report.project&&report.project!==(topic?.projectId||'general'))return [];
    return [{key:[id,report.query,report.source,report.selected],title:message.by||id,subtitle:report.source||'Отчёт',
      actions:[{id:'refresh',label:'Обновить',command:'Обнови отчёт'},{id:'details',label:'Подробнее'}]}];
  }
});
