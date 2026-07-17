import './app/my-app.js';
import './components/pwa/pwa-update-banner.js';
import { initializeLocalization } from './i18n/localization.js';
import { installGlobalErrorHandlers } from './lib/error-reporter.js';
import { registerPwa } from './lib/pwa.js';

installGlobalErrorHandlers();
registerPwa();
void initializeLocalization();

if (typeof document !== 'undefined' && !document.querySelector('pwa-update-banner')) {
  document.body.appendChild(document.createElement('pwa-update-banner'));
}
