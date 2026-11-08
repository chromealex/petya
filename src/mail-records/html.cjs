// Mail HTML for record extraction: the schema.org JSON-LD blocks a sender put in (Gmail markup:
// <script type="application/ld+json">), and readable text with line breaks where the layout had rows and cells.
// Nothing is rendered or fetched; scripts and styles are dropped, entities decoded.
const ENTITIES={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",laquo:'«',raquo:'»',mdash:'—',ndash:'–',hellip:'…',euro:'€',pound:'£',yen:'¥',copy:'©',reg:'®',trade:'™',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',bull:'•',middot:'·',thinsp:' ',ensp:' ',emsp:' ',zwnj:'',zwj:''};
const decode=s=>String(s||'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?(()=>{const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return Number.isFinite(n)&&n>0&&n<0x110000?String.fromCodePoint(n):'';})():ENTITIES[e.toLowerCase()]??m);
function text(html){
 return decode(String(html||'')
  .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi,' ')
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h\d|table|section|article|header|footer|blockquote)>/gi,'\n')
  .replace(/<\/t[dh]>/gi,'\t')
  .replace(/<[^>]+>/g,' '))
  .replace(/[ \t\u00a0]*\t[ \t\u00a0]*/g,'\t').replace(/[ \u00a0\u200b]+/g,' ').replace(/[ \t]*\n[ \t]*/g,'\n').replace(/\n{2,}/g,'\n').trim();
}
// Every JSON-LD object in the HTML (arrays and @graph flattened); broken blocks are skipped.
function jsonld(html){
 const out=[];
 for(const m of String(html||'').matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)){
  let data;try{data=JSON.parse(decode(m[1].trim().replace(/^<!--|-->$/g,'')));}catch{continue;}
  const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(Array.isArray(v['@graph']))v['@graph'].forEach(walk);else out.push(v);}};
  walk(data);
 }
 return out.slice(0,20);
}
module.exports={text,jsonld,decode};
