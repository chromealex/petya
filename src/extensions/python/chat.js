window.renderPythonExecution=function(parent,execution){
 const attempts=execution.attempts||[execution];
 const details=document.createElement('details'),summary=document.createElement('summary');
 summary.textContent=attempts.length>1?'Код Python · '+attempts.length+' попытки':'Код Python';details.append(summary);
 for(const item of attempts){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=item.code||'';pre.append(code);details.append(pre);if(!item.ok&&item.stderr){const error=document.createElement('pre');error.textContent=item.stderr;details.append(error);}}
 parent.append(details);
};
