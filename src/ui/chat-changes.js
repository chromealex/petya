(()=>{
  const panel=document.createElement('section');panel.className='chat-change-editor';panel.hidden=true;
  document.querySelector('.chat-composer').prepend(panel);
  let state={items:[]},editing='',revision=0;
  const call=(method,...args)=>window.petya.feature('chatChanges',method,...args);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text||'';if(cls)n.className=cls;return n;};
  function button(text,run){const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await run();}catch(e){let error=b.parentNode.querySelector('.change-error');if(!error){error=el('p','','change-error');error.setAttribute('role','alert');b.parentNode.append(error);}error.textContent=e.message;}finally{b.disabled=false;}};return b;}
  async function mutate(method,id,...args){const expected=state.scope;const next=await call(method,expected,id,...args);if(state.scope!==expected)return;state=next;if(next.messages)showDialogueMessages(next.messages);paint();}
  function editor(r){
    if(editing===r?.id)return;
    editing=r?.id||'';panel.replaceChildren();panel.hidden=!r;if(!r)return;
    panel.append(el('strong','Изменить · '+r.title));
    const controls=el('div','','change-fields'),actions=el('div','','actions');panel.append(controls,actions);
    let input;
    if(r.editor.kind==='file'){
      const text=el('textarea');text.value=r.editor.text;text.setAttribute('aria-label','Новый текст файла');controls.append(text);input=()=>({text:text.value});
    }else{
      const field=el('select');field.setAttribute('aria-label','Поле задачи');for(const [value,label]of [['summary','Название'],['description','Описание'],['append','Дополнить описание'],['assignee','Исполнитель']]){const o=el('option',label);o.value=value;field.append(o);}
      field.value=r.editor.field||'summary';const body=el('div');controls.append(field,body);
      function render(){body.replaceChildren();let chosen='';
        if(field.value==='assignee'){
          const query=el('input');query.placeholder='Имя в Jira';query.value=r.editor.query||'';query.setAttribute('aria-label','Имя исполнителя');const results=el('div','','change-people');
          const offer=rows=>{chosen='';results.replaceChildren();if(!rows.length)results.append(el('p','Никого не найдено. Уточните имя.'));for(const person of rows){const option=button(person.name,async()=>{chosen=person.id;for(const child of results.children)child.setAttribute('aria-pressed',String(child===option));});results.append(option);}};
          body.append(query,button('Найти',async()=>{const expected=state.scope,rows=await call('people',expected,r.id,query.value);if(state.scope!==expected)return;offer(rows);}),results);
          if(r.people?.length)offer(r.people);input=()=>({field:'assignee',accountId:chosen});
        }else{const text=el('textarea');text.value=field.value==='append'?r.editor.value||'':r.editor[field.value]||'';text.setAttribute('aria-label',field.selectedOptions[0].textContent);body.append(text);input=()=>({field:field.value,value:text.value,...field.value==='append'?{heading:r.editor.heading||''}:{}});}
      }
      field.onchange=render;render();
    }
    actions.append(button('Предпросмотр',()=>mutate('prepare',r.id,input())),button('Отмена',()=>mutate('cancel',r.id)));
  }
  function paint(){
    editor(state.items.find(r=>r.state==='editing'));
    document.querySelectorAll('.chat-change-card').forEach(n=>n.remove());
    for(const r of state.items.filter(r=>r.state!=='editing')){
      const message=dialogueMessages.querySelector('[data-message-index="'+r.index+'"]');if(!message)continue;
      const card=el('section','','chat-change-card');card.append(el('strong',(r.undoOf?'Откат · ':'Правка · ')+r.title));
      if(r.rows?.length){const diff=el('details');diff.open=r.state==='preview';diff.append(el('summary','Изменения'));for(const row of r.rows){diff.append(el('h4',row.label));const pair=el('div','','change-diff');for(const [label,value]of [['Было',row.before],['Будет',row.after]]){const col=el('div');col.append(el('small',label),el('pre',String(value??'')));pair.append(col);}diff.append(pair);}card.append(diff);}
      const actions=el('div','','actions');card.append(actions);
      if(r.state==='preview')actions.append(button('Применить',()=>mutate('apply',r.id)),button('Отмена',()=>mutate('cancel',r.id)));
      if(r.state==='applying'){const status=el('p','Сохраняю изменения…');status.setAttribute('role','status');card.append(status);}
      if(r.state==='superseded')card.append(el('p','Заменено уточнённой правкой.'));
      if(r.state==='cancelled')card.append(el('p','Отменено. Изменения не применялись.'));
      if(r.receipt){card.append(el('p',r.receipt.text));if(r.receipt.url){const link=el('a','Открыть задачу');link.href=r.receipt.url;link.target='_blank';link.rel='noopener';card.append(link);}if(r.receipt.file)actions.append(button('Показать в папке',()=>call('reveal',state.scope,r.id)));if(r.receipt.canUndo&&!r.undone)actions.append(button('Предпросмотр отката',()=>mutate('undo',r.id)));if(r.undone)card.append(el('small','Изменение отменено.'));}
      if(r.canVerify&&['uncertain','failed','done'].includes(r.state))actions.append(button('Проверить результат',()=>mutate('verify',r.id)));
      if(r.state==='uncertain')card.append(el('p','Запись могла выполниться. Сначала проверьте результат; повторная запись отключена.'));
      if(r.error)card.append(el('p',r.error,'change-error'));message.append(card);
    }
  }
  async function refresh(){const id=++revision;try{const next=await call('snapshot');if(id!==revision)return;state=next;paint();}catch(e){console.warn(e.message);}}
  window.showChangeEditor=async()=>{await refresh();panel.querySelector('textarea,input')?.focus();};
  document.addEventListener('petya-topic-changed',()=>{revision++;state={items:[]};editing='';panel.hidden=true;});
  for(const event of ['petya-results-changed','petya-chat-opened','petya-dialogue-state'])document.addEventListener(event,refresh);
  window.petyaEvents.onChatChange(refresh);refresh();
})();
