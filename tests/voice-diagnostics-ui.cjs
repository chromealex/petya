module.exports=async win=>win.webContents.executeJavaScript(`(()=>{
 const wasActive=mic.active;
 try{view('home');mic.active=true;updateAudio();
  if(!micLevel.getClientRects().length||!$('heard').getClientRects().length)throw Error('Microphone diagnostics hidden by chat layout');
  mic.active=false;updateAudio();if(micLevel.getClientRects().length)throw Error('Inactive microphone diagnostics should be hidden');
 }finally{mic.active=wasActive;updateAudio();}
})()`);
