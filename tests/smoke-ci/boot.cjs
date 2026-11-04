// CI entry for the UI smoke test on Linux. Headless runners have no OS keyring, so safeStorage is
// emulated here only; the app itself is unchanged. Run from the repository root:
//   xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/smoke-ci
const path=require('node:path');const {safeStorage}=require('electron');
safeStorage.isEncryptionAvailable=()=>true;
safeStorage.encryptString=text=>Buffer.from('T'+text,'utf8');
safeStorage.decryptString=data=>Buffer.from(data).toString('utf8').slice(1);
require(path.join(__dirname,'..','..','src','main.cjs'));
