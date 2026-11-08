// UI tests: send a chat message and wait for the answer. Chat requests may run as background jobs,
// so submitChatCommand returns before Petya has answered; this waits for the job to finish.
module.exports=(win,timeout=20000)=>async command=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('submitChatCommand('+JSON.stringify(command)+')');
 const until=Date.now()+timeout;
 while(Date.now()<until&&await js('!!(window.chatStartPending||window.chatJobBusy?.(topicSelect.value))'))await new Promise(r=>setTimeout(r,30));
 await new Promise(r=>setTimeout(r,150));
};
