// A Zoom join link: https://<host>.zoom.us|zoom.com/j/<9–11 digits> (or /wc/join/…), the passcode kept.
function parseJoinURL(value){
 let u;try{u=new URL(value);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)zoom\.(us|com)$/.test(u.hostname))return null;
 const match=u.pathname.match(/^\/(?:j|wc\/join)\/(\d{9,11})\/?$/);if(!match)return null;
 const url=new URL('https://'+u.hostname+'/j/'+match[1]);const pwd=u.searchParams.get('pwd');if(pwd)url.searchParams.set('pwd',pwd);
 return {meetingId:match[1],url:url.href,password:''};
}
module.exports={parseJoinURL};
