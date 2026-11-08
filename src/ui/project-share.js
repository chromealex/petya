// Petya's data shared with the team through the project's git (.petya/): a block in the project settings and
// «В проект» / «Из проекта» on the Team tab. Folders are named by index; paths never leave the main process.
(()=>{
 const api=(method,...args)=>window.petya.feature('projectShare',method,...args);
 const KINDS=[['team','Команда'],['dictionary','Словарь'],['project','Каналы Slack и Jira'],['skills','Навыки']];
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const button=(text,cls='')=>{const b=el('button',cls,text);b.type='button';return b;};
 const mine=(kind,local)=>kind==='project'?(local.channels?'каналов: '+local.channels:'каналов нет')+(local.jira?' · Jira '+local.jira:''):kind==='skills'?'у тебя: '+local.skills.length:'у тебя: '+local[kind];
 const theirs=(kind,shared)=>{const n=kind==='project'?shared.channels+(shared.jira?1:0):kind==='skills'?shared.skills.length:shared[kind];return n?'в проекте: '+(kind==='project'?(shared.channels?'каналов '+shared.channels:'')+(shared.jira?(shared.channels?' · ':'')+'Jira '+shared.jira:''):n):'в проекте нет';};
 const NAMES={team:'команда',dictionary:'словарь',project:'каналы и Jira',skills:'навыки'};
 function report(result,saved){
  if(saved){const done=result.written.length?'Сохранено в «'+result.folder+'»: '+result.written.join(', ')+'. Закоммить .petya — коллеги получат с git pull.':'Нечего сохранять.';
   return done+(result.skipped.length?' Пусто: '+result.skipped.map(k=>NAMES[k]).join(', ')+'.':'');}
  return 'Из «'+result.folder+'» добавлено: коллег — '+result.team+', правил словаря — '+result.dictionary+'. Каналы, Jira и навыки проекта используются сами.';
 }
 // Project settings: what you have, what the project already shares, save or load chosen kinds.
 window.paintProjectShare=async(box,project)=>{
  box.replaceChildren();box.hidden=true;
  if(!project?.id||project.id==='general')return;
  let state;try{state=await api('status',project.id);}catch{return;}
  box.hidden=false;
  box.append(el('h3',null,'Общее с командой'),el('p','small','Файлы в папке .petya проекта уходят в git — у коллег Петя сразу подхватит команду, словарь, каналы и навыки.'));
  if(!state.folders.length){box.append(el('p','small','Добавьте папку проекта, чтобы делиться с командой через git.'));return;}
  const folder=el('select');folder.setAttribute('aria-label','Папка проекта');for(const f of state.folders){const o=el('option',null,f.name);o.value=String(f.index);o.dataset.noI18n='';folder.append(o);}
  if(state.folders.length>1){const l=el('label',null,'Папка');l.append(folder);box.append(l);}
  const rows=el('div','project-share-rows'),status=el('p','small');status.setAttribute('role','status');
  const paint=()=>{rows.replaceChildren();const shared=state.folders[Number(folder.value)||0].shared;
   for(const [kind,label] of KINDS){const row=el('label','project-share-row');const box=el('input');box.type='checkbox';box.value=kind;box.checked=kind!=='skills';
    row.append(box,el('strong',null,label),el('span',null,mine(kind,state.local)),el('span','project-share-there',theirs(kind,shared)));rows.append(row);}};
  folder.onchange=paint;paint();
  const chosen=()=>[...rows.querySelectorAll('input:checked')].map(i=>i.value);
  const run=(saving)=>async()=>{const kinds=chosen();if(!kinds.length){status.textContent='Отметьте, чем поделиться.';return;}
   for(const b of actions.querySelectorAll('button'))b.disabled=true;
   try{const result=await api(saving?'save':'load',project.id,Number(folder.value)||0,kinds);status.textContent=report(result,saving);
    if(!saving&&result.team)document.dispatchEvent(new Event('petya-team-updated'));
    state=await api('status',project.id);paint();}
   catch(error){status.textContent=error.message;}
   finally{for(const b of actions.querySelectorAll('button'))b.disabled=false;}};
  const actions=el('div','project-share-actions'),save=button('Сохранить в проект'),load=button('Подтянуть из проекта','quiet');
  save.onclick=run(true);load.onclick=run(false);actions.append(save,load);
  box.append(rows,actions,status);
 };
 // Team tab: the team of the selected project goes to its first folder, or is taken from the folder that shares one.
 const anchor=document.getElementById('team-save');
 if(anchor){
  const toProject=button('В проект','quiet'),fromProject=button('Из проекта','quiet');
  toProject.title='Сохранить сохранённую команду в .petya/team.json папки текущего проекта';fromProject.title='Добавить коллег из .petya/team.json текущего проекта';
  const say=(text,error)=>{const node=document.getElementById('team-status');if(node)node.textContent=text;else window.notice?.(text,error);};
  const go=saving=>async()=>{
   let state;try{state=await api('status');}catch(error){return say(error.message,true);}
   if(!state.project||!state.folders.length)return say('Выберите в чате проект с папкой — команда ляжет в её .petya/team.json.',true);
   const folder=saving?state.folders[0]:state.folders.find(f=>f.shared.team)||null;
   if(!folder)return say('В папках проекта нет общей команды. Сохраните свою кнопкой «В проект».');
   try{const result=await api(saving?'save':'load',state.project.id,folder.index,['team']);say(report(result,saving));if(!saving&&result.team)document.dispatchEvent(new Event('petya-team-updated'));}
   catch(error){say(error.message,true);}
  };
  toProject.onclick=go(true);fromProject.onclick=go(false);
  anchor.after(toProject,fromProject);
 }
})();
