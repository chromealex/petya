// What the activity tracker may keep of a window: decided before anything is stored, never after.
// - Apps in the private list (password managers by default, plus the user's own list) keep only the app name.
// - Private browsing windows and banking pages keep only the app name.
// - Every other title loses e-mail addresses and long digit runs (card, account and phone numbers) and is cut to
//   200 characters; a browser title loses the browser's own name.
// The user's list (`activityPrivateApps`): one entry per line or comma; an entry matches an app name or a word in
// the title, case-insensitively («Telegram», «Сбер», «медицин»).
const PRIVATE_APPS=['1Password','Bitwarden','KeePass','KeePassXC','KeePassium','LastPass','Dashlane','Enpass','Keeper','NordPass','Proton Pass','RoboForm',
 'Keychain Access','Связка ключей','Passwords','Пароли','Credential Manager','Диспетчер учетных данных'];
const PRIVATE_BROWSING=[/InPrivate/i,/(?:^|[^\p{L}])incognito(?=$|[^\p{L}])/iu,/инкогнито/iu,/private browsing/i,/приватн\p{L}* (?:просмотр|окн|режим|вкладк)/iu,/\(private\)/i,/tor browser/i];
const BANKING=/(?:^|[^\p{L}])(?:online[- ]?banking|internet[- ]?banking|e-?banking|bank of america|chase\.com|wells fargo|hsbc|barclays|santander|revolut|monzo|n26|wise\.com|paypal|ing banking|сбербанк|сбер ?онлайн|сбер ?бизнес|т-банк|тинькофф|альфа-?банк|альфа-?онлайн|втб(?: онлайн)?|райффайзен|газпромбанк|банк открытие|почта банк|совкомбанк|росбанк|мтс банк|озон банк|ozon bank|яндекс банк|интернет-банк\p{L}*|онлайн-банк\p{L}*|kaspi|приватбанк|монобанк|monobank)(?=$|[^\p{L}])/iu;
const BROWSER=/^(?:google chrome|chrome|chromium|microsoft edge|msedge|edge|firefox|mozilla firefox|safari|opera|opera gx|brave|brave browser|vivaldi|arc|yandex|яндекс браузер|yandex browser|thorium|librewolf|waterfox|zen|zen browser|tor browser)$/i;
const isBrowser=app=>BROWSER.test(String(app||'').trim());

const entries=list=>String(list||'').split(/[\n,;]+/).map(x=>x.trim()).filter(x=>x.length>=2).slice(0,100);
const lower=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е');

function scrub(title){
 return String(title||'')
  .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'…')
  .replace(/(?:\+?\d[\d ()-]{7,}\d)/g,m=>m.replace(/\D/g,'').length>=8?'…':m)
  .replace(/\s+/g,' ').trim().slice(0,200);
}

// {app, title} → {app, title, private?:'app'|'private'|'banking'|'user'}.
function redact({app,title},{privateApps=''}={}){
 const name=String(app||'').replace(/\s+/g,' ').trim().slice(0,80);
 const raw=String(title||'').replace(/[\u200b\u200e\u200f]/g,'').trim();
 const hide=reason=>({app:name,title:'',private:reason});
 const appKey=lower(name),titleKey=lower(raw);
 if(PRIVATE_APPS.some(p=>lower(p)===appKey))return hide('app');
 for(const e of entries(privateApps)){const k=lower(e);if(appKey===k||appKey.includes(k)||titleKey.includes(k))return hide('user');}
 // The browser's own suffix says «Private Browsing» / «InPrivate»: checked before it is cut off.
 if(PRIVATE_BROWSING.some(r=>r.test(raw)))return hide('private');
 const text=isBrowser(name)?require('../desktop-windows.cjs').pageTitle(raw):raw;
 if(BANKING.test(text))return hide('banking');
 return {app:name,title:scrub(text)};
}
module.exports={redact,scrub,isBrowser,PRIVATE_APPS,entries};
