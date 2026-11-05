(()=>{
  const composer=document.querySelector('.chat-composer');
  const bar=document.createElement('div');bar.className='chat-result-context';bar.hidden=true;
  const choose=document.createElement('button'),clear=document.createElement('button');
  choose.type=clear.type='button';choose.className='chat-result-current';clear.className='chat-result-clear';
  clear.textContent='×';clear.title='Сбросить выбранный объект';clear.setAttribute('aria-label',clear.title);
  bar.append(choose,clear);composer.prepend(bar);
  const picker=document.createElement('div');picker.className='chat-result-picker';picker.hidden=true;
  picker.setAttribute('aria-label','Выбор объекта');bar.after(picker);
  const status=document.createElement('p');status.className='small chat-result-status';status.hidden=true;status.setAttribute('role','status');picker.after(status);
  let state={items:[],selected:null},revision=0,pending=false,restricted=null;
  const call=(method,...args)=>window.petya.feature('chatResults',method,...args);
  function error(e){status.textContent=e.message;status.hidden=false;}
  function button(text,handler){
    const b=document.createElement('button');b.type='button';b.textContent=text;
    b.onclick=async()=>{if(pending)return;pending=true;b.disabled=true;status.hidden=true;
      try{await handler();}catch(e){error(e);}finally{pending=false;b.disabled=false;}};
    return b;
  }
  async function act(item,action){
    const expected=state.scope;
    const result=await call('action',expected,item.id,action.id);
    if(state.scope!==expected)return;
    picker.hidden=true;restricted=null;
    if(result.command)await processCommand(result.command);
    else if(result.attachment)await window.openChatAttachment(result.attachment,topicSelect.value);
    else if(Number.isInteger(result.resultJump))await window.jumpToChatMessage(result.resultJump);
    else if(result.text){status.textContent=result.text;status.hidden=false;}
    await refresh();
  }
  const choices=()=>[...new Map(state.items.map(item=>[item.objectId,item])).values()];
  function paintPicker(){
    picker.replaceChildren();
    for(const item of choices().filter(item=>!restricted||restricted.ids.includes(item.id)).slice().reverse()){
      const row=button(item.title,async()=>{
        const expected=state.scope,action=restricted?.action;
        await call('choose',expected,item.id);
        if(state.scope!==expected)return;
        if(action)await act(item,{id:action});else{picker.hidden=true;await refresh();}
      });
      row.title=item.subtitle;row.setAttribute('aria-pressed',String(item.id===state.selected));
      const sub=document.createElement('small');sub.textContent=item.subtitle;row.append(sub);picker.append(row);
    }
  }
  function paint(){
    const selected=state.items.find(item=>item.id===state.selected);
    bar.hidden=!state.items.length;clear.hidden=!selected;
    choose.textContent=selected?selected.title:'Выбрать объект · '+choices().length;
    choose.title=selected?.subtitle||'Выбрать результат из этого чата';
    paintPicker();
    document.querySelectorAll('.chat-result-card').forEach(card=>card.remove());
    for(const item of state.items){
      const message=document.querySelector('.chat-messages [data-message-index="'+item.index+'"]')||
        dialogueMessages.querySelector('[data-message-index="'+item.index+'"]');
      if(!message)continue;
      const card=document.createElement('section');card.className='chat-result-card';
      card.classList.toggle('selected',item.id===state.selected);
      const title=button(item.title,async()=>{await call('choose',state.scope,item.id);await refresh();});
      title.className='chat-result-title';title.setAttribute('aria-pressed',String(item.id===state.selected));
      const detail=document.createElement('small');detail.textContent=item.subtitle;
      const actions=document.createElement('div');actions.className='actions';
      for(const action of item.actions)actions.append(button(action.label,()=>act(item,action)));
      card.append(title,detail,actions);message.append(card);
    }
  }
  async function refresh(){
    const request=++revision;
    try{
      const next=await call('snapshot');
      if(request!==revision)return;
      if(next.scope!==state.scope){picker.hidden=true;restricted=null;status.hidden=true;}
      state=next;paint();
    }catch(e){if(request===revision)error(e);}
  }
  choose.onclick=()=>{restricted=null;paintPicker();picker.hidden=!picker.hidden;};
  clear.onclick=async()=>{if(pending)return;pending=true;try{await call('choose',state.scope,null);picker.hidden=true;await refresh();}catch(e){error(e);}finally{pending=false;}};
  document.addEventListener('petya-topic-changed',()=>{revision++;bar.hidden=picker.hidden=status.hidden=true;state={items:[],selected:null};});
  for(const event of ['petya-results-changed','petya-chat-opened','petya-dialogue-state'])document.addEventListener(event,refresh);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')picker.hidden=true;});
  document.addEventListener('pointerdown',e=>{if(!bar.contains(e.target)&&!picker.contains(e.target))picker.hidden=true;});
  window.showResultChoices=async result=>{
    await refresh();
    if(result.attachment)await window.openChatAttachment(result.attachment,topicSelect.value);
    if(Number.isInteger(result.resultJump))await window.jumpToChatMessage(result.resultJump);
    if(result.resultChoices?.length){restricted={ids:result.resultChoices,action:result.resultAction};paintPicker();picker.hidden=false;}
  };
  refresh();
})();
