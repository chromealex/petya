// Only current meeting metadata is eligible; never scan chat history or clipboard.
function parseJoinURL(value){
 let u;try{u=new URL(value);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)zoom\.(us|com)$/.test(u.hostname))return null;
 const match=u.pathname.match(/^\/(?:j|wc\/join)\/(\d{9,11})\/?$/);if(!match)return null;
 const url=new URL('https://'+u.hostname+'/j/'+match[1]);const pwd=u.searchParams.get('pwd');if(pwd)url.searchParams.set('pwd',pwd);
 return {meetingId:match[1],url:url.href,password:''};
}
function fromObservation(state){
 if(!state.meetingActive&&!require('../../meeting-monitor.cjs').hasMeeting(state))return null;
 const text=String(state.meetingInfo||'');
 const urls=[...new Map((text.match(/https:\/\/[^\s<>"']+/g)||[]).map(s=>parseJoinURL(s)).filter(Boolean).map(x=>[x.meetingId,x])).values()];
 const ids=[...new Set([...text.matchAll(/(?:meeting\s*id|идентификатор\s*конференции)\s*[:：]?\s*((?:\d[ -]?){9,11})(?!\d)/giu)].map(m=>m[1].replace(/\D/g,'')))];
 if(urls.length>1||ids.length>1||urls.length&&ids.length&&urls[0].meetingId!==ids[0])throw Error('Zoom показал несколько встреч. Не удалось однозначно определить текущую.');
 if(urls.length)return urls[0];
 if(ids.length===1){const password=text.match(/(?:passcode|код\s*доступа|пароль\s*конференции)\s*[:：]?\s*([^\s]{1,100})/iu)?.[1]||'';return {meetingId:ids[0],url:'https://zoom.us/j/'+ids[0],password};}
 return null;
}
module.exports={parseJoinURL,fromObservation};
