import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n/localization.js', () => ({
  changeLocale: vi.fn((locale: string) => {
    return Promise.resolve(locale);
  }),
}));

import './locale-switcher.js';
import { LocaleSwitcher } from './locale-switcher.js';
import { changeLocale } from '../../i18n/localization.js';
import { mount } from './test-utils.js';

describe('locale-switcher', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.mocked(changeLocale).mockClear();
  });

  async function renderSwitcher(value = 'zh-CN') {
    const result = mount(html`<locale-switcher .value=${value}></locale-switcher>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('locale-switcher') as LocaleSwitcher;
    await el.updateComplete;
    const select = el.shadowRoot!.querySelector('ui-select');
    expect(select).not.toBeNull();
    await (select as import('./select.js').UiSelect).updateComplete;
    return el;
  }

  it('renders ui-select with locale options', async () => {
    const el = await renderSwitcher();
    const select = el.shadowRoot?.querySelector('ui-select') as import('./select.js').UiSelect;
    expect(select).not.toBeNull();
    expect(select.options.length).toBeGreaterThan(0);
    expect(select.options.some((o) => 'value' in o && o.value === 'en')).toBe(true);
  });

  it('calls changeLocale when selection changes', async () => {
    const el = await renderSwitcher('en');
    const select = el.shadowRoot?.querySelector('ui-select') as import('./select.js').UiSelect;

    select.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 'ja', option: { value: 'ja', label: '日本語' } },
        bubbles: true,
        composed: true,
      }),
    );

    await Promise.resolve();
    expect(changeLocale).toHaveBeenCalledWith('ja');
  });
});
