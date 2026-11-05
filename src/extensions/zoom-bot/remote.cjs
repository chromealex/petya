const DEFAULT_URL='https://auth.petya-app.ru/zoom-bot';
function createRemote({settings,bot,fetcher=fetch}){
 return async(method,route,data)=>{
  const owner=bot(),config=settings();
  let connection=owner.state.connection;
  if(!connection){
   connection={url:config.zoomBotUrl||DEFAULT_URL,credential:config.zoomBotCredential||config.zoomCredential,oauthCredential:config.zoomCredential};
   if(!connection.credential)throw Error('Войдите в Zoom в настройках подключения Пети.');
   // Persist with the encrypted meeting state before the first external write.
   // Reauthorization must not change the identity used to poll an existing job.
   owner.publish({connection});
  }
  const url=new URL(connection.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Сервис Zoom должен использовать HTTPS.');
  if(route==='/v1/bots'&&method==='POST'){
   if(!connection.oauthCredential)throw Error('Войдите в Zoom в настройках подключения Пети.');
   data={...data,oauthCredential:connection.oauthCredential};
  }
  const response=await fetcher(connection.url.replace(/\/$/,'')+route,{method,headers:{Authorization:'Bearer '+connection.credential,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok){
   const message=response.status===404?'Предыдущее подключение недоступно после повторного входа в Zoom. Нажмите «Повторить», чтобы подключиться с текущим аккаунтом.':response.status===409?'Предыдущее подключение Zoom ещё завершается. Повторите подключение позже.':response.status===503?'Сервис Zoom ещё не готов: требуется приложение Zoom и Meeting SDK.':'Сервис Zoom вернул HTTP '+response.status;
   throw Object.assign(Error(message),{code:response.status===404?'ZOOM_JOB_UNAVAILABLE':'ZOOM_HTTP_ERROR'});
  }
  const text=await response.text();if(text.length>10*1024*1024)throw Error('Слишком большой ответ сервиса Zoom.');return JSON.parse(text);
 };
}
module.exports={createRemote,DEFAULT_URL};
