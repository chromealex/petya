// Language codes for localization files: from file names, folders (values-pt-rBR, de.lproj), CSV headers
// («English», «German [de]», «Русский») and from requests («на немецкий»).
const NAMES={en:'английский',ru:'русский',de:'немецкий',fr:'французский',es:'испанский',it:'итальянский',pt:'португальский',ja:'японский',ko:'корейский',
 zh:'китайский',tr:'турецкий',pl:'польский',uk:'украинский',ar:'арабский',nl:'нидерландский',sv:'шведский',da:'датский',fi:'финский',no:'норвежский',nb:'норвежский',
 cs:'чешский',sk:'словацкий',hu:'венгерский',ro:'румынский',bg:'болгарский',el:'греческий',he:'иврит',hi:'хинди',id:'индонезийский',th:'тайский',vi:'вьетнамский',
 ms:'малайский',fa:'персидский',sr:'сербский',hr:'хорватский',sl:'словенский',lt:'литовский',lv:'латышский',et:'эстонский',ca:'каталанский',kk:'казахский',
 uz:'узбекский',be:'белорусский',az:'азербайджанский',hy:'армянский',ka:'грузинский',fil:'филиппинский',bn:'бенгальский',ta:'тамильский',ur:'урду'};
const ENGLISH={english:'en',russian:'ru',german:'de',french:'fr',spanish:'es',italian:'it',portuguese:'pt',japanese:'ja',korean:'ko',chinese:'zh',turkish:'tr',polish:'pl',
 ukrainian:'uk',arabic:'ar',dutch:'nl',swedish:'sv',danish:'da',finnish:'fi',norwegian:'no',czech:'cs',slovak:'sk',hungarian:'hu',romanian:'ro',bulgarian:'bg',greek:'el',
 hebrew:'he',hindi:'hi',indonesian:'id',thai:'th',vietnamese:'vi',malay:'ms',persian:'fa',
 'chinese (simplified)':'zh-Hans','chinese (traditional)':'zh-Hant','portuguese (brazil)':'pt-BR','spanish (latin america)':'es-419'};
// Request words → code («на немецкий», «немецкого», «по-испански»).
const STEMS=[[/англ/,'en'],[/русск/,'ru'],[/немец|германск/,'de'],[/француз/,'fr'],[/испан/,'es'],[/итальян/,'it'],[/бразил/,'pt-BR'],[/португал/,'pt'],[/японск/,'ja'],
 [/корейск/,'ko'],[/китайск/,'zh'],[/турецк/,'tr'],[/польск/,'pl'],[/украинск/,'uk'],[/арабск/,'ar'],[/нидерланд|голланд/,'nl'],[/шведск/,'sv'],[/датск/,'da'],
 [/финск/,'fi'],[/норвежск/,'no'],[/чешск/,'cs'],[/венгерск/,'hu'],[/румынск/,'ro'],[/греческ/,'el'],[/иврит/,'he'],[/хинди/,'hi'],[/индонезийск/,'id'],[/(?:^|[^\p{L}])тайск/u,'th'],[/вьетнамск/,'vi']];

const base=code=>String(code||'').split('-')[0].toLowerCase();
// Normalizes «pt_BR», «pt-rBR», «b+es+419», «zh-Hans» to BCP-47 like «pt-BR», «es-419»; null when not a language.
function code(value){
 let v=String(value||'').trim();if(!v)return null;
 const b=/^b\+([a-z]{2,3})((?:\+[A-Za-z0-9]{2,8})*)$/.exec(v);if(b)v=b[1]+b[2].replace(/\+/g,'-');
 v=v.replace(/_/g,'-').replace(/-r([A-Z]{2})$/,'-$1');
 const m=/^([a-z]{2,3})((?:-[A-Za-z0-9]{2,8})*)$/i.exec(v);if(!m||!NAMES[m[1].toLowerCase()])return null;
 return m[1].toLowerCase()+m[2].split('-').filter(Boolean).map(p=>'-'+(p.length===2?p.toUpperCase():p.length===4?p[0].toUpperCase()+p.slice(1).toLowerCase():p)).join('');
}
// A CSV/TSV column header: «German», «German [de]», «English(en)», «de», «Немецкий».
function header(value){
 const v=String(value||'').trim();
 const inner=/[[(]([A-Za-z_-]{2,12})[\])]\s*$/.exec(v);if(inner&&code(inner[1]))return code(inner[1]);
 const direct=code(v);if(direct)return direct;
 const english=ENGLISH[v.toLowerCase()];if(english)return english;
 const russian=Object.entries(NAMES).find(([,name])=>name===v.toLowerCase());if(russian)return russian[0];
 return null;
}
// Languages named in a request.
function requested(text){
 const out=[],t=String(text||'').toLowerCase();
 for(const [re,c] of STEMS)if(re.test(t)&&!out.includes(c)&&!(c==='pt'&&out.includes('pt-BR')))out.push(c);
 return out;
}
const name=c=>NAMES[base(c)]?NAMES[base(c)]+(c.includes('-')?' ('+c+')':''):c;
// «de» matches «de-DE» and the other way round; «pt-BR» does not match «pt-PT».
const same=(a,b)=>a===b||base(a)===base(b)&&(!a.includes('-')||!b.includes('-'));
module.exports={code,header,requested,name,base,same,NAMES};
