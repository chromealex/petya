// ANR as a chat subject (dialogue-kind, src/features/dialogue-kinds.cjs): «ANR за неделю», «что в Google Play» are
// read from Android vitals by the Google Play reader (client.cjs `read`) and answered in the open chat, which keeps
// the kind for follow-ups («обнови», «а за вчера?»). Google Play named with crashes is «Крэши»'s subject (its Android
// vitals crash source), not this one. Moved from Petya's core (the «anr» reader and kind of src/dialogue.cjs).
const ANR=/(?:\banr\b|анр)/iu;
module.exports={
 id:'anr',title:'ANR в Google Play',by:'Google Play: ANR',label:'запрос к Google Play',service:'googleplay',
 router:'проверить зависания Android/ANR в Google Play.',
 routerNote:'Общий вопрос «что такое ANR», отрицание и цитата — chat.',
 detect:text=>ANR.test(text)||/google play|гугл пл[еэ]й/iu.test(text)&&!/кр[эеа]ш|crash|падени|вылет/iu.test(text),
 read:(s,command,topic,context)=>require('./feature.cjs').reader(s).read(command,topic,context)
};
