// What the Notion card saves and checks (connection-check, src/features/connection-checks.cjs): the manual token, and
// one page search that changes nothing. Moved from Petya's core (src/connections.cjs). With the browser sign-in the
// token is empty and Petya's client signs the request (src/service-oauth.cjs).
module.exports={
 service:'notion',fields:['notionToken'],guide:'https://www.notion.so/my-integrations',
 configured:settings=>!!(settings.notionToken||settings.notionCredential),
 async check(s,request){
  const need=(value,name)=>{if(!value)throw Error('Укажите '+name+'.');return value;};
  const headers={Authorization:'Bearer '+(s.notionCredential?'':need(s.notionToken,'Notion token')),'Notion-Version':'2025-09-03','Content-Type':'application/json'};
  const data=await request('https://api.notion.com/v1/search',{method:'POST',headers,body:JSON.stringify({filter:{value:'page',property:'object'},page_size:1})});
  if(!Array.isArray(data.results))throw Error('Notion вернул неожиданный ответ.');
  return {message:data.results.length?'Доступ к поиску страниц проверен.':'Авторизация проверена. Доступных страниц пока нет — добавьте интеграцию в Connections нужных страниц.',ready:!!data.results.length};
 }
};
