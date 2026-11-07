// Navigate the complete loaded history without rendering every message at once.
(()=>{
 const shell=document.querySelector('.chat-shell'),feed=shell.querySelector('.chat-feed');
 const rail=document.createElement('nav'),preview=document.createElement('div');
 rail.className='chat-timeline';rail.setAttribute('aria-label','Навигация по сообщениям');
 preview.className='chat-timeline-preview';preview.id='chat-timeline-preview';preview.hidden=true;preview.setAttribute('role','tooltip');
 shell.append(rail);document.body.append(preview);
 let marks=[],frame=0,hovered=null,lastCurrent=null;
 // Labels and previews show readable text, not raw Markdown.
 const plain=text=>String(text||'').replace(/```[\s\S]*?(```|$)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`#>|]+/g,'').replace(/^\s*(?:[-+]|\d+\.)\s+/gm,'').replace(/\s+/g,' ').trim();
 const important=new Set();
 function highlights(){
  important.clear();const state=window.petyaHighlightState;
  if(state?.topicId===topicSelect.value)for(const h of state.items){
   if(h.topicId!==topicSelect.value)continue;
   const i=h.messageIndex,text=chatHistory[i]?.text?.replace(/\s+/g,' ').trim()||'';
   if(Number.isInteger(i)&&text.includes(h.text.replace(/\s+/g,' ').trim()))important.add(i);
  }
  for(const b of marks){const active=important.has(Number(b.dataset.index));b.classList.toggle('important',active);b.setAttribute('aria-label',(active?'Важное. ':'')+b.dataset.label);}
 }
 function fade(){rail.classList.toggle('fade-top',rail.scrollTop>1);rail.classList.toggle('fade-bottom',rail.scrollTop+rail.clientHeight<rail.scrollHeight-1);}
 function hide(){preview.hidden=true;hovered?.removeAttribute('aria-describedby');hovered=null;}
 function show(button,index){
  hide();hovered=button;const message=chatHistory[index];if(!message)return;
  const title=document.createElement('strong'),body=document.createElement('span');
  title.textContent=(important.has(index)?'★ Важное · ':'')+(message.role==='user'?'Вы':'Петя');body.textContent=plain(message.text)||'Вложение';
  preview.replaceChildren(title,body);preview.hidden=false;button.setAttribute('aria-describedby',preview.id);
  const rect=button.getBoundingClientRect();preview.style.left=Math.min(rect.right+12,innerWidth-preview.offsetWidth-8)+'px';
  preview.style.top=Math.max(8,Math.min(rect.top-preview.offsetHeight/2,innerHeight-preview.offsetHeight-8))+'px';
 }
 function position(){
  frame=0;const top=feed.getBoundingClientRect().top+(shell.querySelector('.chat-sticky-header')?.offsetHeight||0)+24;
  let nearest=null,distance=Infinity;
  for(const node of dialogueMessages.querySelectorAll('[data-message-index]')){
   const d=Math.abs(node.getBoundingClientRect().top-top);if(d<distance){distance=d;nearest=Number(node.dataset.messageIndex);}
  }
  const current=marks.filter(b=>Number(b.dataset.index)<=nearest).at(-1);
  if(current&&current!==lastCurrent){lastCurrent=current;const y=current.offsetTop;if(y<rail.scrollTop)rail.scrollTop=y;else if(y+current.offsetHeight>rail.scrollTop+rail.clientHeight)rail.scrollTop=y+current.offsetHeight-rail.clientHeight;fade();}
  for(const b of marks){const active=b===current;b.classList.toggle('current',active);if(active)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');b.tabIndex=active?0:-1;}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(position);}
 function draw(){
  hide();rail.replaceChildren();marks=[];
  // The rail lives in the gutter left of the 800px message column; in a narrow chat, inset the feed so the rail never covers text.
  rail.hidden=chatHistory.length<2;shell.classList.toggle('timeline-inset',!rail.hidden&&shell.clientWidth<900);
  // Keep one mark per message; the rail has its own scroll viewport.
  const stride=1;
  for(let index=0;index<chatHistory.length;index+=stride){
   const b=document.createElement('button');b.type='button';b.dataset.index=index;b.className=chatHistory[index].role==='user'?'user':'';
   b.dataset.label='Сообщение '+(index+1)+': '+(plain(chatHistory[index].text)||'Вложение').slice(0,100);b.setAttribute('aria-label',b.dataset.label);
   b.onpointerenter=()=>show(b,index);b.onpointerleave=hide;b.onfocus=()=>show(b,index);b.onblur=hide;
   b.onclick=async()=>{hide();try{await window.jumpToChatMessage(index);schedule();}catch(e){notice(e.message,true);}};
   rail.append(b);marks.push(b);
  }
  highlights();fade();schedule();
 }
 rail.addEventListener('scroll',()=>{hide();fade();},{passive:true});
 document.addEventListener('petya-highlights-changed',highlights);
 rail.addEventListener('keydown',event=>{const index=marks.indexOf(document.activeElement);if(index<0)return;const next=event.key==='ArrowDown'?index+1:event.key==='ArrowUp'?index-1:event.key==='Home'?0:event.key==='End'?marks.length-1:-1;if(next>=0&&next<marks.length){event.preventDefault();marks[next].focus();}});
 feed.addEventListener('scroll',()=>{hide();schedule();},{passive:true});
 document.addEventListener('petya-results-changed',draw);document.addEventListener('petya-chat-opened',draw);
 document.addEventListener('petya-history-prepended',schedule);document.addEventListener('petya-topic-changed',hide);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 new ResizeObserver(draw).observe(shell);draw();
})();
