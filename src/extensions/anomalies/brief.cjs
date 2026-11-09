// «Аномалии» as a part of the morning brief (src/features/morning-brief.cjs `addPart`): yesterday's anomalies with the
// same card, read from the daily check's cache when it already ran. A quiet day says so in one line; a day without
// data says the data is missing. Nothing while the app is not added or no source is connected.
const feeds=require('./feeds.cjs');
const ready=services=>services.settings?.extension_anomalies==='true'&&feeds.connected(services).length>0;
async function part(services,now=new Date()){
 if(!ready(services))return null;
 const feature=require('./feature.cjs');
 const card=await feature.check(services,{days:1,now});
 return {by:'Аномалии',text:feature.summary(card),data:{anomalies:card}};
}
module.exports={part,ready};
