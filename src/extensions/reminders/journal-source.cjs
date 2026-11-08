// «Напоминания» as a journal source (src/extensions/journal/sources.cjs): reminders done or fired in the period go to
// the day's timeline; reminders still open (fired and not marked, or due by the end of tomorrow) are offered to carry
// over to tomorrow's plan.
module.exports={
 id:'reminders',name:'Напоминания',icon:'reminder',
 ready:()=>true,
 async collect(s,{from,to,now=Date.now()}){
  const svc=s.reminders?.service;if(!svc)return {items:[],carry:[]};
  const items=svc.history({from,to}).map(r=>({at:r.firedAt||r.createdAt,source:'reminders',icon:'reminder',title:r.text,detail:r.status==='done'?'отмечено как готовое':'сработало'+(r.firedText?' — '+r.firedText:''),kind:'reminder'}));
  const end=new Date(now);end.setDate(end.getDate()+1);end.setHours(23,59,59,999);
  const carry=svc.list().filter(r=>r.group==='fired'||r.kind==='time'&&!r.repeat&&r.at<=end.getTime()).slice(0,12)
   .map(r=>({id:'reminder:'+r.id,title:r.text,detail:r.group==='fired'?'сработало, не отмечено':r.words,source:'reminders'}));
  return {items,carry};
 }
};
