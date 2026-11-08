// Team photos: the profile picture a service gave (Slack first, then Jira) is downloaded once and kept on the
// card as a small data URL, so the page never loads images from the network. Only known image hosts are used.
const HOSTS=[/(^|\.)slack-edge\.com$/,/(^|\.)slack\.com$/,/(^|\.)gravatar\.com$/,/(^|\.)atl-paas\.net$/,/(^|\.)atlassian\.net$/,/(^|\.)atlassian\.com$/];
const MAX_BYTES=512*1024,SIZE=64,LIMIT=40;
const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&HOSTS.some(h=>h.test(u.hostname));}catch{return false;}};
function toPhoto(nativeImage,bytes){
 if(!bytes?.length||bytes.length>MAX_BYTES)return '';
 const image=nativeImage.createFromBuffer(Buffer.from(bytes));if(image.isEmpty())return '';
 const value=image.resize({width:SIZE,height:SIZE,quality:'good'}).toDataURL();
 return /^data:image\/png;base64,/.test(value)&&value.length<=60000?value:'';
}
async function download(url){
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 if(!/^image\//.test(response.headers.get('content-type')||''))throw Error('Не изображение');
 return Buffer.from(await response.arrayBuffer());
}
// Fills `photo` for cards without one; returns how many were added. Failures are skipped quietly.
async function fill(members,{nativeImage,get=download}={}){
 if(!nativeImage)return 0;let added=0;
 const todo=members.filter(m=>!m.photo&&!m.photoSource&&[m.accounts?.slack?.image,m.accounts?.jira?.image].some(u=>u&&allowed(u))).slice(0,LIMIT);
 for(let i=0;i<todo.length;i+=4)await Promise.all(todo.slice(i,i+4).map(async m=>{
  for(const url of [m.accounts?.slack?.image,m.accounts?.jira?.image].filter(u=>u&&allowed(u))){
   try{const photo=toPhoto(nativeImage,await get(url));if(photo){m.photo=photo;added++;return;}}catch{}
  }
 }));
 return added;
}
// Pictures to choose from in the team card: every service photo of the person.
async function options(accounts,{nativeImage,get=download}={}){
 const out=[];for(const [service,entry] of Object.entries(accounts||{})){const url=entry?.image;if(!url||!allowed(url))continue;
  try{const photo=toPhoto(nativeImage,await get(url));if(photo)out.push({service,photo});}catch{}}
 return out;
}
// A picture from the user's computer (any size; cropped to a square in the middle).
function fromFile(nativeImage,bytes){
 if(!bytes?.length||bytes.length>10*1024*1024)throw Error('Картинка больше 10 МБ.');
 let image=nativeImage.createFromBuffer(Buffer.from(bytes));if(image.isEmpty())throw Error('Не получилось открыть картинку. Подойдут PNG и JPG.');
 const {width,height}=image.getSize(),side=Math.min(width,height);image=image.crop({x:Math.floor((width-side)/2),y:Math.floor((height-side)/2),width:side,height:side});
 const value=image.resize({width:SIZE,height:SIZE,quality:'best'}).toDataURL();if(value.length>60000)throw Error('Картинка слишком сложная, выберите другую.');return value;
}
module.exports={fill,allowed,toPhoto,options,fromFile};
