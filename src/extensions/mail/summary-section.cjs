// The closing line of the daily summary «Что у нас сегодня?» (summary-section, src/summary-sections.cjs): the summary
// does not read letters or the calendar, so it says so while «Почта» is added. Petya's core summary names no service.
module.exports={
 id:'mail',title:'Почта и календарь',order:900,
 collect:()=>({lines:['Это не полная сводка почты и календаря: эти источники пока не подключены к сценарию.']})
};
