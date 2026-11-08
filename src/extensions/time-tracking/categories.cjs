// Which category a span counts as: work, meetings, communication or other. The user's own mapping
// (`timeTrackingCategories`, {"<app name, lower case>": "<category>"}, changed from the card) wins; then a category
// a classifier gave the span; then the defaults below by app name and, for browsers, by the page title.
const IDS=['work','meetings','communication','other'];
const LABELS={work:'Работа',meetings:'Встречи',communication:'Общение',other:'Другое'};
const COLORS={work:'#7fb894',meetings:'#d9a35f',communication:'#7aa6d8',other:'#8c8f96'};
const {isBrowser}=require('../../activity/redact.cjs');
const RULES=[
 ['meetings',/^(?:zoom|zoom\.us|zoom workplace|microsoft teams|teams|webex|cisco webex|skype|google meet|facetime|телемост|контур\.толк|jitsi)/i],
 ['communication',/^(?:slack|telegram|discord|whatsapp|viber|signal|mattermost|element|outlook|mail|почта|thunderbird|spark|mimestream|messages|сообщения|яндекс мессенджер|vk messenger|пачка|pachca)/i],
 ['work',/^(?:unity|unity hub|unity editor|unreal|unrealeditor|godot|visual studio|visual studio code|code|cursor|rider|intellij idea|pycharm|webstorm|clion|goland|android studio|xcode|fork|sourcetree|github desktop|gitkraken|terminal|iterm2?|windows terminal|powershell|warp|blender|maya|3ds max|houdini|substance|photoshop|illustrator|figma|aseprite|krita|spine|fmod|wwise|audacity|reaper|excel|word|powerpoint|numbers|pages|keynote|notion|obsidian|confluence|jira|postman|insomnia|docker desktop|петя)/i]
];
const PAGES=[
 ['meetings',/(?:^|[\s|–—-])(?:meet(?:\s|$)|google meet|zoom meeting|microsoft teams|телемост)/i],
 ['communication',/(?:gmail|outlook|почта|inbox|входящие|slack|telegram|whatsapp|discord)/i],
 ['work',/(?:jira|confluence|github|gitlab|bitbucket|stack overflow|stackoverflow|docs\.unity|unity documentation|figma|google (?:docs|sheets|slides)|документы google|таблицы google|notion|miro|sentry|firebase|app store connect|google play console|appmetrica|localhost)/i],
 ['other',/(?:youtube|twitch|netflix|кинопоиск|reddit|vk\.com|вконтакте|instagram|twitter|(?:^|\s)x\.com|facebook|habr|pikabu|новости|news)/i]
];
function parse(value){try{const m=JSON.parse(value||'{}');return m&&typeof m==='object'&&!Array.isArray(m)?Object.fromEntries(Object.entries(m).filter(([k,v])=>typeof k==='string'&&IDS.includes(v)).slice(0,200)):{};}catch{return {};}}
const key=app=>String(app||'').trim().toLocaleLowerCase().slice(0,80);
function of(span,mapping){
 const own=mapping[key(span.app)];if(own)return own;
 if(IDS.includes(span.category))return span.category;
 const app=String(span.app||'').trim();
 if(isBrowser(app)){for(const [id,re] of PAGES)if(re.test(span.title||''))return id;return 'other';}
 for(const [id,re] of RULES)if(re.test(app))return id;
 return 'other';
}
// For the settings `validate`: a well-formed mapping that fits the setting.
function validate(next){
 if(next.timeTrackingCategories===undefined)return;
 const m=parse(next.timeTrackingCategories);
 next.timeTrackingCategories=JSON.stringify(m);
 if(next.timeTrackingCategories.length>2000)throw Error('Слишком много своих категорий в «Учёте времени».');
}
module.exports={IDS,LABELS,COLORS,parse,of,key,validate};
