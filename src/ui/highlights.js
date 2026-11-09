// «Важно»: select text in a message (or use the star in its hover row) to mark it as important.
// Marks are shown in the message, listed in a collapsible «Важное» panel above the chat, and go to the model.
(()=>{
 const api=(method,...args)=>window.petya.feature('highlights',method,...args);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const link=document.createElement('link');link.rel='stylesheet';link.href='highlights.css';document.head.append(link);
 let state={chat:[],project:[],projectName:''},loading=0;
 const panel=el('details',null,'important-panel');panel.hidden=true;
 function place(){const header=document.querySelector('.chat-sticky-header');if(header&&panel.parentElement!==header)header.append(panel);}
 function renderPanel(){
  window.petyaHighlightState={topicId:typeof topicSelect==='undefined'?'':topicSelect.value,items:[...state.chat,...state.project]};
  document.dispatchEvent(new CustomEvent('petya-highlights-changed',{detail:window.petyaHighlightState}));
  const items=[...state.chat,...state.project];panel.hidden=!items.length;place();
  const open=panel.open;panel.replaceChildren();panel.open=open;
  panel.append(el('summary','Важное · '+items.length));
  const list=el('ul',null,'important-list');
  const head=el('li',null,'important-head');head.append(el('span','Учитывается в ответах Пети. Нажмите на текст, чтобы найти его в чате.'));
  const clear=el('button','Убрать все','important-clear');clear.type='button';clear.onclick=()=>change(async()=>{let next=state;for(const h of items)next=await api('remove',topicSelect.value,h.id);return next;});
  if(items.length>1)head.append(clear);list.append(head);
  for(const h of items){const li=el('li',null,'important-item');
   const text=el('button',h.text,'important-text');text.type='button';text.title='Показать в чате';text.onclick=()=>{const node=Number.isInteger(h.messageIndex)&&dialogueMessages.querySelector('[data-message-index="'+h.messageIndex+'"]');if(node){node.scrollIntoView({block:'center',behavior:'smooth'});node.classList.add('important-flash');setTimeout(()=>node.classList.remove('important-flash'),1400);}};
   const scope=el('button',h.scope==='project'?'Проект':'Чат','important-scope');scope.type='button';scope.title=h.scope==='project'?'Учитывается во всех чатах проекта'+(state.projectName?' «'+state.projectName+'»':'')+'. Нажми, чтобы оставить только для этого чата':'Учитывается в этом чате. Нажми, чтобы учитывать во всём проекте';
   scope.onclick=()=>change(()=>api('update',topicSelect.value,h.id,{scope:h.scope==='project'?'chat':'project'}));
   const edit=el('button','✎','important-edit');edit.type='button';edit.title='Изменить';edit.setAttribute('aria-label','Изменить отметку');
   edit.onclick=()=>{const input=el('textarea',null,'important-input');input.value=h.text;input.rows=2;input.maxLength=1000;li.replaceChildren(input);input.focus();const done=save=>{if(save&&input.value.trim()&&input.value.trim()!==h.text)change(()=>api('update',topicSelect.value,h.id,{text:input.value}));else renderPanel();};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();done(true);}if(e.key==='Escape')done(false);};input.onblur=()=>done(true);};
   const remove=el('button','Убрать','important-remove');remove.type='button';remove.title='Убрать из важного';remove.setAttribute('aria-label','Убрать из важного: '+h.text.slice(0,60));remove.onclick=()=>change(()=>api('remove',topicSelect.value,h.id));
   li.append(text,scope,edit,remove);list.append(li);}
  panel.append(list);
 }
 function mark(){
  if(typeof dialogueMessages==='undefined')return;
  for(const old of dialogueMessages.querySelectorAll('mark.user-important'))old.replaceWith(...old.childNodes);
  const ranges=[];
  for(const article of dialogueMessages.querySelectorAll('article'))article.classList.remove('whole-message-important');
  for(const h of [...state.chat,...state.project]){
   if(h.wholeMessage&&h.topicId===topicSelect.value){const article=dialogueMessages.querySelector('[data-message-index="'+h.messageIndex+'"]');if(article?.dataset.messageText===h.text){article.classList.add('whole-message-important');continue;}}
   const needle=h.text.replace(/\s+/g,' ').trim();if(needle.length<2)continue;
   const articles=[...dialogueMessages.querySelectorAll('article')].filter(a=>h.topicId===topicSelect.value&&Number(a.dataset.messageIndex)===h.messageIndex);
   for(const article of articles){const content=article.querySelector('.message-content');if(!content)continue;
    const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),positions=[];let text='',part;
    while((part=walker.nextNode()))for(let i=0;i<part.nodeValue.length;i++){const char=/\s/.test(part.nodeValue[i])?' ':part.nodeValue[i];if(char===' '&&text.endsWith(' '))continue;text+=char;positions.push({node:part,offset:i});}
    const at=text.indexOf(needle);if(at<0)continue;const start=positions[at],end=positions[at+needle.length-1],range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset+1);ranges.push(range);
   }
  }
  if(window.CSS?.highlights){CSS.highlights.delete('petya-important');if(ranges.length)CSS.highlights.set('petya-important',new Highlight(...ranges));}

  for(const star of dialogueMessages.querySelectorAll('.important-star')){const text=star.closest('article')?.dataset.messageText||'';star.classList.toggle('on',[...state.chat,...state.project].some(h=>h.text===text||h.text===text.replace(/\s+/g,' ').trim().slice(0,1000)));}
 }
 async function refresh(){const epoch=++loading,id=typeof topicSelect!=='undefined'?topicSelect.value:'';if(!id){state={chat:[],project:[],projectName:''};renderPanel();return;}try{const next=await api('list',id);if(epoch!==loading)return;state=next;}catch{state={chat:[],project:[],projectName:''};}renderPanel();mark();}
 async function change(work){const owner=topicSelect.value;++loading;try{const next=await work();if(topicSelect.value!==owner)return;state=next;renderPanel();panel.open=true;mark();}catch(e){notice(e.message,true);}}
 // Whole message: a star in the hover row.
 function install(){const original=window.renderMessage;if(typeof original!=='function'||original.highlights)return;
  const wrapped=function(message){const node=original(message);const meta=node.querySelector('.message-meta');if(meta&&message?.text){const star=el('button','☆','message-copy important-star');star.type='button';star.title='Отметить сообщение как важное';star.setAttribute('aria-label',star.title);star.onclick=()=>{const index=Number(node.dataset.messageIndex);
   // The star toggles: a marked message is unmarked.
   const whole=String(message.text).replace(/\s+/g,' ').trim().slice(0,1000),marked=[...state.chat,...state.project].find(h=>h.text===message.text||h.text===whole);if(marked)return change(()=>api('remove',topicSelect.value,marked.id));
   change(()=>api('add',topicSelect.value,{text:message.text,wholeMessage:true,messageIndex:Number.isInteger(index)?index:null}));};meta.append(star);const menu=node.querySelector('.answer-menu-items');if(menu){const item=el('button','Отметить всё сообщение как важное','important-menu-action');item.type='button';const icon=el('span','☆','message-menu-icon');icon.setAttribute('aria-hidden','true');item.prepend(icon);item.onclick=()=>{node.querySelector('.message-actions-menu').open=false;star.click();};menu.append(item);}}return node;};
  wrapped.highlights=true;Object.assign(wrapped,Object.fromEntries(Object.entries(original)));window.renderMessage=wrapped;}
 // Part of a message: select it and press «Важно».
 const float=el('button','★ Важно','important-float');float.type='button';float.hidden=true;document.body.append(float);
 let pick=null;
 document.addEventListener('mouseup',()=>setTimeout(()=>{const sel=window.getSelection();const text=sel?.toString().trim()||'';const anchor=(sel?.anchorNode?.nodeType===1?sel.anchorNode:sel?.anchorNode?.parentElement)?.closest?.('.message-content');
  if(!text||text.length<2||!anchor||!sel.focusNode||!anchor.contains(sel.focusNode)){float.hidden=true;pick=null;return;}
  const rect=sel.getRangeAt(0).getBoundingClientRect(),article=anchor.closest('article');pick={text,index:Number(article?.dataset.messageIndex)};
  float.style.left=Math.max(8,Math.min(window.innerWidth-110,rect.left+rect.width/2-45))+'px';float.style.top=Math.max(8,rect.top-36)+'px';float.hidden=false;
  // Sit next to the «Создать задачу» selection button when it is shown.
  const other=document.querySelector('.selection-task:not([hidden])');if(other){other.append(float);other.style.left=Math.max(8,Math.min(innerWidth-other.offsetWidth-8,rect.left))+'px';}else if(float.parentElement!==document.body)document.body.append(float);},0));
 float.addEventListener('mousedown',e=>e.preventDefault());
 float.onclick=()=>{const p=pick;float.hidden=true;pick=null;if(!p)return;window.getSelection()?.removeAllRanges();change(()=>api('add',topicSelect.value,{text:p.text,messageIndex:Number.isInteger(p.index)?p.index:null}));};
 document.addEventListener('scroll',()=>{float.hidden=true;},true);
 // Keep marks and the panel in step with the chat.
 let timer=null;const later=()=>{clearTimeout(timer);timer=setTimeout(refresh,120);};
 document.addEventListener('petya-topic-changed',later);
 const start=()=>{install();place();if(typeof dialogueMessages!=='undefined')new MutationObserver(m=>{if(m.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.classList?.contains('user-important'))))later();}).observe(dialogueMessages,{childList:true});refresh();};
 if(document.readyState==='complete')start();else window.addEventListener('load',start);
})();
