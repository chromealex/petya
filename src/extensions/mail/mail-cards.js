// Mail plugin, renderer: letters as cards — important first, open in the mail service, reply draft
// (written here, sent from the mail service), letter → task. Data: message.extensionData.mailItems.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('mail-cards.css',document.currentScript.src).href;document.head.append(style);
 const key=item=>JSON.stringify(['mail',item.provider,item.id]);
 const address=from=>(/<([^<>\s]+@[^<>\s]+)>/.exec(from)||/([^\s<>"]+@[^\s<>"]+)/.exec(from)||[])[1]||'';
 const name=from=>String(from||'').replace(/<[^>]*>/g,'').replace(/"/g,'').trim()||address(from)||'Без отправителя';
 const email=v=>/^[^\s@]+@[^\s@]+$/.test(v||'')?v:'';
 const when=v=>{const d=new Date(v);if(!Number.isFinite(d.getTime()))return '';const today=new Date().toDateString()===d.toDateString();return today?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});};
 const reSubject=s=>/^(re|ответ|на):/i.test(s)?s:'Re: '+s;
 function openUrl(item){
  if(item.provider==='microsoft')return 'https://outlook.office.com/mail/deeplink/read/'+encodeURIComponent(item.id);
  const user=email(item.account);return 'https://mail.google.com/mail/'+(user?'?authuser='+encodeURIComponent(user):'')+'#all/'+encodeURIComponent(item.id);
 }
 function composeUrl(item,body){
  const to=address(item.from),subject=reSubject(item.subject||'');
  if(item.provider==='microsoft')return 'https://outlook.office.com/mail/deeplink/compose?'+new URLSearchParams({to,subject,body});
  const user=email(item.account);return 'https://mail.google.com/mail/?'+new URLSearchParams({...(user?{authuser:user}:{}),view:'cm',fs:'1',to,su:subject,body});
 }
 function draft(k,item,card){
  const old=card.querySelector('.kit-draft');if(old){old.querySelector('textarea').focus();return;}
  const box=k.el('div','kit-draft');const label=k.el('label','kit-draft-label','Ответ '+name(item.from));const text=k.el('textarea');text.placeholder='Текст ответа или пожелание: «согласен, перенесём на четверг»';
  label.htmlFor=text.id='mail-draft-'+Math.random().toString(36).slice(2);
  const row=k.el('div','kit-actions');
  const suggest=k.el('button',null,'Предложи текст');suggest.type='button';suggest.title='Петя напишет черновик по письму и вашему пожеланию';
  suggest.onclick=async()=>{suggest.disabled=true;try{const r=await window.chatResultsApi.perform(key(item),'draft',{hint:text.value});if(r?.draft)text.value=r.draft;}catch(e){k.toast(e.message,{error:true});}finally{suggest.disabled=false;}};
  const open=k.el('button','primary','Открыть в почте');open.type='button';open.title='Откроется окно ответа в почте; отправляете вы';
  open.onclick=()=>{const url=k.safeUrl(composeUrl(item,text.value.slice(0,1800)));if(url)window.open(url,'_blank','noopener');};
  const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>box.remove();
  row.append(open,suggest,cancel);box.append(label,text,row);card.append(box);text.focus();
 }
 function mailCard(k,item){
  const body=item.excerpt?k.el('p','mail-excerpt',item.excerpt):null;
  const card=k.card({app:item.provider==='microsoft'?'Outlook':'Gmail',initial:item.provider==='microsoft'?'O':'G',color:item.provider==='microsoft'?'#0a64c8':'#c5221f',
   key:name(item.from),href:openUrl(item),status:item.priority?{label:'Важное',tone:'accent'}:null,subtitle:[item.account,when(item.date)].filter(Boolean).join(' · '),
   title:item.subject||'(без темы)',body,presentation:item.id?key(item):undefined,className:'mail-card',
   actions:[{label:'Ответить',primary:!!item.priority,run:()=>draft(k,item,card)},{label:'В задачу',title:'Подготовить задачу в Jira по письму',run:()=>k.ask('Создай задачу в Jira по письму «'+(item.subject||'')+'» от '+name(item.from)+': ')}]});
  return card;
 }
 window.renderMailItems=(parent,items)=>{
  const k=window.resultKit;if(!k||!Array.isArray(items)||!items.length||parent.querySelector('.mail-list'))return;
  const sorted=[...items].sort((a,b)=>Number(b.priority)-Number(a.priority));
  const important=sorted.filter(i=>i.priority).length;
  const list=k.views(parent,{id:'mail',label:items.length+' '+(items.length===1?'письмо':items.length<5?'письма':'писем')+(important?' · важных: '+important:''),items:sorted,modes:{
   cards:rows=>k.collapse(rows.map(item=>mailCard(k,item)),4,'Ещё письма'),
   table:rows=>k.table([{label:'От',value:i=>name(i.from)},{label:'Тема',value:i=>{const a=document.createElement('a');a.textContent=(i.priority?'★ ':'')+(i.subject||'(без темы)');const url=k.safeUrl(openUrl(i));if(url){a.href=url;a.target='_blank';a.rel='noopener';}return a;}},{label:'Когда',value:i=>when(i.date)}],rows)
  }});
  list.classList.add('mail-list');
 };
})();
