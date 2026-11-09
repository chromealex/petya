// «Почта», renderer: the «Почтовые правила» tab on «Навыки» (extension.json "ui"). Rules are taught in the chat
// («Научись проверять почту»); here they are listed with what they read, switched on and off, tried on the mail,
// edited by hand and deleted (with «Отменить»). Everything goes through the app's IPC (feature.cjs).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('mail-cards.css',document.currentScript.src).href;document.head.append(style);
 const lines=v=>String(v||'').split('\n').map(s=>s.trim()).filter(Boolean);
 function summary(k,rule,accounts){
  const chips=k.el('div','mail-rule-chips');
  const names=rule.allAccounts?['все аккаунты']:(rule.accounts||[]).map(id=>accounts.find(a=>a.id===id)?.name||'отключённый аккаунт');
  for(const text of [rule.unread?'непрочитанные':'все письма',rule.days+' '+(window.t||String)('дн.'),rule.skipPromotions?'без рассылок':'с рассылками',...names])chips.append(k.chip({label:text}));
  if(rule.priority?.length){const c=k.chip({label:(window.t||String)('важные:')+' '+rule.priority.join(', ')});c.dataset.noI18n='';chips.append(c);}
  return chips;
 }
 function form(k,api,rule,accounts,done){
  const box=k.el('form','mail-rule-form'),field=(label,input)=>{const l=k.el('label',null,label);l.append(input);return l;};
  const input=(value,max)=>{const i=k.el('input');i.value=value;if(max)i.maxLength=max;return i;};
  const area=(value,rows,max)=>{const t=k.el('textarea');t.rows=rows;t.value=value;if(max)t.maxLength=max;return t;};
  const check=(label,on)=>{const l=k.el('label','check'),c=k.el('input');c.type='checkbox';c.checked=on;l.append(c,document.createTextNode(label));return [l,c];};
  const name=input(rule.name||'Проверка почты',100),phrases=area((rule.phrases||[]).join('\n'),3),days=input(String(rule.days||7));days.type='number';days.min='1';days.max='365';
  const [allBox,all]=check('Все подключённые аккаунты, включая добавленные позже',!!rule.allAccounts);
  const chosen=new Set(rule.accounts||[]),choices=k.el('div','mail-rule-accounts');
  for(const a of [...accounts,...[...chosen].filter(id=>!accounts.some(x=>x.id===id)).map(id=>({id,name:'Отключённый аккаунт — снимите выбор'}))]){
   const [l,c]=check(a.name,chosen.has(a.id));l.dataset.noI18n='';c.onchange=()=>{if(c.checked)chosen.add(a.id);else chosen.delete(a.id);};choices.append(l);
  }
  if(!accounts.length)choices.append(k.el('p','small','Почтовые аккаунты не подключены: добавьте их в «Настройках» → «Почта».'));
  const [unreadBox,unread]=check('Только непрочитанные',rule.unread!==false),[skipBox,skip]=check('Пропускать рассылки с отпиской; в Gmail также промо и социальные',rule.skipPromotions!==false);
  const priority=area((rule.priority||[]).join('\n'),2),instructions=area(rule.instructions||'Кратко перескажи письма. Выдели явные вопросы ко мне и сроки; не придумывай обязательства.',3,2000);
  const [enabledBox,enabled]=check('Навык включён',rule.enabled!==false);
  for(const n of [name,phrases,priority,instructions])n.dataset.noI18n='';
  const status=k.el('p','small mail-rule-status');status.setAttribute('role','status');
  const draft=()=>({...rule.id?{id:rule.id}:{},name:name.value,phrases:lines(phrases.value),allAccounts:all.checked,accounts:[...chosen],days:Number(days.value),unread:unread.checked,skipPromotions:skip.checked,priority:lines(priority.value),instructions:instructions.value,enabled:enabled.checked});
  const button=(label,cls,fn)=>{const b=k.el('button',cls,label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;};
  const actions=k.el('div','kit-actions');
  actions.append(button('Сохранить навык','primary',async()=>{await api.feature('save',draft());done('Сохранено. Навык уже работает.');}),
   button('Пробный запуск на почте',null,async()=>{status.textContent='Читаю почту…';const r=await api.feature('test',draft());status.textContent=r.text;}),
   button('Отмена','quiet',()=>done()));
  box.append(field('Название',name),field('Фразы запуска, по одной на строку',phrases),k.el('p','small','Точные фразы работают сразу. Похожие просьбы о почте распознаёт локальная модель; при неоднозначности навык не запускается.'),
   allBox,choices,field('За сколько дней',days),unreadBox,skipBox,field('Приоритетные отправители — имя или адрес, по одному на строку',priority),field('Что выделить в пересказе',instructions),enabledBox,
   k.el('p','small','Шаги: прочитать входящие выбранных аккаунтов → применить фильтры → пересказать. За запуск проверяются до 20 писем из каждого выбранного аккаунта. Отправка и изменение писем недоступны.'),actions,status);
  box.onsubmit=e=>e.preventDefault();
  setTimeout(()=>name.focus(),0);
  return box;
 }
 window.renderMailRules=(container,api)=>{
  const k=window.resultKit;if(!k)return;
  const root=k.el('div','mail-rules');container.append(root);
  let state={rules:[],draft:null,accounts:[]},editing=null;
  const draw=()=>{
   root.replaceChildren();
   root.append(k.el('p','small mail-rules-intro','Скажите в чате «Научись проверять почту» и опишите правила — Петя предложит пробный запуск и сохранит навык.'));
   if(editing){root.append(form(k,api,editing,state.accounts,async text=>{editing=null;await refresh();if(text)k.toast(text);}));return;}
   if(state.draft){
    const row=k.el('div','mail-rule mail-rule-draft');const info=k.el('div','mail-rule-info');
    info.append(k.el('strong',null,'Черновик обучения'),k.el('p','small','Обучение в чате не закончено: скажите «попробуй», «сохрани навык» или «отмени обучение».'));
    const actions=k.el('div','kit-actions');
    actions.append(act('Открыть черновик обучения',()=>{editing=state.draft.recipe||{};draw();}),act('Удалить черновик','quiet',async()=>{state=await api.feature('dropDraft');draw();}));
    row.append(info,actions);root.append(row);
   }
   const list=k.el('div','mail-rule-list');
   if(!state.rules.length)list.append(k.el('p','small','Почтовых правил пока нет. Петя предложит стандартное, когда вы попросите проверить почту.'));
   for(const rule of state.rules){
    const row=k.el('div','mail-rule'+(rule.enabled?'':' off')),info=k.el('div','mail-rule-info'),head=k.el('div','mail-rule-head'),title=k.el('strong',null,rule.name);title.dataset.noI18n='';
    head.append(title,k.chip({label:rule.enabled?'включено':'выключено',tone:rule.enabled?'done':''}));
    const said=k.el('p','small mail-rule-phrases','«'+rule.phrases.join('», «')+'»');said.dataset.noI18n='';
    info.append(head,said,summary(k,rule,state.accounts));
    const out=k.el('p','small mail-rule-result');out.dataset.noI18n='';out.hidden=true;info.append(out);
    const actions=k.el('div','kit-actions');
    actions.append(act('Проверить сейчас',async()=>{out.hidden=false;out.textContent=(window.t||String)('Читаю почту…');const r=await api.feature('test',rule);out.textContent=r.text;}),
     act(rule.enabled?'Выключить':'Включить',async()=>{state=await api.feature('toggle',rule.id,!rule.enabled);draw();}),
     act('Изменить',()=>{editing=rule;draw();}));
    const del=window.deleteButton('Удалить навык «'+rule.name+'»');del.onclick=async()=>{del.disabled=true;try{const r=await api.feature('remove',rule.id);state=r;draw();k.toast('Правило «'+rule.name+'» удалено.',{undo:async()=>{state=await api.feature('restore',r.removed);draw();}});}catch(e){k.toast(e.message,{error:true});del.disabled=false;}};
    actions.append(del);row.append(info,actions);list.append(row);
   }
   root.append(list);
   const add=act('Новое правило',()=>{editing={};draw();});add.classList.add('mail-rule-new');root.append(add);
  };
  function act(label,cls,fn){if(typeof cls==='function'){fn=cls;cls=null;}const b=k.el('button',cls,label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){k.toast(e.message,{error:true});}finally{b.disabled=false;}};return b;}
  async function refresh(){try{state=await api.feature('list');}catch(e){state={rules:[],draft:null,accounts:[]};k.toast(e.message,{error:true});}if(!editing)draw();}
  api.onShow(refresh);draw();return refresh();
 };
})();
