// Google Play plugin: turns the ANR reader's rows into card data (message.extensionData.playVitals).
const {metric}=require('./client.cjs');
const date=t=>t&&`${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`;
function extract(result){
  const d=result?.data;
  if(!d||typeof d.app!=='string'||!/^apps\//.test(d.app)||!Array.isArray(d.rows)||!('perceived' in d))return null;
  const days=d.rows.map(row=>({date:date(row.startTime),rate:metric(row,'anrRate'),perceived:metric(row,'userPerceivedAnrRate')})).filter(r=>r.date).sort((a,b)=>a.date.localeCompare(b.date)).slice(-31);
  return {playVitals:{app:String(result.title||'').replace(/^ANR · /,'').slice(0,120)||d.app.replace(/^apps\//,''),date:d.date,versionCode:d.versionCode||null,rate:d.rate,perceived:d.perceived,week:d.week,days}};
}
module.exports={id:'google-play',extract,describe:()=>[],async perform(){throw Error('Нет действий.');}};
