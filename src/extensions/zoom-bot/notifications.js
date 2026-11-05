(()=>{
 function zoomBotProgress(state){if(!state)return;document.dispatchEvent(new CustomEvent('petya-voice-input-lock',{detail:{id:'zoom-bot',locked:state.meetingPresent||['joining','waiting','recording'].includes(state.phase)}}));if(state.phase==='idle')return;const actions=state.canJoin?[['Подключить Петю',()=>window.petya.feature('zoomBot','join',state.id)],['Пропустить',()=>window.petya.feature('zoomBot','dismiss',state.id)]]:state.canRetry?[['Повторить',()=>window.petya.feature('zoomBot','retry',state.id)]]:[];document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'zoom-bot:'+state.id,title:'Петя в Zoom',text:state.message,busy:state.busy,version:state.phase,kind:state.phase==='error'?'error':state.phase==='done'?'success':'info',actions}}));}
 window.petyaEvents.onZoomBot(zoomBotProgress);
 window.petya.feature('zoomBot','status').then(zoomBotProgress).catch(()=>{});
})();
