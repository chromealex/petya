module.exports=async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  await showDialogueReply({handled:true,text:'Куда отправить?',question:true,slackRequestChoices:[{id:'C1',label:'#alpha-dev'},{id:'C2',label:'#beta-dev'}]});
  if(dialogueChoices.querySelectorAll('button:not(.clarification-custom)').length!==2||!voiceReply)throw Error('Slack voice choices missing');
  await voiceTurn.dispatch('отмена',Date.now());
  if(voiceReply)throw Error('Slack voice clarification not consumed');
  await showDialogueReply({handled:true,text:'Отправил поручение',sources:[{title:'Поручение в Slack',url:'https://app.slack.com/archives/C1/p1234567890123456'}]});
  if(!dialogueMessages.querySelector('a[href="https://app.slack.com/archives/C1/p1234567890123456"]'))throw Error('Slack receipt link missing');
  voiceReply=null;voiceTurn.reset();
 })()`);
};
