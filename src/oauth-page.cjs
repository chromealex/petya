// The page the system browser shows after an OAuth sign-in (the http://127.0.0.1:…/callback redirect) — Petya's
// look instead of a line of plain text. It tries to close its own tab (browsers allow that only for tabs a script
// opened; otherwise the tab stays with a note) and the sign-in flow brings Petya's window to the front.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page({title,text='',ok=true,close=true}){
 const t=require('./interface-language.cjs').t;
 return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t(title))} · Петя</title>
<style>
:root{color-scheme:dark;--bg:#111415;--panel:#1b1f20;--line:#303637;--ink:#f0f2ed;--muted:#969e9a;--green:#d0f596;--red:#ff8b7a}
html,body{height:100%;margin:0}body{display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"Segoe UI",Inter,Roboto,sans-serif}
main{width:min(420px,calc(100vw - 32px));padding:28px 28px 24px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 24px 60px #0008;text-align:center}
.mark{width:56px;height:56px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;background:${ok?'#d0f59618':'#ff8b7a1a'};color:${ok?'var(--green)':'var(--red)'}}
.mark svg{width:28px;height:28px}h1{margin:0 0 6px;font-size:19px;font-weight:600}p{margin:0;color:var(--muted)}p.note{margin-top:14px;font-size:13px}
.brand{margin-top:22px;font-size:12px;letter-spacing:.12em;color:var(--muted)}
</style></head><body><main>
<div class="mark">${ok?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'}</div>
<h1>${esc(t(title))}</h1>${text?`<p>${esc(t(text))}</p>`:''}
<p class="note" id="note">${esc(t(close?'Можно вернуться в Петю — эта вкладка закроется сама.':'Можно вернуться в Петю и закрыть эту вкладку.'))}</p>
<div class="brand">ПЕТЯ</div></main>
${close?`<script>setTimeout(()=>{try{window.close();}catch{}setTimeout(()=>{const n=document.getElementById('note');if(n)n.textContent=${JSON.stringify(t('Можно вернуться в Петю и закрыть эту вкладку.'))};},400);},900);</script>`:''}
</body></html>`;
}
// Writes the page to an http.ServerResponse.
function reply(res,{status=200,...options}){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(page(options));}
module.exports={page,reply};
