// The hint panel page: one hint at a time — what it is, the matched text, where it comes from — and three buttons.
// All hint text is set as text, never as markup. It hides itself after a minute unless the pointer is over it.
(()=>{
 const $=id=>document.getElementById(id);
 const locale=()=>window.petyaLocale||'ru-RU';
 const span=(text,raw)=>{const n=document.createElement('span');n.textContent=text;if(raw)n.dataset.noI18n='';return n;};
 const day=at=>{const d=new Date(at);const n=document.createElement('time');n.dateTime=d.toISOString();n.dataset.noI18n='';n.dataset.absolute='';n.textContent=d.toLocaleDateString(locale(),{day:'numeric',month:'long',...(d.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});return n;};
 let current=null,timer=null;
 const act=action=>{if(current)window.meetingHints.act(action,current.id);};
 const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>act('timeout'),60000);};
 function render(h){
  current=h;const box=$('hint');box.hidden=false;box.dataset.kind=h.kind;
  const title=$('title');title.replaceChildren();
  if(h.kind==='decision'){title.append(span('Это уже решали'));if(h.source?.at)title.append(' ',day(h.source.at));}
  else if(h.kind==='promise'){if(h.who)title.append(span(h.who,true),' ',span('обещал(а)'));else title.append(span('Ты обещал'));}
  else title.append(span(h.term||'',true));
  $('kind').textContent=h.kind==='decision'?'✓':h.kind==='promise'?'!':'≡';
  const text=$('text');text.replaceChildren(span(h.text||'',true));
  if(h.due)text.append(' ',span('· срок: '),span(h.due,true));
  const source=$('source');source.replaceChildren();
  if(h.source?.kind==='glossary')source.append(span('Глоссарий'),h.source.label?span(' · '+h.source.label,true):'');
  else source.append(span(h.source?.label||'Сводка встречи',true));
  $('mute').title=h.kind==='decision'?'Больше не показывать прошлые решения':h.kind==='promise'?'Больше не показывать обещания':'Больше не показывать термины';
  arm();
 }
 window.meetingHints.listen(message=>{if(message?.type==='hint'&&message.hint)render(message.hint);});
 $('ok').onclick=$('close').onclick=()=>act('dismiss');
 $('mute').onclick=()=>{if(current)window.meetingHints.act('mute',current.kind);};
 $('hide').onclick=()=>act('hide');
 $('hint').addEventListener('mouseenter',()=>clearTimeout(timer));
 $('hint').addEventListener('mouseleave',arm);
 window.renderMeetingHint=render;
})();
