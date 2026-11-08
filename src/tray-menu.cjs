const path = require('node:path');
const {t} = require('./interface-language.cjs');

function createTrayMenu({Menu, nativeImage, platform = process.platform, company, listening, meeting=false, ready, show, navigate, toggle, pause, quit, dashboards=[], openDashboard=()=>{}}) {
 const icon = name => {
  if(platform !== 'darwin') return undefined;
  const image = nativeImage.createFromPath(path.join(__dirname, '../assets/tray-menu', name+'.png'));
  image.setTemplateImage(true);
  return image;
 };
 const action = (label, name, click, extra = {}) => ({label:t(label), icon:icon(name), click, ...extra});
 return Menu.buildFromTemplate([
  {label:t('Петя')+' · '+company, enabled:false},
  {label:t('Микрофон: '+(listening?'включён':'выключен')+' · Запись: '+(meeting?'идёт':'выключена')),enabled:false},
  {type:'separator'},
  action('Открыть Петю', 'open', show),
  {type:'separator'},
  action(listening ? 'Выключить микрофон' : 'Включить микрофон', listening ? 'mic-off' : 'mic', toggle, {enabled:ready}),
  action('Остановить всё прослушивание', 'pause', pause, {enabled:ready&&(listening||meeting)}),
  {type:'separator'},
  // Dashboards (src/features/dashboards.cjs): open one in Petya straight from the menu bar.
  ...(dashboards.length?[{label:t('Дашборды'),enabled:ready,submenu:dashboards.map(d=>({label:d.title,click:()=>openDashboard(d.id)}))}]:[]),
  action('Материалы', 'context', () => navigate('sources'), {enabled:ready}),
  action('Команда', 'team', () => navigate('team'), {enabled:ready}),
  action('История', 'history', () => navigate('history'), {enabled:ready}),
  action('Подключения…', 'settings', () => navigate('settings'), {enabled:ready}),
  {type:'separator'},
  action('Выйти из Пети', 'quit', quit)
 ]);
}
module.exports = {createTrayMenu};
