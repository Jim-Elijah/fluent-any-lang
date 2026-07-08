import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defaultFilterOption,
  findOption,
  flattenOptions,
  isSelectOptionGroup,
  type SelectOptions,
} from './select.js';
import './select.js';
import { UiSelect } from './select.js';
import { flushUpdates, getPortalShadow, mount } from './test-utils.js';

const OPTIONS: SelectOptions[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', disabled: true },
  {
    label: 'Citrus',
    options: [
      { value: 'c', label: 'Cherry' },
      { value: 'o', label: 'Orange' },
    ],
  },
];

describe('select utilities', () => {
  it('isSelectOptionGroup identifies groups', () => {
    expect(isSelectOptionGroup(OPTIONS[2]!)).toBe(true);
    expect(isSelectOptionGroup(OPTIONS[0]!)).toBe(false);
  });

  it('flattenOptions flattens nested groups', () => {
    expect(flattenOptions(OPTIONS).map((o) => o.value)).toEqual(['a', 'b', 'c', 'o']);
  });

  it('findOption finds by value in flat and grouped lists', () => {
    expect(findOption('o', OPTIONS)?.label).toBe('Orange');
    expect(findOption('missing', OPTIONS)).toBeUndefined();
  });

  it('defaultFilterOption matches label case-insensitively', () => {
    expect(defaultFilterOption('app', { value: 'a', label: 'Apple' })).toBe(true);
    expect(defaultFilterOption('xyz', { value: 'a', label: 'Apple' })).toBe(false);
  });
});

describe('ui-select', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
    document.querySelector('[data-ui-select-portal]')?.remove();
  });

  async function renderSelect(
    template = html`<ui-select .options=${OPTIONS} placeholder="Pick one"></ui-select>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-select') as UiSelect;
    await el.updateComplete;
    return el;
  }

  function getDropdown() {
    return getPortalShadow('[data-ui-select-portal]')?.querySelector('.dropdown');
  }

  it('shows placeholder when no value selected', async () => {
    const el = await renderSelect();
    expect(el.shadowRoot?.querySelector('.selection')?.textContent?.trim()).toBe('Pick one');
    expect(el.shadowRoot?.querySelector('.selection')?.classList.contains('placeholder')).toBe(
      true,
    );
  });

  it('opens dropdown on selector click and lists options', async () => {
    const el = await renderSelect();
    el.shadowRoot?.querySelector<HTMLElement>('.selector')?.click();
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('.selector')?.classList.contains('open')).toBe(true);
    expect(getDropdown()?.querySelectorAll('.option').length).toBe(4);
  });

  it('selects option and dispatches change and select events', async () => {
    const el = await renderSelect();
    const changeHandler = vi.fn();
    const selectHandler = vi.fn();
    el.addEventListener('change', changeHandler);
    el.addEventListener('select', selectHandler);

    el.shadowRoot?.querySelector<HTMLElement>('.selector')?.click();
    await el.updateComplete;
    await flushUpdates();

    getDropdown()?.querySelector<HTMLElement>('.option')?.click();
    await el.updateComplete;

    expect(changeHandler).toHaveBeenCalledOnce();
    expect(changeHandler.mock.calls[0][0].detail.value).toBe('a');
    expect(selectHandler).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.querySelector('.selection')?.textContent?.trim()).toBe('Apple');
  });

  it('does not open when disabled', async () => {
    const el = await renderSelect(html`<ui-select disabled .options=${OPTIONS}></ui-select>`);
    const openHandler = vi.fn();
    el.addEventListener('open-change', openHandler);
    el.shadowRoot?.querySelector<HTMLElement>('.selector')?.click();
    await el.updateComplete;
    expect(openHandler).not.toHaveBeenCalled();
  });

  it('clears selection when allow-clear is clicked', async () => {
    const el = await renderSelect(
      html`<ui-select allow-clear .defaultValue=${'a'} .options=${OPTIONS}></ui-select>`,
    );
    await el.updateComplete;
    await el.updateComplete;
    const clearHandler = vi.fn();
    const changeHandler = vi.fn();
    el.addEventListener('clear', clearHandler);
    el.addEventListener('change', changeHandler);

    el.shadowRoot?.querySelector<HTMLButtonElement>('.clear')?.click();
    await el.updateComplete;

    expect(clearHandler).toHaveBeenCalledOnce();
    expect(changeHandler).toHaveBeenCalledOnce();
    expect(changeHandler.mock.calls[0][0].detail.value).toBeUndefined();
  });

  it('renders search input when show-search is enabled', async () => {
    const el = await renderSelect(html`<ui-select show-search .options=${OPTIONS}></ui-select>`);
    el.shadowRoot?.querySelector<HTMLElement>('.selector')?.click();
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-ui-select-portal]')?.querySelector('.search-input'),
    ).not.toBeNull();
  });

  it('closes on Escape key', async () => {
    const el = await renderSelect();
    el.shadowRoot?.querySelector<HTMLElement>('.selector')?.click();
    await el.updateComplete;
    await flushUpdates();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.selector')?.classList.contains('open')).toBe(false);
  });

  it('initializes from defaultValue', async () => {
    const el = await renderSelect(
      html`<ui-select .defaultValue=${'a'} .options=${OPTIONS}></ui-select>`,
    );
    await el.updateComplete;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.selection')?.textContent?.trim()).toBe('Apple');
  });
});
