// «Поддержка игроков», settings: the Zendesk connection (subdomain, agent email, API token kept as a secret and never
// shown again) and the SLA target used when a ticket has no SLA policy of its own. Saved by the card's own button.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const input=(type,placeholder)=>{const i=el('input');i.type=type;i.placeholder=placeholder;i.autocomplete='off';i.spellcheck=false;return i;};
 const card=el('article','card');card.dataset.extension='support';card.dataset.manualSave='true';
 const sub=input('text','mystudio'),email=input('email','agent@studio.com'),token=input('password','Вставьте API-токен Zendesk'),sla=input('number','24');
 sla.min='1';sla.max='720';sla.step='1';
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const save=el('button','primary','Сохранить подключение');save.type='button';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',null,'Поддержка игроков'),
  el('p',null,'Тикеты игроков в чате: «что жалуются в поддержку», «тикеты про оплату за неделю», «ответь на тикет 1234». Ответ уходит игроку только после кнопки «Отправить» в карточке.'),
  el('h3',null,'Zendesk'),
  field('Поддомен',sub,'Из адреса mystudio.zendesk.com — mystudio.'),
  field('Email агента',email,'Агент с доступом к тикетам и правом публичных ответов.'),
  field('API-токен',token,'Admin Center → Apps and integrations → APIs → Zendesk API → включите доступ по токену и добавьте токен. Хранится зашифрованным.'),
  clearLabel,
  field('Цель SLA, часов',sla,'Для тикетов без политики SLA в Zendesk: сколько часов новый или открытый тикет может ждать ответа.'),
  save,status,
  el('p','small','Helpshift и Freshdesk появятся как следующие источники; Петя показывает тикеты всех подключённых служб вместе.'));
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const describe=async()=>{
  try{const st=await window.petya.feature('supportDesk','status');const z=st.sources.find(x=>x.id==='zendesk');status.textContent=z?.ready?'Zendesk подключён.':st.hasZendeskToken?'Токен сохранён — проверьте поддомен и email.':'Zendesk не подключён.';}
  catch{status.textContent='';}
 };
 const load=async()=>{try{const s=await window.petya.settings();sub.value=s.supportZendeskSubdomain||'';email.value=s.supportZendeskEmail||'';sla.value=s.supportSlaHours||'24';}catch{}describe();};
 save.onclick=async()=>{
  save.disabled=true;
  try{
   const result=await window.petya.saveSettings({supportZendeskSubdomain:sub.value.trim(),supportZendeskEmail:email.value.trim(),supportZendeskToken:token.value.trim(),clear_supportZendeskToken:clear.checked,supportSlaHours:String(sla.value||'24').trim()});
   if(typeof displaySettings==='function')displaySettings(result);
   token.value='';clear.checked=false;await describe();status.textContent='Сохранено. '+status.textContent;
  }catch(e){status.textContent=e.message;}
  finally{save.disabled=false;}
 };
 document.addEventListener('petya-settings-displayed',()=>{token.value='';});
 window.petyaEvents?.onWindowShown?.(describe);
 load();
})();
