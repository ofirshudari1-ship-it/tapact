// Loads chrome-extension/common.js (a plain browser script) in a vm context so its phone
// logic can be run against the same corpus as src/lib/phone.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', '..', '..', 'chrome-extension', 'common.js');
const code = fs.readFileSync(file, 'utf8');
const context = vm.createContext({ chrome: { storage: { sync: {}, local: {} } }, console });
vm.runInContext(code + '\nthis.__api = { pcFindPhone, pcFillTemplate, pcBuildWhatsAppUrl };', context);

function chromeFindPhone(text) {
  const r = context.__api.pcFindPhone(text);
  return r ? r.normalized : null;
}

module.exports = { chromeFindPhone, extensionApi: context.__api, extensionSource: code };
