// One shape for every ad source: network, format and platform names as the card shows them, numbers that may
// arrive as strings. Sources map their own spellings here so the analysis never knows a service.
const number=v=>{const n=typeof v==='string'?Number(v.replace(/,/g,'')):Number(v);return Number.isFinite(n)&&n>=0?n:0;};

// Ad formats: AppLovin INTER/REWARD/BANNER/MREC/NATIVE/APPOPEN, LevelPlay Rewarded/Interstitial/Banner/Offerwall.
const FORMATS=[[/^(?:reward(?:ed)?[ _-]?inter\p{L}*)$/iu,'rewarded_interstitial'],[/^reward/iu,'rewarded'],[/^inter/iu,'interstitial'],[/^banner|^leader/iu,'banner'],
 [/^mrec|^medium/iu,'mrec'],[/^native/iu,'native'],[/^app[ _-]?open/iu,'appopen'],[/^offer[ _-]?wall/iu,'offerwall']];
function format(v){const t=String(v||'').trim();for(const [r,id] of FORMATS)if(r.test(t))return id;return t.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,40)||'other';}

function platform(v){const t=String(v||'').toLowerCase();return /ios|iphone|ipad|apple/.test(t)?'ios':/android|google/.test(t)?'android':/fire/.test(t)?'fireos':t.slice(0,20)||'';}

// Ad networks under one display name whichever service reported them.
const NETWORKS=[[/applovin/i,'AppLovin'],[/admob|google|ad ?manager|gam(?:_|$)/i,'Google AdMob'],[/unity|^ironsource|^is_?ads|ironsourceads/i,'Unity / ironSource'],[/facebook|meta|audience/i,'Meta Audience Network'],
 [/mintegral/i,'Mintegral'],[/pangle|bytedance|tiktok/i,'Pangle'],[/vungle|liftoff/i,'Liftoff'],[/inmobi/i,'InMobi'],[/chartboost/i,'Chartboost'],[/fyber|dt[ _]?exchange|digital ?turbine/i,'DT Exchange'],
 [/moloco/i,'Moloco'],[/bidmachine/i,'BidMachine'],[/yandex/i,'Yandex Ads'],[/mytarget|my_target|vk ?ads/i,'VK Ads'],[/verve|pubnative/i,'Verve'],[/smaato/i,'Smaato'],[/hyprmx/i,'HyprMX'],[/ogury/i,'Ogury'],[/amazon|aps(?:_|$)/i,'Amazon'],[/bigo/i,'Bigo Ads'],[/yso/i,'YSO']];
function network(v){
 const t=String(v||'').trim();
 for(const [r,name] of NETWORKS)if(r.test(t))return name;
 // Unknown names: «SOME_NETWORK_BIDDING» → «Some»; camelCase → words.
 const plain=t.replace(/_(?:network|bidding|exchange|mediation|sdk)\b/gi,'').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim();
 return plain?plain.length<=3?plain.toUpperCase():plain.toLowerCase().replace(/(^|\s)\p{L}/gu,m=>m.toUpperCase()).slice(0,40):'Другие';
}
module.exports={number,format,platform,network,FORMATS};
