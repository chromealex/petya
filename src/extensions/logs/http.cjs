// «Логи сервера», shared HTTP bits of the Loki and Elasticsearch sources: the base URL check, auth headers and
// errors told apart (no access, wrong address, the service down). Requests go through Petya's `s.request`.
function base(value){
 const raw=String(value||'').trim();
 if(!raw)return '';
 let u;try{u=new URL(raw);}catch{return '';}
 if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.search||u.hash)return '';
 return (u.origin+u.pathname).replace(/\/+$/,'');
}
const basic=(user,password)=>'Basic '+Buffer.from(String(user)+':'+String(password)).toString('base64');
function explain(name,error,{where}={}){
 const status=error?.status;
 const map={401:name+' не принял ключ или пароль. Проверьте их в настройках «Логи сервера».',403:'У ключа '+name+' нет прав на чтение'+(where?' '+where:'')+'.',404:name+' не нашёл адрес API'+(where?' или '+where:'')+'. Проверьте URL в настройках.',429:name+' ограничил число запросов. Повторите через минуту.'};
 let message=map[status];
 if(!message&&status===400)message=name+' отклонил запрос'+(error.detail?': '+String(error.detail).replace(/\s+/g,' ').slice(0,240):'.');
 if(!message&&status>=500)message=name+' ответил ошибкой сервера (HTTP '+status+').';
 if(!message&&/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed|ETIMEDOUT|timeout|aborted/i.test(String(error?.code||'')+' '+String(error?.message||'')+' '+String(error?.cause?.code||'')))message=name+' недоступен: проверьте адрес и сеть (VPN).';
 const e=Error(message||error?.message||name+' недоступен.');e.status=status;e.cause=error;return e;
}
module.exports={base,basic,explain};
