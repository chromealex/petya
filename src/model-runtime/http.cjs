// Private loopback transport. Avoid the bundled fetch socket-QoS crash on macOS.
const http=require('node:http'),{Readable}=require('node:stream');
function runtimeFetch(address,{method='GET',headers,body,signal,redirect}={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(address);
  if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||
     !((url.pathname==='/api/tags'&&method==='GET'&&body===undefined)||
       (['/api/chat','/api/cancel'].includes(url.pathname)&&method==='POST'&&typeof body==='string'))||redirect!=='error')
   throw Error('Недопустимый запрос к локальной модели.');
  const request=http.request(url,{method,headers:{...Object.fromEntries(new Headers(headers)),...(body===undefined?{}:{'Content-Length':Buffer.byteLength(body)})},signal,agent:false},response=>{
   try{
    // Keep the standard stream interface used by answer-stream.consume and cancellation.
    resolve(new Response(Readable.toWeb(response),{status:response.statusCode}));
   }catch(error){response.destroy();reject(error);}
  });
  request.on('error',reject);
  request.end(body);
 });
}
module.exports={runtimeFetch};
