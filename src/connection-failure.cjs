function classify(error) {
  const text=String(error?.message||error);
  const status=Number(error?.status || text.match(/HTTP\s+(\d{3})/i)?.[1]);
  if(status===429 || /ratelimited|rate.limit|ограничил запросы/i.test(text)) {
    const delay=text.match(/через (\d+)\s*с/i)?.[1];
    return {reason:'limited',action:'retry',message:'Сервис ограничил запросы.'+(delay?' Повторите через '+delay+' с.':' Попробуйте позже.')};
  }
  if(status===403 || /missing_scope|insufficient_scope/i.test(text))
    return {reason:'permissions',action:'login',message:'Недостаточно прав для этого запроса. Проверьте права учётной записи и разрешения приложения.'};
  if(status===401 || /token_revoked|invalid_auth|invalid_grant|token_expired|invalid.token|not_authed/i.test(text))
    return {reason:'auth',action:'login',message:'Нужно войти снова.'};
  if(/ENETUNREACH|ERR_INTERNET_DISCONNECTED|нет сети/i.test(text+' '+error?.cause?.code))
    return {reason:'offline',action:'retry',message:'Нет сети.'};
  if(/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(text))
    return {reason:'unavailable',action:'retry',message:'Сервис недоступен.'};
  return null;
}
module.exports={classify};
