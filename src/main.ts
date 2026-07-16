import './app/my-app.js';
import { initializeLocalization } from './i18n/localization.js';
import { installGlobalErrorHandlers } from './lib/error-reporter.js';

installGlobalErrorHandlers();
void initializeLocalization();
