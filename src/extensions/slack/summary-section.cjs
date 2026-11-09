// Slack's section of the daily summary «Что у нас сегодня?» (summary-section, src/summary-sections.cjs): how many Slack
// records Petya saved today, and where to read them. Only while Slack is added; it reads Petya's saved materials, not
// Slack itself, so it never waits for the network.
module.exports={
 id:'slack',title:'Slack',order:20,
 async collect(s,{from,to}){
  const contexts=s.memory?.prune?.()||[];
  const messages=contexts.filter(c=>/slack/iu.test(c.source||'')).flatMap(c=>c.messages?.map(m=>({at:m.at}))||[{at:c.at}]).filter(c=>c.at>=from&&c.at<=to);
  return {lines:['Сохранённых записей за сегодня: '+messages.length+'.',...messages.length?['Обсуждения доступны в разделе «Материалы».']:[]]};
 }
};
