// «Кто знает», renderer: the people ranked for a subject with avatars, a score bar split by source (code, Jira, Slack,
// meetings, messengers when one is connected), the evidence behind every point (files and commits with links, Jira
// issues, Slack messages, meetings, messenger threads)
// in a collapsible list, and per person «Написать в Slack» (the share-message flow asks for the channel and
// confirms) and «Пригласить на встречу» (handed to the chat, where the calendar app asks for the time).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('who-cards.css',document.currentScript.src).href;document.head.append(style);
 const SOURCES=[['code','Код','#86c2ff'],['jira','Jira','#c9a8f0'],['slack','Slack','#e5ce8c'],['meetings','Встречи','#9dd9c9'],['chat','Мессенджеры','#f0b4a8']];
 const MODES={expert:'кто разбирается',author:'кто работал над кодом',last:'кто последним трогал'};
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=v=>Number(v||0).toLocaleString(locale(),{maximumFractionDigits:1});
 // Moments are relative where the app has the shared helper (src/ui/relative-time.js); a short date otherwise.
 const date=ms=>{const d=new Date(ms);if(isNaN(d))return '';if(typeof window.shortTime==='function')return window.shortTime(d);return d.toLocaleDateString(locale(),{day:'numeric',month:'short',...(d.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});};
 // Russian forms; another interface language takes the singular only for exactly one (the word is translated in the DOM).
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 // Names, commit subjects, issue summaries, file paths and quotes are data, never translated.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const feature=(method,...args)=>window.petya.feature('whoKnows',method,...args);

 function link(k,text,url,cls){
  const safe=k.safeUrl(url||'');const a=raw(k.el(safe?'a':'span',cls,text));
  if(safe){a.href=safe;a.target='_blank';a.rel='noopener';a.title=safe;}
  return a;
 }
 function bar(k,p,max){
  const box=k.el('div','who-bar');box.setAttribute('role','img');
  const parts=SOURCES.filter(([id])=>p.points[id]>0).map(([id,label])=>label+' '+num(p.points[id]));
  box.setAttribute('aria-label','Баллы: '+num(p.score)+' — '+parts.join(', '));box.title=parts.join(' · ');
  const fill=k.el('div','who-fill');fill.style.width=(max?Math.max(4,100*p.score/max):0)+'%';
  for(const [id,,color] of SOURCES){const v=p.points[id];if(!(v>0))continue;const seg=k.el('span','who-seg');seg.dataset.source=id;seg.style.flexGrow=String(v);seg.style.background=color;fill.append(seg);}
  box.append(fill);return box;
 }
 function split(k,p){
  const line=k.el('div','who-split');
  for(const [id,label,color] of SOURCES){const v=p.points[id];if(!(v>0))continue;const item=k.el('span','who-split-item');const dot=k.el('i');dot.style.background=color;item.append(dot,label+' '+num(v));line.append(item);}
  return line;
 }
 function section(k,title,rows){if(!rows.length)return null;const box=k.el('section','who-ev');box.append(k.el('h5',null,title));const list=k.el('ul');for(const r of rows)list.append(r);box.append(list);return box;}

 function evidence(k,p){
  const files=p.files.map(f=>{const li=k.el('li');
   if(f.url)li.append(link(k,f.path,f.url,'who-path'));
   else{const b=raw(k.el('button','who-path who-reveal',f.path));b.type='button';b.title='Показать в папке';b.onclick=async e=>{e.stopPropagation();try{await feature('reveal',f.repo,f.path);}catch(err){k.toast(err.message,{error:true});}};li.append(b);}
   li.append(k.el('small',null,num(f.lines)+' '+plural(f.lines,['строка','строки','строк'])+' · '+f.commits+' '+plural(f.commits,['коммит','коммита','коммитов'])+' · '+date(f.at)));return li;});
  const commits=p.commits.map(c=>{const li=k.el('li');li.append(link(k,c.short,c.url,'who-hash'),raw(k.el('span','who-text',c.subject)),k.el('small',null,date(c.at)+(c.byMessage?' · по описанию':'')));return li;});
  const issues=p.issues.map(i=>{const li=k.el('li');li.append(link(k,i.key,i.url,'who-hash'),raw(k.el('span','who-text',i.summary)),k.el('small',null,[...i.roles,i.status].filter(Boolean).join(' · ')));return li;});
  const threads=p.threads.map(t=>{const li=k.el('li');li.append(link(k,t.title||'Slack',t.url,'who-hash who-thread'),raw(k.el('q','who-quote',t.text)),k.el('small',null,date(t.at)));return li;});
  const chats=(p.chats||[]).map(t=>{const li=k.el('li');li.append(link(k,t.title,t.url,'who-hash who-thread'),raw(k.el('q','who-quote',t.text)),k.el('small',null,date(t.at)));return li;});
  const meetings=p.meetings.map(m=>{const li=k.el('li');li.append(raw(k.el('span','who-hash who-thread',m.title)),raw(k.el('q','who-quote',m.text)),k.el('small',null,date(m.at)+(m.count>1?' · реплик: '+m.count:'')));return li;});
  const box=k.el('div','who-evidence selectable');
  for(const s of [section(k,'Файлы',files),section(k,'Коммиты',commits),section(k,'Задачи Jira',issues),section(k,'Slack',threads),section(k,'Мессенджеры',chats),section(k,'Встречи',meetings)])if(s)box.append(s);
  const total=files.length+commits.length+issues.length+threads.length+chats.length+meetings.length;
  const details=k.el('details','who-details');const summary=k.el('summary',null,'Основания · '+total);details.append(summary,box);return details;
 }

 function personRow(k,p,i,c,max){
  const row=k.el('article','who-row');row.dataset.person=p.name;
  const rank=k.el('span','who-rank',String(i+1));
  const face=k.avatar(p.name,{size:34});face.classList.add('who-face');
  const who=k.el('div','who-who');
  const name=k.el('div','who-name');name.append(raw(k.el('strong',null,p.name)));
  if(!p.member){const chip=k.chip({label:'не в «Команде»',title:'Имя из источника; человека нет в справочнике «Команда»'});chip.classList.add('who-outside');name.append(chip);}
  who.append(name);
  if(p.role)who.append(raw(k.el('span','who-role',p.role)));
  if(c.mode==='last'&&p.last){const last=k.el('span','who-last');last.append('Последний коммит: '+date(p.last.at)+' · ',link(k,p.last.subject,p.last.url,'who-last-link'));who.append(last);}
  const score=k.el('div','who-score');score.append(k.el('strong',null,num(p.score)),k.el('small',null,Number.isInteger(p.score)?plural(p.score,['балл','балла','баллов']):'балла'));
  const meter=k.el('div','who-meter');meter.append(bar(k,p,max),split(k,p));
  const actions=k.el('div','who-actions');
  const facts=[p.points.code>0?'код':'',p.points.jira>0?'задачи Jira':'',p.points.slack>0?'Slack':'',p.points.chat>0?'мессенджеры':'',p.points.meetings>0?'встречи':''].filter(Boolean).join(', ');
  // Only people of «Команда» can be addressed; a name from a source alone is not a recipient.
  if(p.member)actions.append(k.links('share-message',{text:p.name+', подскажи, пожалуйста, по теме «'+c.topic+'» — ты больше всех с этим работал(а) ('+facts+').'},{label:'Написать в Slack',title:'Сообщение пройдёт через Slack: Петя спросит канал и покажет текст перед отправкой'}));
  if(c.calendar&&p.member){const b=k.el('button',null,'Пригласить на встречу');b.type='button';b.title='Петя подставит запрос в поле ввода: добавьте время';b.onclick=e=>{e.stopPropagation();k.ask('Поставь встречу с '+p.name+' по теме «'+c.topic+'» ');};actions.append(b);}
  row.append(rank,face,who,score,meter,evidence(k,p));if(p.member)row.append(actions);
  return row;
 }

 function sources(k,c){
  const line=k.el('div','who-sources');
  const names={code:'Git',jira:'Jira',slack:'Slack',meetings:'Встречи',chat:''},colors=Object.fromEntries(SOURCES.map(([id,,color])=>[id,color]));
  for(const x of c.sources||[]){
   const item=k.el(x.url?'a':'span','who-source '+(x.state||''));if(x.url&&k.safeUrl(x.url)){item.href=k.safeUrl(x.url);item.target='_blank';item.rel='noopener';}
   const dot=k.el('i');dot.style.background=x.state==='ok'?colors[x.kind]:'transparent';dot.style.borderColor=colors[x.kind];
   // A messenger is named by its source (Mattermost, VK Teams).
   const label=x.kind==='chat'?String(x.label||''):names[x.kind]+(x.label&&x.kind!=='slack'?' · '+x.label:'');
   const state=x.state==='ok'?String(x.count??''):x.state==='empty'?'ничего':x.state==='error'?'ошибка':'нет';
   item.append(dot,raw(k.el('span',null,label)),k.el('b',null,state));item.title=x.note||(x.state==='ok'?'Найдено: '+x.count:x.state==='empty'?'Источник подключён, по теме ничего нет':'');
   line.append(item);
  }
  return line;
 }

 window.renderWhoKnows=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.who-card'))return;
  const body=k.el('div','who-body');
  body.append(sources(k,c));
  const people=c.people||[];
  const max=Math.max(0,...people.map(p=>p.score));
  if(people.length)body.append(k.collapse(people.map((p,i)=>personRow(k,p,i,c,max)),5,'Ещё люди'));
  else body.append(k.el('p','who-empty','Следов по этой теме нет ни в коде, ни в задачах, ни в переписке. Попробуйте назвать её как в коде — класс, папку или модуль.'));
  const how=k.el('details','who-how');how.append(k.el('summary',null,'Как считаются баллы'),
   k.el('p',null,'Код: за каждый коммит в файлах темы — 1 + lg(1 + изменённых строк); коммит, найденный только по описанию, — 1. Jira: исполнитель — 3, автор — 1, комментарий — 1 (до 3 на задачу). Slack и встречи: 1 за сообщение или реплику (до 3 на тред или встречу). Каждый балл теряет половину веса за 4 месяца.'));
  if((c.sources||[]).some(x=>x.kind==='chat'))how.append(k.el('p',null,'Мессенджеры: 1 за сообщение по теме (до 3 на тред).'));
  if(c.search){const words=[...(c.search.identifiers||[]),...(c.search.paths||[]),...(c.search.text||[]).filter(t=>/[а-яё]/i.test(t))];if(words.length)how.append(raw(k.el('p','who-terms','Искал: '+[...new Set(words)].join(', '))));}
  body.append(how);
  const status=people.length?{label:people.length===1?'1 человек':people.length+' '+plural(people.length,['человек','человека','человек']),tone:'done'}:{label:'нет следов',tone:'alert'};
  const actions=[];
  if(c.mode!=='last')actions.push({label:'Кто последним трогал',run:()=>k.ask('Кто последний трогал код по теме «'+c.topic+'»',{send:true})});
  actions.push({label:'Спросить про другую тему',run:()=>k.ask('Кто разбирается в ')});
  const card=k.card({app:'Кто знает',initial:'?',color:'#4f6278',key:'«'+c.topic+'»',status,subtitle:MODES[c.mode]||'',body,actions,className:'who-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
