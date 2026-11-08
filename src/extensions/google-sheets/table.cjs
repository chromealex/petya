// Tables as the card and other apps see them: a rectangular grid of formatted text plus the raw numbers, the header
// row found by the data (a row of distinct labels above rows that hold numbers or differ in type), search by word
// stems, and matching of spoken names («таблица баланса», «лист Юниты») against spreadsheet and tab titles.
const MAX_ROWS=300,MAX_COLS=30;

const isNumber=v=>typeof v==='number'&&Number.isFinite(v);
const blank=v=>v===undefined||v===null||String(v).trim()==='';

// formatted: rows of strings (FORMATTED_VALUE); raw: the same rows unformatted (numbers stay numbers).
function grid(formatted,raw=[],{rows=MAX_ROWS,cols=MAX_COLS}={}){
 const height=Math.min(rows,Math.max(formatted.length,raw.length));
 let width=0;for(let r=0;r<height;r++)width=Math.max(width,(formatted[r]||[]).length,(raw[r]||[]).length);
 width=Math.min(cols,width);
 const text=[],numbers=[];
 for(let r=0;r<height;r++){
  const t=[],n=[];
  for(let c=0;c<width;c++){
   const f=formatted[r]?.[c],v=raw[r]?.[c];
   t.push(f===undefined||f===null?(v===undefined||v===null?'':String(v)):String(f).slice(0,500));
   n.push(isNumber(v)?v:null);
  }
  text.push(t);numbers.push(n);
 }
 // Trailing empty rows are not data.
 while(text.length&&text.at(-1).every(blank)){text.pop();numbers.pop();}
 return {text,numbers,width};
}

// The header row: within the first rows, the first one whose cells are mostly non-empty, distinct, non-numeric
// labels, followed by a row with numbers or a different shape. `frozen` (frozenRowCount) is a strong hint.
function header(text,numbers,{frozen=0}={}){
 const labels=r=>{const row=text[r]||[],filled=row.filter(v=>!blank(v));if(filled.length<Math.max(1,Math.ceil(row.length*0.5)))return false;
  if(row.some((v,c)=>numbers[r]?.[c]!==null&&numbers[r]?.[c]!==undefined))return false;
  return new Set(filled.map(v=>v.trim().toLocaleLowerCase())).size===filled.length;};
 if(frozen>0&&frozen<=5&&labels(frozen-1))return frozen-1;
 for(let r=0;r<Math.min(5,text.length-1);r++){
  if(!labels(r))continue;
  const below=text.slice(r+1,r+6);
  const typed=below.some((row,i)=>(numbers[r+1+i]||[]).some(n=>n!==null));
  if(typed||below.length&&!labels(r+1))return r;
 }
 return -1;
}
// Whether a column holds numbers (most of its filled cells under the header).
function numericColumns(text,numbers,head){
 const out=[];const width=text[0]?.length||0;
 for(let c=0;c<width;c++){let filled=0,num=0;for(let r=head+1;r<text.length;r++){if(blank(text[r][c]))continue;filled++;if(numbers[r]?.[c]!==null&&numbers[r]?.[c]!==undefined)num++;}out.push(filled>0&&num/filled>=0.8);}
 return out;
}

// Russian word stems for matching «лучника» to «Лучник», «баланса» to «Баланс»: lower case, ё → е, endings off.
const ENDINGS=/(?:ами|ями|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ую|юю|ам|ям|ом|ем|у|ю|а|я|ы|и|е|о|ь)$/u;
function stem(word){let w=String(word||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}_-]/gu,'');if(w.length>4)w=w.replace(ENDINGS,'');return w;}
const words=text=>String(text||'').split(/[^\p{L}\p{N}_-]+/u).filter(w=>w.length>1);
// A cell matches a query word when one of its words starts with the query's stem (case and endings aside).
function matches(cellText,query){
 const q=words(query).map(stem).filter(w=>w.length>=2);if(!q.length)return false;
 const cw=words(cellText).map(w=>w.toLocaleLowerCase().replace(/ё/g,'е'));
 return q.every(s=>cw.some(w=>w.startsWith(s)));
}
function search(text,query,{head=-1,limit=50}={}){
 const out=[];
 for(let r=head+1;r<text.length&&out.length<limit;r++)for(let c=0;c<text[r].length;c++)if(text[r][c]&&matches(text[r][c],query)){out.push({row:r,col:c,value:text[r][c]});break;}
 return out;
}
// How well spoken words name a title: share of the title's stems found among the words (0..1).
function nameScore(spoken,title){
 const t=words(title).map(stem).filter(w=>w.length>=3);if(!t.length)return 0;
 const s=new Set(words(spoken).map(stem));
 let hit=0;for(const w of t)if([...s].some(x=>x.length>=3&&(x.startsWith(w)||w.startsWith(x))))hit++;
 return hit/t.length;
}
module.exports={grid,header,numericColumns,search,matches,stem,words,nameScore,isNumber,blank,MAX_ROWS,MAX_COLS};
