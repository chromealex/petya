// Charts plugin, renderer: interactive donut and bar charts for message.extensionData.charts and ```chart blocks.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('chart-cards.css',document.currentScript.src).href;document.head.append(style);
 // Distinct in lightness as well as hue, readable on the dark chat background.
 const colors=['#d0f596','#86c2ff','#ffd07d','#ba9bff','#ff9daf','#83dcbb','#f0b4a8','#94dbea','#c9b8a0','#9aa5ff'];
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
 const svgEl=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const number=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});

 // Accepts {type|kind, title, unit, rows:[{label, value|count}]}; returns null for anything malformed.
 function normalize(chart){
  if(!chart||typeof chart!=='object')return null;
  const type=['donut','bars','pie'].includes(chart.type||chart.kind)?(chart.type||chart.kind)==='pie'?'donut':(chart.type||chart.kind):'donut';
  const rows=(Array.isArray(chart.rows)?chart.rows:[]).slice(0,40).map(r=>({label:String(r?.label??'').slice(0,80),value:Number(r?.value??r?.count)})).filter(r=>r.label&&Number.isFinite(r.value)&&r.value>=0);
  if(!rows.length)return null;
  return {type,title:String(chart.title||'').slice(0,160),unit:String(chart.unit||'').slice(0,16),rows};
 }

 function donut(chart){
  const box=el('figure','chart-card');const hidden=new Set();
  if(chart.title)box.append(el('figcaption','chart-title',chart.title));
  const body=el('div','chart-donut');const size=168,r=62,stroke=22,c=2*Math.PI*r;
  const svg=svgEl('svg',{viewBox:`0 0 ${size} ${size}`,width:size,height:size,role:'img'});
  const ring=svgEl('g',{transform:`rotate(-90 ${size/2} ${size/2})`});svg.append(svgEl('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:'#ffffff0d','stroke-width':stroke}),ring);
  const center=svgEl('text',{x:size/2,y:size/2-2,'text-anchor':'middle',class:'chart-center-value'}),caption=svgEl('text',{x:size/2,y:size/2+18,'text-anchor':'middle',class:'chart-center-label'});svg.append(center,caption);
  const legend=el('ul','chart-legend');
  let focused=null;
  function paint(){
   ring.replaceChildren();const visible=chart.rows.map((row,i)=>({...row,i})).filter(row=>!hidden.has(row.i));const total=visible.reduce((s,row)=>s+row.value,0);
   let offset=0;
   for(const row of visible){
    const share=total?row.value/total:0,length=share*c;
    const arc=svgEl('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:colors[row.i%colors.length],'stroke-width':focused===row.i?stroke+6:stroke,'stroke-dasharray':`${Math.max(0,length-(visible.length>1?1.5:0))} ${c}`,'stroke-dashoffset':String(-offset),class:'chart-arc'});
    arc.addEventListener('pointerenter',()=>{focused=row.i;paint();});arc.addEventListener('pointerleave',()=>{focused=null;paint();});
    ring.append(arc);offset+=length;
   }
   const current=focused!==null&&!hidden.has(focused)?chart.rows[focused]:null;
   center.textContent=current?Math.round(100*current.value/(total||1))+'%':number(total)+(chart.unit?' '+chart.unit:'');
   caption.textContent=current?current.label.slice(0,18):'всего';
   svg.setAttribute('aria-label',(chart.title?chart.title+': ':'')+chart.rows.map(row=>row.label+' '+number(row.value)).join(', '));
   for(const item of legend.children){const i=Number(item.dataset.index),on=!hidden.has(i);item.querySelector('button').setAttribute('aria-pressed',String(on));item.classList.toggle('focused',focused===i);const share=item.querySelector('.chart-share');share.textContent=on&&total?Math.round(100*chart.rows[i].value/total)+'%':'—';}
  }
  chart.rows.forEach((row,i)=>{
   const item=el('li');item.dataset.index=i;
   const toggle=el('button','chart-legend-item');toggle.type='button';toggle.title='Скрыть или показать «'+row.label+'»';
   const dot=el('span','chart-dot');dot.style.background=colors[i%colors.length];
   toggle.append(dot,el('span','chart-label',row.label),el('span','chart-value',number(row.value)+(chart.unit?' '+chart.unit:'')),el('span','chart-share'));
   toggle.onclick=()=>{hidden.has(i)?hidden.delete(i):hidden.add(i);if(hidden.size===chart.rows.length)hidden.delete(i);paint();};
   toggle.onfocus=toggle.onpointerenter=()=>{focused=i;paint();};toggle.onblur=toggle.onpointerleave=()=>{focused=null;paint();};
   item.append(toggle);legend.append(item);
  });
  body.append(svg,legend);box.append(body);paint();return box;
 }

 function bars(chart){
  const box=el('figure','chart-card');if(chart.title)box.append(el('figcaption','chart-title',chart.title));
  const max=Math.max(...chart.rows.map(r=>r.value),0)||1,list=el('ul','chart-bars');
  chart.rows.forEach((row,i)=>{const item=el('li'),bar=el('span','chart-bar-track'),fill=el('span','chart-bar-fill');fill.style.width=(100*row.value/max)+'%';fill.style.background=colors[i%colors.length];bar.append(fill);item.append(el('span','chart-label',row.label),bar,el('span','chart-value',number(row.value)+(chart.unit?' '+chart.unit:'')));list.append(item);});
  box.setAttribute('aria-label',(chart.title?chart.title+': ':'')+chart.rows.map(r=>r.label+' '+number(r.value)).join(', '));
  box.append(list);return box;
 }
 const render=chart=>{const data=normalize(chart);return data?(data.type==='bars'?bars(data):donut(data)):null;};

 // Result renderer: charts attached by other plugins replace their static picture and the plain-text legend.
 window.renderCharts=(parent,charts)=>{
  if(!Array.isArray(charts)||parent.querySelector(':scope>.chart-card'))return;
  const nodes=charts.map(render).filter(Boolean);if(!nodes.length)return;
  for(const img of parent.querySelectorAll(':scope>.extension-reply-image'))img.remove();
  const labels=new Set(charts.flatMap(c=>(c.rows||[]).map(r=>String(r.label))));
  window.resultKit?.dropLines(parent,text=>{const m=text.match(/^(.+?)\s+[—–-]\s+[\d\s,.]+$/u);return !!m&&labels.has(m[1].trim());});
  parent.append(...nodes);
 };
 // ```chart blocks written by the model.
 (window.petyaFenceRenderers||={}).chart=text=>{let data;try{data=JSON.parse(text);}catch{return null;}return render(data);};
 window.petyaCharts={render,normalize};
})();
