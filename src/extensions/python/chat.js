// Python plugin, renderer: the result first (a table when the output is CSV/TSV, with download), the code and
// failed attempts folded below. Data: message.pythonExecution {attempts:[{code, ok, stdout, stderr}]}.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('chat.css',document.currentScript.src).href;document.head.append(style);
 // CSV/TSV with a consistent column count (≥2 columns, ≥2 rows) → rows; anything else → null.
 function splitLine(line,sep){
  if(sep!==',')return line.split(sep);
  const out=[];let cur='',quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(quoted){if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')quoted=false;else cur+=c;}else if(c==='"'&&!cur)quoted=true;else if(c===','){out.push(cur);cur='';}else cur+=c;}
  out.push(cur);return out;
 }
 function parseTable(text){
  const lines=String(text||'').trim().split(/\r?\n/).filter(l=>l.trim());if(lines.length<2||lines.length>5000)return null;
  for(const sep of ['\t',';',',']){
   if(!lines[0].includes(sep))continue;const rows=lines.map(l=>splitLine(l,sep).map(c=>c.trim()));
   if(rows[0].length>=2&&rows.every(r=>r.length===rows[0].length))return {head:rows[0],rows:rows.slice(1),text:lines.join('\n'),sep};
  }
  return null;
 }
 function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;}
 window.renderPythonExecution=function(parent,execution){
  if(parent.querySelector('.python-result'))return;
  const attempts=execution.attempts||[execution];const last=attempts.at(-1)||{};
  const box=el('div','python-result');
  const again=el('button',null,'Пересчитать…');again.type='button';again.title='Тот же расчёт с другими параметрами';
  again.onclick=()=>window.resultKit?.ask('Пересчитай с другими параметрами: ');
  const table=last.ok?parseTable(last.stdout):null;
  if(table){
   const wrap=el('div','python-table');wrap.dataset.noI18n='';const t=el('table');const head=el('tr');const numeric=table.head.map((_,i)=>table.rows.every(r=>/^-?[\d\s.,]+%?$/.test(r[i].trim())));table.head.forEach((h,i)=>head.append(el('th',numeric[i]?'num':'',h)));const thead=el('thead');thead.append(head);const body=el('tbody');
   for(const r of table.rows.slice(0,50)){const tr=el('tr');for(const c of r){const td=el('td',/^-?[\d\s.,]+%?$/.test(c.trim())?'num':'',c);tr.append(td);}body.append(tr);}
   t.append(thead,body);wrap.append(t);box.append(wrap);
   const bar=el('div','python-bar');const n=table.rows.length,word=n%10===1&&n%100!==11?'строка':[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?'строки':'строк';bar.append(el('span','python-meta',n+' '+word+(n>50?' · показаны первые 50':'')));
   const save=el('button',null,'Скачать CSV');save.type='button';save.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([table.sep===','?table.text:table.text.split('\n').map(l=>l.split(table.sep).map(c=>/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c).join(',')).join('\n')],{type:'text/csv'}));a.download='result.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
   bar.append(save,again);box.append(bar);
  }
  const details=el('details','python-code');details.append(el('summary',null,(attempts.length>1?'Код Python · '+attempts.length+' попытки':'Код Python')+(last.ok===false?' · ошибка':'')));
  for(const item of attempts){const pre=el('pre'),code=el('code',null,item.code||'');pre.append(code);details.append(pre);if(!item.ok&&item.stderr)details.append(el('pre','python-error',item.stderr));}
  if(!table&&last.ok&&String(last.stdout||'').trim()){const out=el('pre','python-output',String(last.stdout).split('\n').slice(0,200).join('\n'));details.append(el('div','python-meta','Вывод программы'),out);}
  if(table)box.append(details);else{const tools=el('div','python-bar');tools.append(details,again);box.append(tools);}
  parent.append(box);
 };
})();
