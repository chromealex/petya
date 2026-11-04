module.exports=async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  const card=document.querySelector('[data-service="slack"]'),status=card.querySelector('.connection-status'),help=card.querySelector('.slack-shortcuts');
  const original={text:status.textContent,classes:status.className};
  try{
   for(const [message,classes,visible] of [
    ['Slack: missing_scope','connection-status error',true],
    ['Slack временно ограничил запросы (HTTP 429). Повторите через 30 с.','connection-status error',false],
    ['Подключено','connection-status connected',false]
   ]){
    status.textContent=message;status.className=classes;
    await new Promise(resolve=>setTimeout(resolve,0));
    if(help.hidden===visible)throw Error('Incorrect Slack permission help for '+message);
   }
  }finally{status.textContent=original.text;status.className=original.classes;}
 })()`);
};
