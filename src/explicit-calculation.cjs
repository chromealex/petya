// Only fully specified integer calculations. No eval, service facts or inferred operands.
// Spoken operators between two numbers: «17 умножить на 23», «100 разделить на 4», «17 на 23»,
// and verb-first forms «умножь 17 на 23», «раздели 100 на 4», «сложи 2 и 3», «вычти 5 из 9».
function spokenOperators(text){
 let s=text.replace(/^(?:петя[\s,]+)?(умножь|помножь|раздели|подели|сложи|вычти)\s+(\d+)\s+(?:на|и|из)\s+(\d+)([?!.]*)$/iu,(_,verb,a,b,end)=>{const v=verb.toLowerCase();return 'посчитай '+(v==='вычти'?b+'-'+a:a+({умножь:'*',помножь:'*',раздели:'/',подели:'/',сложи:'+'})[v]+b)+end;});
 const ops=[[/(?:разделить|раздели|поделить|подели|делить|делённое|деленное)\s+на/giu,'/'],[/(?:умножить|умножь|помножить|помножь|умноженное)\s+на/giu,'*'],[/(?:плюс|прибавить|прибавь)/giu,'+'],[/(?:минус|отнять|вычесть)/giu,'-']];
 for(const [word,op] of ops)s=s.replace(new RegExp('(\\d)\\s*'+word.source+'\\s*(?=\\d)','giu'),'$1'+op);
 return s.replace(/(\d)\s+на\s+(?=\d)/giu,'$1*');
}
// Percent of a number, square root and power: «15% от 2400», «корень из 144», «2 в степени 10».
function special(text){
 const t=text.replace(/^(?:петя[\s,]+)?(?:сколько (?:будет|получится)|вычисли|посчитай|чему равн\p{L}*)\s*/iu,'').replace(/[?!.]+$/u,'').replace(/\s*ответь только числом$/iu,'').trim();
 const n=v=>Number(String(v).replace(',','.'));
 const out=v=>Number.isFinite(v)?String(Math.round(v*10000)/10000).replace('.',','):null;
 let m=/^(\d+(?:[.,]\d+)?)\s*(?:%|процент(?:а|ов)?)\s+от\s+(\d+(?:[.,]\d+)?)$/iu.exec(t);if(m)return out(n(m[1])*n(m[2])/100);
 m=/^(?:квадратный\s+)?корень(?:\s+квадратный)?\s+из\s+(\d+(?:[.,]\d+)?)$/iu.exec(t);if(m)return out(Math.sqrt(n(m[1])));
 m=/^(\d+(?:[.,]\d+)?)\s+в\s+(?:степени\s+)?(\d{1,3})(?:-?(?:й|ой|ей|ую))?(?:\s+степени)?$/iu.exec(t);if(m){const v=n(m[1])**n(m[2]);return v<=1e15?out(v):null;}
 return null;
}
function explicitCalculation(command=''){
 {const value=special(String(command).trim());if(value!==null)return value;}
 const text=spokenOperators(String(command).trim());
 if(/(?:^|\s)(?:но|кроме|без|не)(?=\s)|дубл|приоритет|просроч/iu.test(text))return null;
 if(text.length>500||/[«»"“”]/u.test(text)||/если|допустим|предполож|процент|процентн|скидк|налог|отправ|создай|удали|проверь|сохрани|запиши|объясни|почему|докажи/iu.test(text))return null;
 if(!/сколько|вычисли|посчитай|чему рав|ответь|^[\d\s()+*/×÷−-]+[?!.]*$/iu.test(text))return null;
 // Explicit expression, optionally introduced by a calculation question.
 let expression=/^(?:(?:сколько (?:будет|получится)|вычисли|посчитай|чему равно)\s*[:—]?\s*)?([\d\s()+*/×÷−-]+)[?.!]*(?:\s*ответь только числом[.!]?)?$/iu.exec(text)?.[1];
 if(expression){
  const chars=expression.replace(/×/gu,'*').replace(/÷/gu,'/').replace(/−/gu,'-').replace(/\s/gu,'');
  if(!/^[\d()+*/-]+$/u.test(chars)||chars.length>100)return null;
  const parts=chars.match(/\d+|[()+*/-]/gu);let at=0;
  function primary(){const token=parts[at++];if(token==='+'||token==='-'){const n=primary();return token==='-'?-n:n;}if(token==='('){const n=sum();if(parts[at++]!==')')throw Error();return n;}if(!/^\d+$/u.test(token||''))throw Error();const n=Number(token);if(!Number.isSafeInteger(n))throw Error();return n;}
  function product(){let n=primary();while(parts[at]==='*'||parts[at]==='/'){const op=parts[at++],b=primary();if(op==='/'&&b===0)throw Error();n=op==='*'?n*b:n/b;if(!Number.isSafeInteger(n))throw Error();}return n;}
  function sum(){let n=product();while(parts[at]==='+'||parts[at]==='-'){const op=parts[at++],b=product();n=op==='+'?n+b:n-b;if(!Number.isSafeInteger(n))throw Error();}return n;}
  try{const n=sum();if(at!==parts.length||!Number.isSafeInteger(n))return null;return String(n);}catch{return null;}
 }
 // Narrative counts require exactly two non-negative integers and explicit units.
 if(/[A-ZА-Я][\p{L}\p{N}_]*-\d|\d[.,:/-]\d|[-−]\d/iu.test(text))return null;
 const nums=text.match(/\d+/gu)||[];if(nums.length!==2||!/задач|карточ|списк|проект|команд|яблок|короб|книг|сотрудник/iu.test(text))return null;
 const [a,b]=nums.map(Number);if(![a,b].every(Number.isSafeInteger))return null;
 let value;
 if(/(?:всего|вместе)/iu.test(text)&&/\d+\s+\p{L}+(?:\s+\p{L}+)?\s+и\s+(?:(?:ещ[её]|ещё)\s+)?\d+/iu.test(text)){const units=text.slice(text.search(/\d/u)).match(/задач|карточ|списк|проект|команд|яблок|короб|книг|сотрудник/giu)||[];if(new Set(units.map(u=>u.toLowerCase())).size!==1)return null;value=a+b;}
 else if(/(?:всего|вместе)/iu.test(text)&&/\d+\s+\p{L}+\s+по\s+\d+/iu.test(text))value=a*b;
 else if(/осталось/iu.test(text)&&/^было\s+\d+/iu.test(text)&&/завершили|закрыли|убрали|вычли/iu.test(text))value=a-b;
 else if(/в каждом|каждому|на каждого/iu.test(text)&&/равных|поровну/iu.test(text)&&b>0)value=a/b;
 if(!Number.isSafeInteger(value)||value<0)return null;
 return String(value);
}
module.exports={explicitCalculation};
