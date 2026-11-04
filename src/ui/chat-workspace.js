(() => {
  const el = (tag, text) => Object.assign(document.createElement(tag), {textContent:text || ''});
  function button(label, action, glyph = label) {
    const node = el('button', glyph);
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.onclick = async () => {
      node.disabled = true;
      try { await action(); } catch (error) { notice(error.message,true); }
      finally { node.disabled = false; }
    };
    return node;
  }
  function dialog(title) {
    const box = el('dialog');
    box.className = 'chat-utility-dialog';
    const head = el('div');
    head.className = 'chat-utility-head';
    head.append(el('h2',title),button('Закрыть',()=>box.close(),'×'));
    box.append(head);
    document.body.append(box);
    box.onclose = () => box.remove();
    box.showModal();
    return box;
  }
  const id = () => topicSelect.value;
  const heading = document.querySelector('.chat-heading');
  const versions = el('span');
  versions.className = 'chat-version-nav';
  const next = button('Следующий готовый ответ', async () => {
    const state = await window.petya.chatNavigation('');
    const target = unread(state)[0];
    if (!target) return refresh();
    await selectDialogueTopic(target.id);
    await window.petya.chatJobAcknowledge(target.id,target.job.at);
    await refresh();
  });
  function unread(state) {
    return state.topics.filter(t => t.id!==id() && !t.archived && t.job?.state==='done' && !t.job.acknowledged && !state.projects.find(p=>p.id===t.projectId)?.archived)
      .sort((a,b)=>a.job.at-b.job.at);
  }
  next.hidden=true;
  heading.append(versions,next);
  const prepared=el('div');prepared.className='prepared-question';prepared.hidden=true;
  document.querySelector('.chat-composer').prepend(prepared);
  function review(owner,text){
    prepared.hidden=!text;prepared.replaceChildren();
    if(!text)return;
    prepared.append(el('small','MCP подготовил вопрос'),el('p',text),button('Отправить Пете',async()=>{
      if(id()!==owner || $('command').value!==text)throw Error('Вопрос изменился. Проверьте поле ввода.');
      await window.sendChatNow();await window.petya.chatKeepPrepared(owner);schedule();
    }),button('Оставить в черновике',async()=>{await window.petya.chatKeepPrepared(owner);schedule();}));
  }
  async function compare(owner,version){
    const box=dialog('Сравнение версий'),select=el('select'),body=el('div');
    select.setAttribute('aria-label','Сравнить с версией');
    for(let i=0;i<version.count;i++)if(i!==version.index)select.add(new Option('Версия '+(i+1),i));
    select.value=String(version.index>0?version.index-1:1);
    box.append(el('p','Текущая версия '+(version.index+1)+' · сравнить с'),select,body);
    async function draw(){
      const other=Number(select.value);
      const [a,b]=await Promise.all([other,version.index].map(i=>window.petya.chatVersionMessages(owner,i)));
      if(other!==Number(select.value))return;
      body.replaceChildren();
      for(const [role,label] of [['user','Вопросы'],['assistant','Ответы']]){
        const paragraphs=messages=>messages.filter(m=>m.role===role).flatMap(m=>String(m.text).split(/\n+/).filter(Boolean));
        body.append(el('h3',label));let common;
        for(const row of chatParagraphDiff(paragraphs(a),paragraphs(b))){
          if(row.kind==='same'){
            if(!common){common=el('details');common.append(el('summary','Совпадающий текст'));body.append(common);}
            common.append(el('p',row.text));
          }else{common=null;const line=el('p',(row.kind==='added'?'+ ':'− ')+row.text);line.className='version-'+row.kind;body.append(line);}
        }
      }
    }
    select.onchange=()=>draw().catch(e=>notice(e.message,true));await draw();
  }
  let revision=0;
  async function refresh() {
    const ticket=++revision,owner=id();
    const [state,version]=await Promise.all([window.petya.chatNavigation(''),owner?window.petya.chatWorkspaceInfo(owner):null]);
    if(ticket!==revision || owner!==id())return;
    const count=unread(state).length;
    next.hidden=!count;
    next.textContent='Следующий ответ · '+count;
    review(owner,version?.preparedQuestion);
    versions.replaceChildren();
    if(!version || version.count<2)return;
    const choose=async index=>{
      await window.petya.chatVersionSelect(owner,index);
      quotes.delete(owner);
      await selectDialogueTopic(owner);
    };
    const prev=button('Предыдущая версия',()=>choose(version.index-1),'‹');
    const forward=button('Следующая версия',()=>choose(version.index+1),'›');
    prev.disabled=version.index===0;
    forward.disabled=version.index===version.count-1;
    versions.append(prev,el('span',(version.index+1)+' / '+version.count),forward,button('Сравнить',()=>compare(owner,version)));
  }
  let timer;
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>refresh().catch(e=>notice(e.message,true)),60);}
  document.addEventListener('petya-dialogue-state',schedule);
  document.addEventListener('petya-chat-job',e=>{if(['done','attention','cancelled'].includes(e.detail.job.state))schedule();});
  schedule();

  const quotes=new Map(), quoteBar=el('div');
  quoteBar.className='composer-quote';
  document.querySelector('.chat-composer').prepend(quoteBar);
  window.peekChatQuote=()=>quotes.get(id());
  function drawQuote(){
    const quote=quotes.get(id());
    document.dispatchEvent(new Event('petya-quote-changed'));
    quoteBar.hidden=!quote;
    quoteBar.replaceChildren();
    if(quote)quoteBar.append(el('span','В ответ на: '+quote.text),button('Убрать цитату',()=>{quotes.delete(id());drawQuote();},'×'));
  }
  window.takeChatQuote=()=>{const value=quotes.get(id());quotes.delete(id());drawQuote();return value;};
  document.addEventListener('petya-dialogue-state',drawQuote);
  drawQuote();
  async function regenerate(node){
    const index=Number(node.dataset.messageIndex);
    let user=index-1;
    while(user>=0 && chatHistory[user].role!=='user')user--;
    if(user<0)return;
    const result=await window.petya.chatVersionEdit(id(),user,chatHistory[user].text);
    await selectDialogueTopic(result.topicId);
    $('command').value=result.command;
    await window.sendChatNow();
  }
  const original=window.enhanceChatMessage;
  window.enhanceChatMessage=(node,message)=>{
    original?.(node,message);
    if(message.replyTo){
      const quote=el('blockquote',message.replyTo.text);
      quote.className='sent-quote';
      node.querySelector('.message-content').prepend(quote);
    }
    if(!message.at)return;
    const meta=node.querySelector('.message-meta');
    meta.append(button('Ответить на сообщение',()=>{
      const index=Number(node.dataset.messageIndex);
      if(!chatHistory[index])throw Error('Сообщение ещё сохраняется.');
      quotes.set(id(),{index,at:message.at,text:message.text});
      drawQuote();$('command').focus();
    },'↩'));
    if(message.role==='assistant')meta.append(button('Получить другой ответ',()=>regenerate(node),'↻'));
  };

  const voiceKey='petya-voice-policy',speedKey='petya-voice-speed';
  window.chatVoiceOff=()=>localStorage.getItem(voiceKey)==='off';
  window.shouldSpeakChat=spoken=>!window.chatVoiceOff() && (spoken || localStorage.getItem(voiceKey)==='always');
  window.chatSpeechRate=()=>Math.max(0.5,Math.min(2,Number(localStorage.getItem(speedKey))||1));
  const spoken=new Map();
  window.speakBackgroundAnswer=(owner,message)=>{
    if(owner!==id() || !window.shouldSpeakChat(false) || $('home').hidden || spoken.get(owner)===message.at)return;
    spoken.set(owner,message.at);
    speakReply(message.text);
  };
  const voice=button('Настройки озвучки',()=>{
    const box=dialog('Озвучка ответов'),mode=el('select'),speed=el('input'),rate=el('label');
    const label=el('label','Озвучивать');
    for(const [value,text] of [['voice','Только голосовые запросы'],['always','Все ответы'],['off','Выключена']])mode.add(new Option(text,value));
    mode.value=localStorage.getItem(voiceKey)||'voice';
    mode.onchange=()=>{localStorage.setItem(voiceKey,mode.value);if(mode.value==='off')stopSpeech.onclick();};
    speed.type='range';speed.min='0.5';speed.max='2';speed.step='0.1';speed.value=String(window.chatSpeechRate());
    const speedText=el('span');
    function updateSpeed(){const value=Number(speed.value);speedText.textContent='Скорость · '+value.toLocaleString('ru-RU')+'×';localStorage.setItem(speedKey,String(value));for(const audio of [replyAudioSource,streamingAudio])if(audio)audio.playbackRate=value;}
    speed.oninput=updateSpeed;updateSpeed();label.append(mode);rate.append(speedText,speed);box.append(label,rate);
  },'');
  voice.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
  voice.className='composer-voice-settings';
  document.querySelector('.mic-control')?.after(voice);

  const context=document.querySelector('.chat-project-context');
  const manage=button('Материалы чата',async()=>{
    const owner=id();if(!owner)throw Error('Сначала откройте чат.');
    const [state,materials]=await Promise.all([window.petya.chatWorkspaceInfo(owner),window.petya.contexts()]);
    const box=dialog('Использовать в следующих ответах');
    const rows=[...state.files.map(f=>({...f,type:'file'})),...materials.map(m=>({type:'material',id:m.id,name:m.title||m.source,enabled:!state.excluded.includes(m.id)}))];
    if(!rows.length)box.append(el('p','В этом чате пока нет материалов.'));
    for(const row of rows){
      const label=el('label');label.className='chat-material-check';
      const check=el('input');check.type='checkbox';check.checked=row.enabled;
      check.onchange=async()=>{check.disabled=true;try{await window.toggleChatMaterial(owner,row.type,row.id,check.checked,label,()=>check.checked=true);document.dispatchEvent(new Event('petya-context-updated'));}catch(e){check.checked=!check.checked;notice(e.message,true);}finally{check.disabled=false;}};
      label.append(check,el('span',row.name));box.append(label);
    }
  });
  context?.append(manage);
  // Capture the selection before clicking the action collapses the browser selection.
  let selected='';
  const task=button('Создать задачу',async()=>{
    if(!selected || currentDraft || draftBusy || commandProgress.busy)throw Error('Сначала завершите текущий черновик или запрос.');
    const text=selected;
    task.hidden=true;
    const material=await window.petya.addContext({source:'Заметка',title:text.slice(0,100),text});
    currentIntent='jira';automaticVoiceCommand=false;commandSnapshot='Создай задачу по выделенному тексту';voiceReply=null;
    await makeDraft(material, null, {reviewOnly:true});
  });
  task.className='selection-task';task.hidden=true;task.onpointerdown=e=>e.preventDefault();document.body.append(task);
  document.addEventListener('selectionchange',()=>{
    const selection=getSelection();
    const parent=selection?.anchorNode?.parentElement?.closest('.message-assistant .message-content');
    if(!parent || !parent.contains(selection.focusNode) || !selection.toString().trim()){task.hidden=true;return;}
    selected=selection.toString().trim().slice(0,12000);
    const rect=selection.getRangeAt(0).getBoundingClientRect();task.hidden=false;
    task.style.left=Math.max(8,Math.min(innerWidth-task.offsetWidth-8,rect.left))+'px';
    task.style.top=Math.max(8,rect.top-task.offsetHeight-5)+'px';
  });
  document.querySelector('.chat-feed').addEventListener('scroll',()=>task.hidden=true);
  showDialogueMessages(chatHistory);
})();
