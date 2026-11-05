const {z}=require('zod');
const schema=z.object({url:z.string().url().max(2048)}).strict();
function source(input){
 const {url}=schema.parse(input),u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password)throw Error('Нужна HTTPS-ссылка на макет.');
 let match;
 if(['figma.com','www.figma.com'].includes(u.hostname)&&(match=/^\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/|$)/.exec(u.pathname))){
  const id=u.searchParams.get('node-id')?.replace('-',':');
  if(!/^\d+:\d+$/.test(id||''))throw Error('В Figma выберите фрейм и скопируйте ссылку с node-id.');
  return {provider:'figma',url,endpoint:'https://api.figma.com/v1/files/'+match[1]+'/nodes?ids='+encodeURIComponent(id),id};
 }
 if(u.hostname==='app.zeplin.io'&&(match=/^\/project\/([a-zA-Z0-9]+)\/screen\/([a-zA-Z0-9]+)\/?$/.exec(u.pathname)))
  return {provider:'zeplin',url,endpoint:'https://api.zeplin.dev/v1/projects/'+match[1]+'/screens/'+match[2]+'/versions/latest'};
 throw Error('Нужна ссылка на фрейм Figma или экран Zeplin.');
}
async function read(ref,token,request=fetch){
 const response=await request(ref.endpoint,{headers:ref.provider==='figma'?{'X-Figma-Token':token}:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(ref.provider+' · HTTP '+response.status+'. Проверьте токен и доступ к макету.');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5000000)throw Error('Макет слишком большой. Выберите меньший фрейм.');parts.push(Buffer.from(value));}}
 finally{await reader.cancel();}
 const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
 if(ref.provider==='figma'){
  const node=data.nodes?.[ref.id]?.document;
  if(!node)throw Error('Фрейм не найден или недоступен.');
  return node;
 }
 if(!Array.isArray(data.layers)||!Number.isFinite(data.width)||!Number.isFinite(data.height))throw Error('Zeplin не вернул размеры и слои экрана.');
 return {name:'Zeplin',rect:{x:0,y:0,width:data.width,height:data.height},layers:data.layers};
}
module.exports={source,read,schema};
