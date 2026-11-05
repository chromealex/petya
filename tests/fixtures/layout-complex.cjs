// Dense synthetic Figma-style source: 24 image cards, 36 table rows, two font weights,
// nested wrapping auto layout, two scroll axes, and a pinned sidebar/footer.
let serial=0;
const box=(width,height)=>({x:0,y:0,width,height});
const node=(name,width,height,extra={})=>({id:'complex-'+(++serial),name,absoluteBoundingBox:box(width,height),...extra});
const label=(name,text,width=200,height=24,bold=false)=>node(name,width,height,{type:'TEXT',characters:text,style:{fontFamily:'Arial',fontWeight:bold?700:400,fontSize:bold?20:14},fills:[{type:'SOLID',color:{r:.1,g:.15,b:.2,a:1}}]});
const col=(name,w,h,children,extra={})=>node(name,w,h,{layoutMode:'VERTICAL',itemSpacing:8,children,...extra});
const row=(name,w,h,children,extra={})=>node(name,w,h,{layoutMode:'HORIZONTAL',itemSpacing:12,children,...extra});
const cards=[];
for(let i=0;i<24;i++)cards.push(col('Card '+i,220,164,[node('Image '+i,196,56,{type:'RECTANGLE',fills:[{type:'IMAGE',imageRef:'image-'+i}]}),label('Title '+i,'Проект '+(i+1),196,24,true),row('Stats '+i,196,24,[label('Value '+i,String(1250+i*137),92),label('Trend '+i,'+'+(i+1)+'%',92)]),label('Status '+i,i%2?'В работе':'Готово',196,20)],{paddingLeft:12,paddingRight:12,paddingTop:12,paddingBottom:12,itemSpacing:4}));
const grid=row('Card grid',1100,800,cards,{layoutWrap:'WRAP',layoutSizingHorizontal:'FILL',layoutSizingVertical:'HUG',itemSpacing:12});
const rows=[row('Table header',780,32,['Задача','Исполнитель','Статус','Приоритет','Срок','Проект'].map((s,i)=>label('Header '+i,s,120,32,true)))];
for(let i=0;i<36;i++)rows.push(row('Table row '+i,780,28,['Задача '+(i+1),'Команда '+i%4,i%2?'В работе':'Готово',i%3?'Обычный':'Высокий','05.11.2026','Проект '+i%8].map((s,j)=>label('Cell '+i+' '+j,s,120,28)),{itemSpacing:12}));
const table=col('Table',780,1450,rows,{itemSpacing:4});
const tableScroll=col('Table horizontal scroll',1100,1460,[table],{layoutSizingHorizontal:'FILL',overflowDirection:'HORIZONTAL_SCROLLING'});
const body=col('Dashboard scroll',1100,760,[grid,label('Table title','Задачи команды',300,32,true),tableScroll],{layoutSizingHorizontal:'FILL',layoutSizingVertical:'FILL',overflowDirection:'VERTICAL_SCROLLING',paddingLeft:16,paddingRight:16,paddingTop:16,paddingBottom:16,itemSpacing:20});
const main=col('Main',1184,900,[row('Toolbar',1100,64,[label('Page title','Панель проектов',280,32,true),label('Account','Александр · Команда разработки',280,32)],{layoutSizingHorizontal:'FILL',paddingLeft:16,paddingTop:16}),body,label('Footer','Синхронизировано · 24 проекта · 36 задач',1000,28)],{layoutSizingHorizontal:'FILL',layoutSizingVertical:'FILL',itemSpacing:0});
const sidebar=col('Sidebar',80,900,[label('Brand','П',48,40,true),...['Обзор','Задачи','Люди','Файлы','Отчёты','Связи'].map((s,i)=>label('Nav '+i,s,64,32))],{layoutSizingVertical:'FILL',paddingLeft:8,paddingTop:16,itemSpacing:16});
const root=row('Complex dashboard',1280,900,[sidebar,main],{itemSpacing:0});
for(const n of main.children[0].children)n.layoutSizingHorizontal='FILL';
main.children.at(-1).layoutSizingHorizontal='FILL';
const elements={};let index=0;function walk(n){elements[n.name]='layer-'+(++index);for(const c of n.children||[])walk(c);}walk(root);
module.exports={root,elements,count:index};
