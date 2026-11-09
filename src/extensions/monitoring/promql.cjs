// «Мониторинг», PromQL: the golden signals of a service from templates, never written by the model.
// A template has placeholders {{selector}} (label matchers of the service, e.g. job="api"), {{window}} (rate
// window, e.g. 5m) and {{service}} (the escaped name). Defaults follow the common instrumentation
// (http_requests_total with a `code` label, http_request_duration_seconds histogram, node_exporter CPU); each
// service can override any template, its selector and its thresholds in the settings («Шаблоны PromQL»).
const SIGNALS=['errorRate','latencyP95','rps','saturation'];
const DEFAULTS={
 up:'up{{{selector}}}',
 errorRate:'sum(rate(http_requests_total{{{selector}},code=~"5.."}[{{window}}])) / sum(rate(http_requests_total{{{selector}}}[{{window}}]))',
 latencyP95:'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{{{selector}}}[{{window}}])))',
 rps:'sum(rate(http_requests_total{{{selector}}}[{{window}}]))',
 saturation:'max(1 - avg by (instance) (rate(node_cpu_seconds_total{{{selector}},mode="idle"}[{{window}}])))'
};
// warn / critical; errorRate and saturation are fractions, latency in seconds; rps has no threshold.
const THRESHOLDS={errorRate:[0.01,0.05],latencyP95:[1,3],saturation:[0.85,0.95]};
const LABEL=/^[a-zA-Z_][a-zA-Z0-9_]*$/;
const WINDOW=/^\d{1,3}[smhd]$/;

// A PromQL string literal value: backslashes and double quotes escaped, no newlines.
const escape=v=>String(v??'').replace(/[\r\n]+/g,' ').replace(/\\/g,'\\\\').replace(/"/g,'\\"');
// `label="value"` for a service found through that label.
function selector(label,value){
 if(!LABEL.test(String(label||'')))throw Error('Некорректное имя метки: '+String(label).slice(0,40));
 return label+'="'+escape(value)+'"';
}
// A user-written selector: only label matchers (name op "value"), comma-separated.
function checkSelector(text){
 const t=String(text||'').trim();if(!t)return '';
 const parts=t.split(/,(?=\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(?:=~|!~|!=|=))/);
 for(const p of parts)if(!/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(?:=~|!~|!=|=)\s*"(?:[^"\\]|\\.)*"\s*$/.test(p))throw Error('Селектор: метки вида job="api", через запятую.');
 return parts.map(p=>p.trim()).join(',');
}
function checkTemplate(text){
 const t=String(text||'').trim();if(!t)return '';
 if(t.length>1000)throw Error('Шаблон PromQL слишком длинный.');
 if(!t.includes('{{selector}}'))throw Error('В шаблоне нужен {{selector}} — иначе он не про этот сервис.');
 if(/\{\{(?!selector\}\}|window\}\}|service\}\})/.test(t))throw Error('В шаблоне допустимы только {{selector}}, {{window}} и {{service}}.');
 return t;
}
// The query of one signal of one service: config = {selector?, label?, value?, window?, templates?:{}}.
function render(signal,{name,selector:sel,label,value,window='5m',templates={}}={}){
 const tpl=templates[signal]||DEFAULTS[signal];
 if(!tpl)throw Error('Неизвестный сигнал '+signal);
 const where=sel?checkSelector(sel):selector(label||'service',value??name);
 if(!WINDOW.test(window))throw Error('Окно: число и s/m/h/d, например 5m.');
 return tpl.replaceAll('{{selector}}',where).replaceAll('{{window}}',window).replaceAll('{{service}}',escape(name));
}
// Status from the signal values and the thresholds (service overrides first).
function judge(signals,thresholds={}){
 let status='ok';const reasons=[];
 for(const [k,[warn,crit]] of Object.entries({...THRESHOLDS,...thresholds})){
  const v=signals?.[k];if(typeof v!=='number'||!Number.isFinite(v))continue;
  if(v>=crit){status='critical';reasons.push(k);}else if(v>=warn){if(status==='ok')status='warn';reasons.push(k);}
 }
 return {status,reasons};
}
// A step for query_range: ~60 points over the period, at least 60 s.
const step=(from,to)=>Math.max(60,Math.ceil((to-from)/1000/60));

module.exports={SIGNALS,DEFAULTS,THRESHOLDS,escape,selector,checkSelector,checkTemplate,render,judge,step};
