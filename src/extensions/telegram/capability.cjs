// The tool router's capability (src/capabilities.cjs) while Telegram is added: «обнови телеграм» (route-sync.cjs).
module.exports={id:'telegram-sync',says:'обновить сообщения Telegram',examples:['обнови телеграм'],services:['telegram','тг'],
 accepts:t=>require('./route-sync.cjs').SYNC.test(String(t).trim())};
