import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './shadowing-range-panel.js';
import type { ShadowingRangePanel } from './shadowing-range-panel.js';
import { mount } from '../ui/test-utils.js';

describe('shadowing-range-panel', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  async function renderPanel(
    overrides: {
      selectActive?: boolean;
      anchor?: number | null;
      range?: { start: number; end: number } | null;
      focus?: boolean;
      disabled?: boolean;
    } = {},
  ) {
    const result = mount(html`
      <shadowing-range-panel
        .selectActive=${overrides.selectActive ?? false}
        .anchor=${overrides.anchor ?? null}
        .range=${overrides.range ?? null}
        .focus=${overrides.focus ?? false}
        .disabled=${overrides.disabled ?? false}
      ></shadowing-range-panel>
    `);
    cleanup = result.cleanup;
    const el = result.container.querySelector('shadowing-range-panel') as ShadowingRangePanel;
    await el.updateComplete;
    return el;
  }

  it('shows only the select switch when inactive', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.querySelector('ui-switch')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.group-intro')?.textContent).toContain('开始的那一句');
    expect(el.shadowRoot?.querySelector('.switch-label')?.textContent).toContain('开启选段');
    expect(el.shadowRoot?.querySelector('.range-hint')).toBeNull();
    expect(el.shadowRoot?.querySelector('.range-chip')).toBeNull();
  });

  it('shows hint when select mode is active without a range', async () => {
    const el = await renderPanel({ selectActive: true });
    expect(el.shadowRoot?.querySelector('.range-hint')?.textContent).toContain(
      '先点开始句，再点最后一句',
    );
  });

  it('shows chip and focus toggle when range is set', async () => {
    const el = await renderPanel({
      selectActive: true,
      range: { start: 1, end: 3 },
    });
    expect(el.shadowRoot?.querySelector('.range-chip')?.textContent).toContain('#2–#4');
    expect(el.shadowRoot?.querySelectorAll('ui-switch').length).toBe(2);
  });

  it('toggles select when the label is clicked', async () => {
    const el = await renderPanel();
    const handler = vi.fn();
    el.addEventListener('shadowing-range-select-active-change', handler);

    const label = el.shadowRoot?.querySelector('.switch-label') as HTMLElement;
    const row = label.parentElement;
    expect(row?.classList.contains('switch-row')).toBe(true);
    expect(row?.querySelector('ui-switch')).not.toBeNull();
    label.click();

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { active: true } }));
  });

  it('toggles focus when its label is clicked', async () => {
    const el = await renderPanel({
      selectActive: true,
      range: { start: 1, end: 3 },
    });
    const handler = vi.fn();
    el.addEventListener('shadowing-range-focus-change', handler);

    const label = [...(el.shadowRoot?.querySelectorAll('.switch-label') ?? [])].find((node) =>
      node.textContent?.includes('仅看选段'),
    ) as HTMLElement;
    label.click();

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { focus: true } }));
  });

  it('ignores label clicks when disabled', async () => {
    const el = await renderPanel({ disabled: true });
    const handler = vi.fn();
    el.addEventListener('shadowing-range-select-active-change', handler);

    (el.shadowRoot?.querySelector('.switch-label') as HTMLElement).click();

    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches select-active-change when toggled', async () => {
    const el = await renderPanel();
    const handler = vi.fn();
    el.addEventListener('shadowing-range-select-active-change', handler);

    const toggle = el.shadowRoot?.querySelector('ui-switch') as HTMLElement & {
      checked: boolean;
    };
    toggle.checked = true;
    toggle.dispatchEvent(new CustomEvent('change', { detail: { checked: true }, bubbles: true }));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { active: true } }));
  });

  it('dispatches clear when clear is clicked', async () => {
    const el = await renderPanel({
      selectActive: true,
      anchor: 2,
    });
    const handler = vi.fn();
    el.addEventListener('shadowing-range-clear', handler);

    const clearBtn = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])].find((btn) =>
      btn.textContent?.includes('清除'),
    );
    clearBtn?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(handler).toHaveBeenCalled();
  });
});
