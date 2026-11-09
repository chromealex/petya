// Settings of «Kubernetes»: the context and namespace (empty — the kubeconfig's current ones), an optional path to
// kubectl, and the current state. Petya downloads nothing: it uses the installed kubectl and the user's kubeconfig.
(()=>{
 if(document.querySelector('#settings-form [data-extension="kubernetes"]'))return;
 const card=document.createElement('article');card.className='card';card.dataset.extension='kubernetes';card.dataset.manualSave='true';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label,input);if(hint)l.append(el('small',{className:'small'},hint));return l;};
 const context=el('select',{}),namespace=el('input',{type:'text',spellcheck:false,autocomplete:'off',placeholder:'из kubeconfig'}),kubectl=el('input',{type:'text',spellcheck:false,autocomplete:'off',placeholder:'найти автоматически'});
 const save=el('button',{type:'button',className:'primary'},'Сохранить'),check=el('button',{type:'button',className:'quiet'},'Проверить');
 const state=el('p',{className:'connection-status'});state.setAttribute('role','status');
 card.append(el('h2',{},'Kubernetes'),
  el('p',{},'Нужны kubectl и kubeconfig с доступом к кластеру. Петя смотрит поды, события, describe и статус выкатки; перезапуск и масштабирование деплоймента — только после подтверждения в карточке, с точной командой kubectl. В поды Петя не заходит (никакого exec).'),
  el('div',{className:'row'},el('div',{className:'grow'},field('Контекст',context,'Пусто — текущий контекст kubeconfig.')),el('div',{className:'grow'},field('Пространство имён',namespace,'Пусто — из контекста (или default).'))),
  field('Путь к kubectl',kubectl,'Если kubectl не в PATH.'),
  el('div',{className:'row'},save,check),state);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const say=(text,kind='')=>{state.textContent=text;state.className='connection-status'+(kind?' '+kind:'');state.dataset.noI18n='';};
 async function refresh(){
  check.disabled=true;say('Проверяю kubectl…');
  try{
   const s=await window.petya.settings();
   const st=await window.petya.feature('kubernetesApp','status');
   context.replaceChildren(el('option',{value:''},'Текущий из kubeconfig'),...(st.contexts||[]).map(c=>{const o=el('option',{value:c},c);o.dataset.noI18n='';return o;}));
   context.value=s.kubernetesContext||'';namespace.value=s.kubernetesNamespace||'';kubectl.value=s.kubernetesKubectl||'';
   say(st.text,st.installed&&st.context?'connected':'error');
  }catch(e){say(e.message,'error');}
  finally{check.disabled=false;}
 }
 save.onclick=async()=>{
  save.disabled=true;
  try{await window.petya.saveSettings({kubernetesContext:context.value,kubernetesNamespace:namespace.value.trim(),kubernetesKubectl:kubectl.value.trim()});await refresh();}
  catch(e){say(e.message,'error');}
  finally{save.disabled=false;}
 };
 check.onclick=refresh;
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='kubernetes')refresh();});
 refresh();
})();
