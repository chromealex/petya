const kind=new URLSearchParams(location.search).get('kind')==='cursor'?'cursor':'badge';
document.getElementById(kind).hidden=false;
window.petyaControlVisual.listen(state=>{document.body.classList.toggle('done',state.phase==='done');document.getElementById('label').textContent=state.phase==='done'?'Петя · готово':'Петя · '+(state.label||'управляет окном');document.getElementById('cursor-label').textContent=state.phase==='done'?'Готово':'Петя';if(state.app!==undefined)document.getElementById('app').textContent=state.app||'Управление компьютером';});
