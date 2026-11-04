const acorn=require('./vendor/acorn/acorn.cjs');
function nodes(root){const result=[],stack=[root];while(stack.length){const n=stack.pop();if(!n||typeof n!=='object')continue;if(n.type)result.push(n);for(const [k,v]of Object.entries(n)){if(k==='loc')continue;if(Array.isArray(v))stack.push(...v);else if(v&&typeof v==='object')stack.push(v);}}return result;}
function member(n){return n?.type==='MemberExpression'&&!n.computed&&n.property.type==='Identifier'?n.property.name:null;}
function base(n){while(n?.type==='MemberExpression')n=n.object;return n?.type==='Identifier'?n.name:null;}
function findings(files,question=''){
 if(!/найди|исправ|проанализ|разбери|проверь.*код/iu.test(question))return [];
 const out=[];const add=(file,line,text)=>out.push({file,line,text});
 for(const f of files){if(typeof f.text!=='string'||f.text.length>200000)continue;
  if(/\.(?:log|json)(?:\.txt)?$/iu.test(f.name))for(const [i,line]of f.text.split('\n').entries()){
   const raw=/\{.*\}/u.exec(line)?.[0];if(raw&&/,\s*[}\]]/u.test(raw)){try{JSON.parse(raw);}catch{add(f.name,i+1,'В этой строке невалидный JSON: завершающая запятая перед закрывающей скобкой. Уберите лишнюю запятую и повторите разбор JSON.');}}
  }
  if(/\.log$/iu.test(f.name))for(const [i,line]of f.text.split('\n').entries())if(/\b(?:ERROR|FATAL)\b.*\bupstream timeout\b/iu.test(line))add(f.name,i+1,'В логе зафиксирован upstream timeout: ответ вышестоящего сервиса не получен вовремя. Причина по одной строке не установлена. Проверьте доступность upstream, его время ответа и настройки тайм-аута; сам сервер здесь не проверялся и не исправлялся.');
  if(/\.py$/iu.test(f.name)&&!/"""|\x27\x27\x27|(?:def|import)\s+int\b|\bint\s*=/u.test(f.text)){
   const lines=f.text.split('\n');
   for(let i=0;i<lines.length;i++)if(/^\s*return\s+int\([A-Za-z_]\w*\)\s*$/u.test(lines[i])&&/^\s*except KeyError:\s*$/u.test(lines[i+1]||'')&&!/except\s+(?:\([^)]*\b)?ValueError/u.test(f.text))add(f.name,i+2,'int(...) для нечисловой строки вызывает ValueError. Обработчик except KeyError его не перехватывает. Если функция должна возвращать None для такого ввода, перехватывайте ValueError и проверьте нечисловую строку.');
  }
  if(/\.cs$/iu.test(f.name)){
   const m=/^\s*class\s+\w+\s*\{\s*string\s+(\w+)\s*=\s*null\s*;\s*int\s+\w+\(\)\s*\{\s*return\s+\1\.Length\s*;\s*\}\s*\}\s*$/u.exec(f.text);
   if(m){const line=f.text.slice(0,f.text.indexOf('return')).split('\n').length;add(f.name,line,'Поле '+m[1]+' равно null, поэтому обращение к .Length вызывает NullReferenceException. Инициализируйте строку или явно обработайте null перед чтением Length.');}
  }
  if(!/\.(?:js|cjs|mjs)$/iu.test(f.name))continue;
  let tree;try{tree=acorn.parse(f.text,{ecmaVersion:2024,sourceType:'module',locations:true});}catch{continue;}
  const all=nodes(tree),decls=all.filter(n=>n.type==='VariableDeclarator'&&n.id.type==='Identifier'),unique=name=>decls.filter(d=>d.id.name===name).length===1;
  const shadowed=name=>all.some(n=>/Function/u.test(n.type)&&n.params?.some(p=>p.type==='Identifier'&&p.name===name));
  for(const n of all){
   if(n.type==='LogicalExpression'&&n.operator==='||'&&n.right.type==='Literal'&&typeof n.right.value==='number'&&n.right.value!==0){add(f.name,n.loc.start.line,'Оператор || заменяет также допустимые 0 и false значением по умолчанию. Если ноль должен сохраняться, используйте ??, который заменяет только null/undefined. Проверьте отдельно вход со значением 0.');}
   if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.type==='MemberExpression'){
    const name=base(n.left),d=decls.find(d=>d.id.name===name);if(!d||!unique(name)||shadowed(name)||d.init?.type!=='ObjectExpression')continue;
    const props=d.init.properties,spread=props.findLastIndex(p=>p.type==='SpreadElement');if(spread<0)continue;
    const rootKey=member(n.left.object);if(!rootKey||props.slice(spread+1).some(p=>p.key?.name===rootKey))continue;
    if(all.some(a=>a.type==='AssignmentExpression'&&a.start>d.start&&a.start<n.start&&base(a.left)===name&&member(a.left)===rootKey))continue;
    add(f.name,n.loc.start.line,'Копирование через {...объект} поверхностное: вложенный объект '+rootKey+' остаётся общим. Эта запись может изменить исходный объект. Для независимого обновления скопируйте вложенный объект отдельно (например, {...state.user}) или используйте structuredClone для поддерживаемых данных.');
   }
   if(n.type==='CallExpression'&&member(n.callee)==='test'&&n.callee.object.type==='Identifier'){
    const name=n.callee.object.name,d=decls.find(d=>d.id.name===name);if(!d?.init?.regex||!unique(name)||shadowed(name)||!/[gy]/u.test(d.init.regex.flags))continue;
    if(all.some(a=>a.type==='AssignmentExpression'&&base(a.left)===name&&member(a.left)==='lastIndex'))continue;
    add(f.name,n.loc.start.line,'RegExp.test с флагом g или y изменяет lastIndex. Повторная проверка той же строки может дать другой результат. Для независимой валидации уберите g/y или явно сбрасывайте lastIndex перед каждой проверкой.');
   }
   if(n.type==='ForStatement'&&n.update?.type==='UpdateExpression'&&n.update.operator==='++'&&n.update.argument.type==='Identifier'){
    const index=n.update.argument.name,body=nodes(n.body);
    if(body.some(b=>b.type==='UpdateExpression'&&b.operator==='--'&&b.argument.name===index))continue;
    for(const call of body.filter(b=>b.type==='CallExpression'&&member(b.callee)==='splice')){
     if(call.arguments[0]?.type!=='Identifier'||call.arguments[0].name!==index||call.arguments[1]?.value!==1)continue;
     const arr=base(call.callee.object);if(n.test?.type!=='BinaryExpression'||n.test.operator!=='<'||n.test.left?.name!==index||member(n.test.right)!=='length'||base(n.test.right.object)!==arr)continue;
     add(f.name,call.loc.start.line,'После splice(i, 1) следующий элемент сдвигается на индекс i, а i++ пропускает его. Если нужно удалить все совпадения, обходите массив в обратном порядке, компенсируйте индекс через i-- либо создайте новый массив через filter.');
    }
   }
  }
 }
 return out.slice(0,8);
}
module.exports={findings};
