// Git plugin, renderer: changed files with stage toggles, per-file diff, commit message with a suggestion,
// commit and a separate push. Data: message.extensionData.gitState (result.cjs).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('git-cards.css',document.currentScript.src).href;document.head.append(style);
 const STATUS={M:'изменён',A:'новый',D:'удалён',R:'переименован',C:'скопирован','?':'новый',U:'конфликт'};
 const label=f=>f.conflict?'конфликт':STATUS[(f.status.trim()||'M')[0]]||STATUS[f.status[1]]||f.status;
 // Split a unified diff into files: {path, lines, added, removed}.
 function split(text){
  const files=[];let cur=null;
  for(const line of String(text||'').split('\n')){
   const head=/^diff --git a\/(.+?) b\/(.+)$/.exec(line);
   if(head){cur={path:head[2],lines:[],added:0,removed:0};files.push(cur);continue;}
   if(!cur||/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(line))continue;
   cur.lines.push(line);if(line.startsWith('+'))cur.added++;else if(line.startsWith('-'))cur.removed++;
  }
  return files;
 }
 function diffView(k,files){
  const box=k.el('div','git-diff');if(!files.length){box.append(k.el('div','kit-meta','Изменений в отслеживаемых файлах нет.'));return box;}
  const bar=k.el('div','git-diff-bar');const pick=k.el('select');pick.setAttribute('aria-label','Файл');
  files.forEach((f,i)=>{const o=k.el('option',null,f.path+'  +'+f.added+' −'+f.removed);o.value=i;pick.append(o);});
  const code=k.el('div','git-code');
  const show=i=>{code.replaceChildren();for(const line of files[i].lines.slice(0,400)){code.append(k.el('div',line.startsWith('@@')?'hunk':line.startsWith('+')?'plus':line.startsWith('-')?'minus':'',line||' '));}if(files[i].lines.length>400)code.append(k.el('div','hunk','… ещё '+(files[i].lines.length-400)+' строк'));};
  pick.onchange=()=>show(Number(pick.value));bar.append(pick,k.el('span','kit-meta',files.length+' '+(files.length===1?'файл':'файла(ов)')));box.append(bar,code);show(0);return box;
 }
 window.renderGitState=(parent,state)=>{
  const k=window.resultKit;if(!k||!state?.root||parent.querySelector('.git-card'))return;
  const pk=JSON.stringify(['git',state.root]);
  const slot=k.el('div','git-slot');parent.append(slot);
  const paint=st=>{state=st;slot.replaceChildren(build(st));};
  const run=async(action,args,busy)=>{const r=await k.quick(pk,action,args,{busy});if(r?.state)paint(r.state);return r;};
  function build(st){
   const body=k.el('div','git-body');
   if(st.action==='diff'&&st.diff){body.append(diffView(k,split(st.diff)));}
   if(st.files.length){
    const list=k.el('ul','git-files');
    for(const f of st.files){
     const li=k.el('li');const box=k.el('input','kit-check');box.type='checkbox';box.checked=f.staged&&!f.unstaged;box.indeterminate=f.staged&&f.unstaged;box.disabled=f.conflict;
     box.setAttribute('aria-label',(f.staged?'Убрать из коммита ':'Добавить в коммит ')+f.path);box.title=box.indeterminate?'Часть изменений в коммите':'';
     box.onchange=()=>run(box.checked?'stage':'unstage',{paths:[f.path]},li).catch(()=>{box.checked=!box.checked;});
     li.append(box,k.el('span','git-path',f.path+(f.oldPath?' ← '+f.oldPath:'')),k.chip({label:label(f),tone:f.conflict?'alert':f.staged?'done':''}));list.append(li);
    }
    body.append(list);if(st.more)body.append(k.el('div','kit-meta','…и ещё '+st.more+' файлов — в панели Git.'));
   }else body.append(k.el('div','kit-meta','Рабочая папка чистая.'));
   const staged=st.files.filter(f=>f.staged).length;
   if(st.files.length){
    const form=k.el('div','git-commit');const input=k.el('input');input.type='text';input.maxLength=2000;input.placeholder=staged?'Сообщение коммита':'Отметьте файлы для коммита';input.setAttribute('aria-label','Сообщение коммита');
    const suggest=k.el('button',null,'Предложи');suggest.type='button';suggest.title='Петя предложит сообщение по подготовленным изменениям';suggest.disabled=!staged;
    suggest.onclick=async()=>{suggest.disabled=true;try{const r=await window.chatResultsApi.perform(pk,'suggest');if(r?.message)input.value=r.message;input.focus();}catch(e){k.toast(e.message,{error:true});}finally{suggest.disabled=false;}};
    const commit=k.el('button','primary','Закоммитить'+(staged?' · '+staged:''));commit.type='button';commit.disabled=!staged;
    commit.onclick=async()=>{if(!input.value.trim()){input.focus();k.toast('Напишите сообщение коммита.',{error:true});return;}commit.disabled=true;try{await run('commit',{message:input.value});}catch{}finally{commit.disabled=false;}};
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commit.click();}};
    form.append(input,suggest,commit);body.append(form);
   }
   const actions=[];
   if(st.files.some(f=>f.unstaged&&!f.conflict))actions.push({label:'Всё в коммит',run:b=>run('stage',{all:true},b)});
   if(st.action!=='diff'&&st.files.length)actions.push({label:'Показать diff',run:async()=>{const r=await window.chatResultsApi.perform(pk,'diff');paint({...state,action:'diff',diff:r.diff||''});}});
   if(st.head&&st.remotes.length&&!st.files.length)actions.push({label:'Push'+(st.upstream?' в '+st.upstream.remote:''),title:'Отправить коммиты в удалённый репозиторий',run:b=>run('push',{},b)});
   return k.card({app:'Git',initial:'G',color:'#f05033',key:st.name,status:{label:st.branch||'detached HEAD',tone:'accent'},subtitle:st.files.length?'изменено: '+st.files.length:'',body,actions,className:'git-card'});
  }
  // The text answer lists the same files: keep only its first line.
  for(const node of parent.querySelectorAll(':scope>p,:scope>pre,:scope>ul'))if(node!==parent.querySelector(':scope>p'))node.remove();
  paint(state);
 };
})();
