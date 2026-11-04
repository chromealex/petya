// Pace presentation only: complete responses remain available in stored history.
(()=>{
 const active=new Set();let voice=null;
 window.answerPaceBusy=()=>active.size>0;
 window.pauseAnswerPace=()=>{const tasks=[...active].filter(t=>t.resumable);for(const task of [...active])task.stop();return tasks.length?()=>{for(const task of tasks)task.resume();}:null;};
 window.stopAnswerPace=()=>{for(const task of [...active])task.stop();};
 window.answerVoiceBegin=()=>{voice={offset:0,audio:null,length:0};};
 window.answerVoiceSegment=(audio,text)=>{if(!voice)window.answerVoiceBegin();voice.audio=audio;voice.length=text.length;};
 window.answerVoiceSegmentEnd=()=>{if(voice){voice.offset+=voice.length;voice.length=0;voice.audio=null;}};
 window.answerVoiceEnd=()=>{voice=null;};
 function voiceLimit(){if(!voice)return Infinity;const a=voice.audio;return voice.offset+(a&&Number.isFinite(a.duration)&&a.duration>0?voice.length*Math.min(1,a.currentTime/a.duration):0)+36;}
 window.createAnswerPace=(paint,{initial=0,spoken=false}={})=>{
  let target='',shown=initial,clock=performance.now(),timer,closed=false,last=-1;
  const task={update(text){target=String(text||'');shown=Math.min(shown,target.length);tick();},finish(){shown=target.length;paint(target);task.stop();},resume(){if(!task.resumable||!task.connected())return;closed=false;clock=performance.now();active.add(task);tick();},stop(){closed=true;clearTimeout(timer);active.delete(task);},get shown(){return Math.floor(shown);}};
  function tick(){clearTimeout(timer);if(closed)return;const now=performance.now(),delta=Math.min(200,now-clock);clock=now;shown=Math.min(target.length,shown+delta*.028,spoken?Math.max(shown,voiceLimit()):Infinity);const n=Math.floor(shown);if(n!==last){last=n;paint(target.slice(0,n));}timer=setTimeout(tick,60);}
  active.add(task);return task;
 };
 window.revealAnswer=(node,text,{spoken=false,initial=0}={})=>{
  if(!node||!text)return;const full=node.querySelector('.message-content');if(!full)return;
  node.classList.add('ui-enter');const preview=document.createElement('div');preview.className='message-content answer-paced';preview.setAttribute('aria-hidden','true');full.before(preview);full.hidden=true;
  const extras=[...node.children].filter(e=>e!==full&&e!==preview),skip=document.createElement('button');skip.type='button';skip.className='answer-show-all';skip.textContent='Показать целиком';extras.forEach(e=>e.hidden=true);node.append(skip);
  let task;const restore=()=>{full.hidden=false;preview.remove();skip.remove();extras.forEach(e=>e.hidden=false);task?.stop();};
  task=window.createAnswerPace(part=>{if(!node.isConnected){task.stop();return;}const feed=node.closest('.chat-feed'),follow=feed&&feed.scrollHeight-feed.clientHeight-feed.scrollTop<80;const rendered=window.renderMessage({role:'assistant',text:part});preview.replaceChildren(...rendered.querySelector('.message-content').childNodes);if(part.length===text.length)restore();if(follow)window.chatScrollToLatest?.();},{initial,spoken});task.resumable=true;task.connected=()=>node.isConnected&&full.hidden;skip.onclick=()=>task.finish();task.update(text);
 };
 document.addEventListener('petya-topic-changed',e=>{if(e.detail?.preserveScroll)return;for(const task of active)task.stop();window.answerVoiceEnd();});
})();
