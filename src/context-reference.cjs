// Conversational references are requests to inspect existing context, never commands to execute it.
function isContextReference(text) {
 const value=String(text).trim().replace(/^петя[\s,!:—-]+/iu,'');
 return /^(?:(?:ну|давай|пожалуйста)\s+)*(?:(?:посмотри|глянь|гляди|зацени|разбери|объясни|изучи|проверь)(?:-ка)?|можешь\s+(?:посмотреть|глянуть|разобрать|объяснить|проверить))\s+(?:(?:вот|на)\s+)*(?:это|эту\s+(?:фигню|штуку|ерунду|хрень|проблему|ошибку)|этот\s+(?:лог|тред|файл)|что\s+тут)(?=$|[\s,.!?])/iu.test(value);
}
function referenceTarget({pending,topic,slack,now=Date.now()}) {
 if(pending)return 'attachments';
 if(topic&&(topic.attachments?.length||topic.messages?.length)&&now-topic.at<10*60000)return 'topic';
 return slack?'slack':'clarify';
}
module.exports={isContextReference,referenceTarget};
