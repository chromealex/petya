// When to offer «Объясни график»: «почему упал график», «объясни этот график», «что за провал на графике». A metric
// that moved («почему просел DAU») is offered only with a chart word: without the app the chat model answers that.
// Not this: failed builds, servers, crashing games or containers, «график отпусков/работы», «нарисуй график».
const q=require('./query.cjs');
module.exports={
 id:'chart-explain',name:'Объясни график',
 pitch:'объясню, почему изменился график: найду день, когда он упал или вырос, и сопоставлю с релизами, инцидентами, крэшами, кампаниями и праздниками — каждую причину с датой',
 names:[],
 topics:[new RegExp('(?:'+q.WHY.source+')[\\s\\S]*(?:'+q.CHART.source+')','iu'),q.EXPLAIN],
 avoid:[q.ELSEWHERE],
 requests:[/(?:почему|объясни|отчего|что за|что на|из-за чего)/iu],
 connect:'install',
 ready:settings=>settings['extension_chart-explain']==='true'
};
