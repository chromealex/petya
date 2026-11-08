// Journal source: meetings Petya recorded (meeting memory of the company, src/features/meeting-memory.cjs). One item
// per recording session with its title and length; the transcript itself stays where it is.
const {isMeeting}=require('../../meeting-talk.cjs');
module.exports={
 id:'meetings',name:'Встречи',icon:'meeting',
 ready:()=>true,
 async collect(s,{from,to}){
  let rows=[];try{rows=(s.memory?.prune?.()||[]).filter(r=>isMeeting(r)&&r.at>=from&&r.at<to);}catch{rows=[];}
  const sessions=new Map();
  for(const r of rows){const x=sessions.get(r.sessionId)||{first:r.at,last:r.at,title:''};x.first=Math.min(x.first,r.at);x.last=Math.max(x.last,r.at);if(!x.title&&r.title)x.title=String(r.title).split(' · ')[0];sessions.set(r.sessionId,x);}
  const items=[...sessions.values()].map(x=>{const minutes=Math.max(1,Math.round((x.last-x.first)/60000));return {at:x.first,icon:'meeting',kind:'meeting',title:x.title||'Встреча',detail:'≈ '+minutes+' мин',minutes};});
  return {items};
 }
};
