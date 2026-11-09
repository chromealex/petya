// «Почта» in Petya's request pipeline (chat-route, src/features/chat-routes.cjs): teaching a mail rule («Научись
// проверять почту»), a saved rule's phrase, «проверь почту». It answers at the place Petya's core used to (after web
// search, before Petya's own shortcuts), so the order of handlers stays as it was.
module.exports={id:'mail',turn:(s,command)=>s.mail?s.mail.turn(command):null};
