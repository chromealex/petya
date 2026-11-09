(() => {
 const list=$('team-list'),form=$('team-form'),status=$('team-status');let loaded=false,dirty=false,attributes=[];
 // The save strip appears only with unsaved edits.
 const setDirty=value=>{dirty=value;form.classList.toggle('is-dirty',value);};
 const fields=[['me','Это я',4],['name','Имя',120],['aliases','Как вы называете человека',240],['role','Роль',160],['projects','Проекты',400],['responsibilities','За что отвечает',1600],['email','Email',254],['phone','Телефон',40],['slackId','Slack member ID (необязательно)',80],['jiraId','Jira',160],['jiraName','Имя в Jira',200],['meetingName','Имя на встречах',240]];
 // Names seen in meetings: the list for «Имя на встречах» and the automatic match as each card's hint.
 let meetingNames=[];
 window.paintMeetingNames=()=>{let list=document.getElementById('team-meeting-names');if(!list){list=document.createElement('datalist');list.id='team-meeting-names';document.body.append(list);}
  list.replaceChildren(...meetingNames.map(z=>Object.assign(document.createElement('option'),{value:z.name,label:z.member?'сейчас: '+z.member:'не сопоставлен'})));
  for(const input of document.querySelectorAll('#team-list [data-field="meetingName"]')){const owner=input.closest('.team-member')?.querySelector('[data-field="name"]')?.value.trim();const auto=meetingNames.filter(z=>z.member&&z.member===owner).map(z=>z.name);input.placeholder=auto.length?'Сам определил: '+auto.slice(0,3).join(', '):'Определю сам по имени';}};
 const loadMeetingNames=()=>window.petya.feature('materials','meetingNames').then(v=>{meetingNames=v||[];window.paintMeetingNames();}).catch(()=>{});
 document.addEventListener('petya-view',e=>{if(e.detail==='team')loadMeetingNames();});loadMeetingNames();
 function add(member={}){
  const card=document.createElement('article');card.className='card team-member';
  const details=document.createElement('details');details.open=!member.name;
  const summary=document.createElement('summary');
  const heading=document.createElement('span');heading.className='team-member-heading';
  const title=document.createElement('strong'),subtitle=document.createElement('span');subtitle.className='team-member-subtitle';
  const avatar=document.createElement('span');avatar.className='team-avatar';avatar.setAttribute('aria-hidden','true');const you=document.createElement('span');you.className='team-you';you.textContent='это вы';heading.append(title,you,subtitle);const load=document.createElement('span');load.className='team-load';load.hidden=true;summary.append(avatar,heading,load);
  const editor=document.createElement('div');editor.className='team-member-fields';
  const updateSummary=()=>{const value=key=>editor.querySelector('[data-field="'+key+'"]')?.value.trim()||'';title.textContent=value('name')||'Новый участник';const photo=value('photo');if(/^data:image\/(png|jpeg);base64,/.test(photo)){const img=avatar.querySelector('img')||document.createElement('img');img.src=photo;img.alt='';avatar.replaceChildren(img);avatar.classList.add('has-photo');}else{avatar.classList.remove('has-photo');avatar.textContent=(value('name').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('')||'+').toLocaleUpperCase();}subtitle.textContent=[value('role'),value('projects')].filter(Boolean).join(' · ')||'Роль и проекты не указаны';};
  for(const [key,label,max] of fields){
   const wrap=document.createElement('label');wrap.textContent=label;if(key==='responsibilities')wrap.className='team-member-wide';
   const input=document.createElement(key==='responsibilities'?'textarea':'input');input.dataset.field=key;input.value=member[key]||'';input.maxLength=max;
   if(key==='jiraId'||key==='jiraName'||key==='slackId'){input.type='hidden';wrap.hidden=true;}
   // The meeting name lives in «В сервисах»; projects are picked from a list (the input stays as the stored value).
   if(key==='meetingName')wrap.hidden=true;
   if(key==='projects'){input.type='hidden';wrap.append(projectPicker(input));}
   if(key==='name')input.required=true;
   if(['name','role','projects'].includes(key))input.addEventListener('input',updateSummary);
   if(key==='email')input.type='email';
   if(key==='phone'){input.type='tel';input.placeholder='+7 900 000-00-00';}
   if(key==='aliases')input.placeholder=member.aliasHint?'Например: '+member.aliasHint:'Как вы зовёте человека в разговоре';
   // «Имя на встречах»: empty means Petya matches the name himself (shown as a hint); a chosen one wins. Names seen
   // in meetings are offered in the list.
   if(key==='meetingName'){input.setAttribute('list','team-meeting-names');input.placeholder='Определю сам по имени';input.dataset.member=member.name||'';wrap.title='Как человек подписан в приложении встреч. Можно несколько через запятую.';}
   if(key==='projects')input.placeholder='Название проекта, ключ Jira';
   if(key==='responsibilities'){input.rows=2;input.placeholder='Например: QA, проверка релизных сборок Android';}
   input.addEventListener('invalid',()=>{details.open=true;});
   // «Это я»: the user's own card. One card at most; Petya then talks to that person as «ты».
   if(key==='me'){input.type='hidden';input.value=member.me==='true'?'true':'';wrap.textContent='';wrap.className='check team-member-me team-member-wide';
    const box=document.createElement('input');box.type='checkbox';box.className='team-me';box.checked=input.value==='true';card.classList.toggle('is-me',box.checked);
    box.onchange=()=>{for(const other of list.querySelectorAll('[data-field="me"]'))if(other!==input&&other.value){other.value='';const b=other.parentElement.querySelector('.team-me');if(b)b.checked=false;other.closest('.team-member')?.classList.remove('is-me');}
     input.value=box.checked?'true':'';card.classList.toggle('is-me',box.checked);setDirty(true);status.textContent='Изменения не сохранены.';};
    wrap.append(box,document.createTextNode('Это я'));wrap.title='Петя будет знать, что это вы, и говорить вам «ты»';}
   wrap.append(input);editor.append(wrap);
  }
  // Stored person attributes this page does not show (filled by services, shown by apps) and apps' own `fields`
  // stay in the card as they are, so saving the team keeps them; apps draw their fields before the anchor
  // (person-fields.js, extension.json "personFields").
  for(const key of attributes)if(!fields.some(([k])=>k===key)&&!editor.querySelector('[data-field="'+key+'"]')){const kept=document.createElement('input');kept.type='hidden';kept.dataset.field=key;kept.dataset.kept='true';kept.value=member[key]||'';editor.append(kept);}
  const own=document.createElement('input');own.type='hidden';own.dataset.field='fields';own.value=JSON.stringify(member.fields&&typeof member.fields==='object'?member.fields:{});editor.append(own);
  const anchor=document.createElement('span');anchor.className='team-person-fields-anchor';anchor.hidden=true;editor.append(anchor);
  addAccounts(editor,member);
  window.petyaPersonFields?.mount(card,{editor,anchor});
  window.paintMeetingNames?.();
  updateSummary();
  const actions=document.createElement('div');actions.className='actions team-member-wide';
  // A removed person goes to «Удалённые»: a team refresh does not add them back or update them (src/team-removed.cjs).
  const remove=window.deleteButton('Удалить участника');remove.onclick=()=>{const value=key=>editor.querySelector('[data-field="'+key+'"]')?.value.trim()||'';if(value('name'))window.teamRemovedNow?.({...Object.fromEntries([...editor.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value])),at:Date.now()});setDirty(true);card.remove();status.textContent='Изменения не сохранены.';};
  actions.append(remove);editor.append(actions);details.append(summary,editor);card.append(details);list.append(card);return card;
 }
 // Projects: chips chosen from Petya's projects and the Jira projects; typing filters the list.
 let projectChoices=null;
 const loadProjectChoices=()=>projectChoices||(projectChoices=Promise.all([window.petya.chatNavigation('').catch(()=>null),window.petya.settings?.().catch(()=>null)]).then(([nav,settings])=>{
  const names=(nav?.projects||[]).filter(p=>p.id!=='general'&&!p.archived).map(p=>p.name);
  const keys=String(settings?.jiraProjects||settings?.jiraProject||'').split(',').map(v=>v.trim()).filter(Boolean);
  return [...new Set([...keys,...names])];}));
 function projectPicker(store){
  const box=node('div','team-projects'),chips=node('div','team-project-chips'),input=node('input'),list=node('div','team-project-options');input.placeholder='Начните вводить проект';input.setAttribute('aria-label','Добавить проект');list.hidden=true;
  const values=()=>store.value.split(',').map(v=>v.trim()).filter(Boolean);
  const write=next=>{store.value=[...new Set(next)].join(', ');store.dispatchEvent(new Event('input',{bubbles:true}));paint();};
  const paint=()=>{chips.replaceChildren(...values().map(v=>{const c=node('span','team-project-chip',v);const x=node('button',null,'×');x.type='button';x.setAttribute('aria-label','Убрать проект '+v);x.onclick=()=>write(values().filter(y=>y!==v));c.append(x);return c;}));};
  const show=async()=>{const all=await loadProjectChoices(),q=input.value.trim().toLocaleLowerCase(),taken=new Set(values());
   const rows=all.filter(v=>!taken.has(v)&&(!q||v.toLocaleLowerCase().includes(q))).slice(0,12);list.replaceChildren(...rows.map(v=>{const b=node('button',null,v);b.type='button';b.onmousedown=e=>e.preventDefault();b.onclick=()=>{input.value='';write([...values(),v]);show();};return b;}));
   if(q&&!all.some(v=>v.toLocaleLowerCase()===q)){const b=node('button','team-project-free','Добавить «'+input.value.trim()+'»');b.type='button';b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const v=input.value.trim();input.value='';write([...values(),v]);show();};list.append(b);}
   list.hidden=!list.childElementCount;};
  input.addEventListener('focus',show);input.addEventListener('input',e=>{e.stopPropagation();show();});input.addEventListener('blur',()=>setTimeout(()=>{list.hidden=true;},120));
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();list.querySelector('button')?.click();}else if(e.key==='Backspace'&&!input.value&&values().length){write(values().slice(0,-1));}else if(e.key==='Escape'){list.hidden=true;}});
  const field=node('div','team-project-field');field.append(chips,input);box.append(field,list);paint();return box;
 }
 // «В сервисах»: how the person appears in each service — one row per service. Slack is always shown and can be
 // linked here (Slack member ID); apps add their own always-shown rows with a way to link the person
 // (window.petyaTeamServices.register, below: Jira finds the person in its projects); other services add rows
 // when the person has an account there.
 const SERVICES={slack:'Slack',telegram:'Telegram',meetings:'Встречи',instagram:'Instagram',whatsapp:'WhatsApp',linkedin:'LinkedIn',asana:'Asana',notion:'Notion',confluence:'Confluence',gmail:'Почта',github:'GitHub'};
 const FIELDS={name:'Имя',handle:'Ник',title:'Должность',email:'Email',url:'Ссылка',id:'ID'};
 // Apps' rows: register(id, {title, link(panel, open, api), unlink?(api), init?(api), order?}). `api` is
 // {member, field(key), read(), write(accounts), mark(), paint(id), node} of the open card; `init` runs before the rows
 // are drawn (to show links older cards keep in their own fields). Registered by the app's script after team.js.
 const linked=new Map();
 window.petyaTeamServices={register(id,row){if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(id)||!row||typeof row.link!=='function')throw Error('[team] invalid service row '+id);linked.set(id,row);}};
 const serviceName=id=>linked.get(id)?.title||SERVICES[id]||id.charAt(0).toUpperCase()+id.slice(1);
 const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 function addAccounts(editor,member){
  const photo=node('input');photo.type='hidden';photo.dataset.field='photo';photo.value=member.photo||'';editor.append(photo);
  const photoSource=node('input');photoSource.type='hidden';photoSource.dataset.field='photoSource';photoSource.value=member.photoSource||'';editor.append(photoSource);
  // Photo: pick one of the service pictures (Slack, Jira, …), upload your own, or keep initials.
  {const box=node('div','team-photo team-member-wide'),current=node('span','team-photo-current'),choices=node('div','team-photo-choices'),tools=node('div','team-photo-tools');
   const paint=()=>{current.replaceChildren();if(/^data:image\/(png|jpeg);base64,/.test(photo.value)){const img=node('img');img.src=photo.value;img.alt='';current.append(img);}else current.textContent=(field('name').value.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('')||'+').toLocaleUpperCase();
    const label={slack:'из Slack',custom:'своё фото',none:'без фото'}[photoSource.value]||(linked.has(photoSource.value)?'из '+serviceName(photoSource.value):photo.value?'из профиля':'нет фото');caption.textContent=label;
    // The avatar in the card's header follows (without marking the form as changed).
    const avatar=editor.closest('.team-member')?.querySelector('.team-avatar');if(avatar){if(/^data:image\/(png|jpeg);base64,/.test(photo.value)){const img=avatar.querySelector('img')||node('img');img.src=photo.value;img.alt='';avatar.replaceChildren(img);avatar.classList.add('has-photo');}else{avatar.classList.remove('has-photo');avatar.textContent=current.textContent;}}};
   const set=(value,source)=>{photo.value=value;photoSource.value=source;mark();paint();for(const b of choices.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.photo===value));};
   const caption=node('span','small');const head=node('div','team-photo-head');head.append(current,node('div',null));head.lastChild.append(node('strong',null,'Фото'),caption);
   const pick=node('button',null,'Выбрать…');pick.type='button';pick.title='Фото из профилей сервисов';
   const upload=node('button',null,'Загрузить своё…');upload.type='button';
   const none=node('button','quiet','Без фото');none.type='button';none.onclick=()=>set('','none');
   upload.onclick=async()=>{upload.disabled=true;try{const value=await window.petya.teamPhotoPick();if(value)set(value,'custom');}catch(e){status.textContent=e.message;}finally{upload.disabled=false;}};
   pick.onclick=async()=>{if(!choices.hidden&&choices.childElementCount){choices.hidden=true;return;}choices.hidden=false;choices.replaceChildren(node('span','small','Загружаю фото из профилей…'));
    try{const list=await window.petya.teamPhotoOptions(read())||[];choices.replaceChildren();if(!list.length){choices.append(node('span','small','В профилях сервисов нет фото. Обновите команду или загрузите своё.'));return;}
     for(const o of list){const b=node('button','team-photo-choice');b.type='button';b.dataset.photo=o.photo;b.title=serviceName(o.service);b.setAttribute('aria-pressed',String(o.photo===photo.value));const img=node('img');img.src=o.photo;img.alt=serviceName(o.service);b.append(img,node('span',null,serviceName(o.service)));b.onclick=()=>set(o.photo,o.service);choices.append(b);}
    }catch(e){choices.replaceChildren(node('span','small',e.message));}};
   choices.hidden=true;tools.append(pick,upload,none);head.append(tools);box.append(head,choices);editor.append(box);setTimeout(paint,0);}
  const hidden=node('input');hidden.type='hidden';hidden.dataset.field='accounts';hidden.value=member.accounts&&Object.keys(member.accounts).length?JSON.stringify(member.accounts):'';editor.append(hidden);
  const field=key=>editor.querySelector('[data-field="'+key+'"]');
  const read=()=>{try{return JSON.parse(hidden.value||'{}');}catch{return {};}};
  const write=next=>{hidden.value=Object.keys(next).length?JSON.stringify(next):'';};
  const mark=()=>{setDirty(true);status.textContent='Изменения не сохранены.';};
  const box=node('div','team-accounts team-member-wide');box.append(node('div','team-accounts-title','В сервисах'));
  const rows=new Map();
  function paint(service){
   const entry=service==='meetings'?{name:field('meetingName').value}:read()[service]||{},row=rows.get(service);row.list.replaceChildren();
   const shown=Object.entries(FIELDS).filter(([k])=>entry[k]);
   if(!shown.length)row.list.append(node('dd','team-account-empty',service==='meetings'?(field('meetingName').placeholder&&!/Определю/.test(field('meetingName').placeholder)?field('meetingName').placeholder:'Определю сам по имени'):'Не связан'));
   for(const [key,label] of shown){const dd=node('dd',key==='id'?'mono':'',entry[key]);if(key==='id'){dd.title='Скопировать';dd.tabIndex=0;dd.onclick=()=>navigator.clipboard?.writeText(entry[key]).catch(()=>{});}row.list.append(node('dt',null,label),dd);}
   row.unlink.hidden=!shown.length;row.link.textContent=service==='meetings'?(shown.length?'Изменить имя':'Указать имя'):shown.length?'Изменить':'Связать';
  }
  const api={member,field,read,write,mark,paint:service=>paint(service),node};
  function unlinkService(service){const next=read();delete next[service];write(next);linked.get(service)?.unlink?.(api);if(service==='slack')field('slackId').value='';mark();paint(service);}
  function addRow(service){
   const item=node('div','team-account'),label=node('span','team-account-service',serviceName(service)),list=node('dl'),tools=node('div','team-account-tools'),panel=node('div','team-account-link');panel.hidden=true;
   const link=node('button','quiet','Связать');link.type='button';const unlink=node('button','quiet','Отвязать');unlink.type='button';unlink.title='Убрать связь с '+serviceName(service);unlink.onclick=()=>{panel.hidden=true;unlinkService(service);};
   tools.append(link,unlink);const main=node('div','team-account-main');main.append(list,panel);item.append(label,main,tools);box.append(item);rows.set(service,{list,link,unlink,panel});
   if(linked.has(service))linked.get(service).link(panel,link,api);else if(service==='slack')slackLink(panel,link);else if(service==='meetings')meetingLink(panel,link,unlink);else link.hidden=true;
   paint(service);
  }
  // Slack: the member ID (Profile → ⋮ → Copy member ID).
  function slackLink(panel,open){
   const input=node('input');input.placeholder='U012ABCDEF';input.maxLength=80;input.setAttribute('aria-label','Slack member ID');
   const save=node('button',null,'Готово');save.type='button';const hint=node('p','small','В Slack: профиль человека → ⋮ → «Copy member ID».');
   const bar=node('div','team-account-search');bar.append(input,save);panel.append(bar,hint);
   open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){input.value=field('slackId').value;input.focus();}};
   const apply=()=>{const v=input.value.trim().toUpperCase();if(v&&!/^[UW][A-Z0-9]+$/.test(v)){hint.textContent='ID выглядит как U012ABCDEF — это не имя и не ссылка.';return;}
    field('slackId').value=v;const next=read();if(v){next.slack=next.slack?.id===v?next.slack:{id:v};}else delete next.slack;write(next);panel.hidden=true;mark();paint('slack');};
   save.onclick=apply;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();apply();}if(e.key==='Escape'){e.stopPropagation();panel.hidden=true;}});
  }
  // Meetings: the name the person has in meetings; empty means Petya matches it by name.
  function meetingLink(panel,open,unlink){
   const input=node('input');input.setAttribute('list','team-meeting-names');input.placeholder='Как подписан на встречах';input.setAttribute('aria-label','Имя на встречах');
   const save=node('button',null,'Готово');save.type='button';const bar=node('div','team-account-search');bar.append(input,save);panel.append(bar,node('p','small','Можно несколько через запятую. Пусто — Петя сопоставит сам по имени.'));
   open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){input.value=field('meetingName').value;input.focus();}};
   rows.get('meetings')?.list.addEventListener('click',()=>{if(panel.hidden)open.click();});
   const apply=()=>{field('meetingName').value=input.value.trim();panel.hidden=true;mark();paint('meetings');};save.onclick=apply;
   input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();apply();}if(e.key==='Escape')panel.hidden=true;});
   unlink.onclick=()=>{field('meetingName').value='';panel.hidden=true;mark();paint('meetings');};
  }
  // Older cards keep the link only in the Slack field (apps' own fields: their `init`): show it in the rows too.
  {const next=read();if(field('slackId')?.value&&!next.slack)next.slack={id:field('slackId').value};write(next);}
  const apps=[...linked].sort((a,b)=>(a[1].order??100)-(b[1].order??100)||a[0].localeCompare(b[0])).map(([id])=>id);
  for(const id of apps){try{linked.get(id).init?.(api);}catch(e){console.error('[team] '+id,e);}}
  const always=['slack',...apps,'meetings'];
  for(const service of [...always,...Object.keys(read()).filter(k=>!always.includes(k))])addRow(service);
  editor.append(box);
 }
 // Load: open tasks per person from Jira and Asana, next to each name. Refreshed when the page opens.
 const loadBar=document.createElement('p');loadBar.className='team-load-status small';loadBar.setAttribute('role','status');
 const loadRefresh=document.createElement('button');loadRefresh.type='button';loadRefresh.className='quiet';loadRefresh.textContent='Обновить загрузку';
 const loadHead=document.createElement('div');loadHead.className='team-load-head';loadHead.append(loadBar,loadRefresh);list.before(loadHead);
 let loadData=null,loadBusy=false;
 const taskWord=n=>n%10===1&&n%100!==11?'задача':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'задачи':'задач';
 window.paintTeamLoad=()=>{
  const people=new Map((loadData?.people||[]).map(p=>[p.name,p])),max=Math.max(1,...(loadData?.people||[]).map(p=>p.total));
  for(const card of list.children){
   const badge=card.querySelector('.team-load'),name=card.querySelector('[data-field="name"]')?.value.trim(),p=people.get(name);
   badge.replaceChildren();badge.hidden=!loadData||!name;if(badge.hidden)continue;
   if(!p||!p.known){badge.classList.add('unknown');badge.textContent='—';badge.title=p?'Нет данных: не найден аккаунт в Jira или Asana':'Сохраните команду, чтобы увидеть загрузку';continue;}
   badge.classList.remove('unknown');
   const value=document.createElement('strong');value.textContent=p.total;const word=document.createElement('span');word.textContent=taskWord(p.total);
   const bar=document.createElement('span');bar.className='team-load-bar';const fill=document.createElement('span');fill.style.width=Math.round(p.total/max*100)+'%';bar.append(fill);
   badge.append(value,word,bar);
   badge.title=[p.jira?'Jira: '+p.jira.open+' открыто'+(p.jira.inProgress?', в работе '+p.jira.inProgress:''):'',p.asana?'Asana: '+(p.asana.open>=100?'100+':p.asana.open)+' открыто':''].filter(Boolean).join('\n');
   badge.setAttribute('aria-label','Открытых задач: '+p.total+(badge.title?'. '+badge.title.replace(/\n/g,'. '):''));
  }
 };
 async function refreshLoad(force=false){
  if(loadBusy)return;loadBusy=true;loadRefresh.disabled=true;loadBar.textContent='Считаю открытые задачи…';
  try{
   loadData=await window.petya.feature('assignment','workload',force);
   const from=[loadData.sources.jira?'Jira':'',loadData.sources.asana?'Asana':''].filter(Boolean).join(' и ');
   loadBar.textContent=!from?'Загрузка появится, когда подключите Jira или Asana.':!loadData.hasTeam?'Добавьте людей, чтобы видеть их загрузку.':'Загрузка по открытым задачам в '+from+' · '+new Date(loadData.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+(loadData.warnings.length?' · не всё прочитано: '+loadData.warnings.join('; '):'');
   window.paintTeamLoad();
  }catch(error){loadBar.textContent='Загрузку не удалось посчитать: '+error.message;}
  finally{loadBusy=false;loadRefresh.disabled=false;}
 }
 loadRefresh.onclick=()=>refreshLoad(true);
 document.addEventListener('petya-view',e=>{if(e.detail==='team')refreshLoad().catch(()=>{});});
 // «Удалённые»: people removed by hand. Saved ones come from the team list, the ones removed now are sent with the save.
 let stored=[],gone=[];
 const removedBox=document.createElement('details');removedBox.className='card team-removed';removedBox.hidden=true;$('team-add').before(removedBox);
 function paintRemoved(){
  const rows=[...gone,...stored];removedBox.hidden=!rows.length;const open=removedBox.open;removedBox.replaceChildren();removedBox.open=open;
  const summary=document.createElement('summary');summary.textContent='Удалённые · '+rows.length;
  const hint=document.createElement('p');hint.className='small';hint.textContent='При обновлении команды Петя не добавляет их снова и не обновляет их данные.';
  const ul=document.createElement('ul');ul.className='team-removed-list';
  for(const row of rows){const li=document.createElement('li');const name=document.createElement('span');name.textContent=row.name+(row.role?' · '+row.role:'');
   const back=document.createElement('button');back.type='button';back.textContent='Вернуть';back.title='Вернуть в команду (сохранится вместе с командой)';
   back.onclick=()=>{gone=gone.filter(x=>x!==row);stored=stored.filter(x=>x!==row);const {at,...member}=row;add(member);setDirty(true);status.textContent='Изменения не сохранены.';paintRemoved();};
   li.append(name,back);ul.append(li);}
  removedBox.append(summary,hint,ul);
 }
 window.teamRemovedNow=row=>{gone.unshift(row);paintRemoved();};
 async function load(force=false){const data=await window.petya.teamList();attributes=Array.isArray(data.attributes)?data.attributes:attributes;if(dirty&&!force){status.textContent='Команда обновлена. Обновите список перед сохранением ручных правок.';$('team-save').disabled=true;return;}stored=data.removed||[];gone=[];paintRemoved();list.replaceChildren();data.members.forEach(add);window.paintTeamLoad?.();$('team-notes').value=data.notes;loaded=true;setDirty(false);$('team-save').disabled=false;$('team-add').disabled=false;status.textContent=data.members.length?'Участников: '+data.members.length:'Добавьте коллег, чтобы Петя знал, кто за что отвечает.';}
 document.querySelector('[data-view="team"]').addEventListener('click',run(async()=>{if(!loaded)await load();refreshLoad().catch(()=>{});}));
 $('team-add').onclick=()=>{if(list.children.length>=100){notice('Можно добавить до 100 участников.',true);return;}setDirty(true);add().querySelector('[data-field="name"]').focus();status.textContent='Изменения не сохранены.';};
 form.addEventListener('input',()=>{setDirty(true);status.textContent='Изменения не сохранены.';});
 document.addEventListener('petya-team-updated',()=>{if(dirty){status.textContent='Петя обновил команду. У вас есть несохранённые правки — обновите список перед сохранением.';$('team-save').disabled=true;return;}load().catch(e=>notice(e.message,true));});
 const reload=document.createElement('button');reload.type='button';reload.textContent='Обновить список';reload.onclick=run(()=>load(true));$('team-add').after(reload);
 window.saveTeamNow=()=>new Promise(resolve=>{const done=()=>{document.removeEventListener('petya-team-saved',done);resolve();};document.addEventListener('petya-team-saved',done);form.requestSubmit();setTimeout(done,5000);});
 form.onsubmit=run(async()=>{const members=[...list.children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value])));$('team-save').disabled=true;try{await window.petya.teamSave({members,notes:$('team-notes').value,removed:gone});setDirty(false);window.petya.teamList().then(data=>{stored=data.removed||[];gone=[];paintRemoved();}).catch(()=>{});refreshLoad(true).catch(()=>{});status.textContent='Команда сохранена. Петя учитывает её в диалоге и при подготовке задач.';}finally{$('team-save').disabled=false;document.dispatchEvent(new Event('petya-team-saved'));}});
})();
