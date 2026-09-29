import { html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { PINNABLE_LIBRARY_NAV } from '../../lib/library-nav-pins.js';
import { type AppSettings, type PinnableLibraryRoute } from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/switch.js';
import type { SwitchChangeDetail } from '../ui/switch.js';

@customElement('settings-nav-pins')
@localized()
export class SettingsNavPins extends LitElement {
  static styles = settingsCardStyles;

  @state()
  private _settings: AppSettings = getAppSettings();

  private _label(key: PinnableLibraryRoute): string {
    switch (key) {
      case 'library-media':
        return msg('媒体库');
      case 'library-playlists':
        return msg('播放列表');
      case 'library-sentences':
        return msg('句库');
      case 'library-records':
        return msg('录音库');
    }
  }

  private _isPinned(key: PinnableLibraryRoute): boolean {
    return this._settings.pinnedLibraryRoutes.includes(key);
  }

  private _setPinned(key: PinnableLibraryRoute, pinned: boolean) {
    const current = this._settings.pinnedLibraryRoutes;
    const has = current.includes(key);
    if (pinned === has) return;
    const next = pinned ? [...current, key] : current.filter((route) => route !== key);
    this._settings = setAppSettings({ pinnedLibraryRoutes: next });
  }

  private _onSwitch(key: PinnableLibraryRoute) {
    return (event: CustomEvent<SwitchChangeDetail>) => {
      event.stopPropagation();
      this._setPinned(key, event.detail.checked);
    };
  }

  private _onRowClick(key: PinnableLibraryRoute) {
    return (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('ui-switch')) return;
      this._setPinned(key, !this._isPinned(key));
    };
  }

  private _onRowKeydown(key: PinnableLibraryRoute) {
    return (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this._setPinned(key, !this._isPinned(key));
    };
  }

  render() {
    return html`
      <section class="card" aria-labelledby="nav-pins-heading">
        <h2 id="nav-pins-heading">${msg('导航快捷入口')}</h2>
        <p class="desc">${msg('把常用的库页面固定到导航。其余仍从「库」进入。')}</p>
        <div class="rows">
          ${PINNABLE_LIBRARY_NAV.map((item) => {
            const pinned = this._isPinned(item.key);
            return html`
              <div
                class="row"
                role="button"
                tabindex="0"
                @click=${this._onRowClick(item.key)}
                @keydown=${this._onRowKeydown(item.key)}
              >
                <div class="label-wrap">
                  <span class="label">${this._label(item.key)}</span>
                </div>
                <ui-switch
                  .checked=${pinned}
                  .label=${this._label(item.key)}
                  @change=${this._onSwitch(item.key)}
                ></ui-switch>
              </div>
            `;
          })}
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-nav-pins': SettingsNavPins;
  }
}
