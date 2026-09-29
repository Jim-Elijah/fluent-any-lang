import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { flushUpdates, mount } from '../ui/test-utils.js';
import type { UiInput } from '../ui/input.js';

import './library-list-toolbar.js';
import type { LibraryListToolbar, LibraryListToolbarChangeDetail } from './library-list-toolbar.js';

describe('library-list-toolbar', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function render(keyword = ''): Promise<LibraryListToolbar> {
    const result = mount(html`<library-list-toolbar .keyword=${keyword}></library-list-toolbar>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-list-toolbar') as LibraryListToolbar;
    await el.updateComplete;
    return el;
  }

  function nativeInput(el: LibraryListToolbar): HTMLInputElement {
    const field = el.shadowRoot?.querySelector('ui-input') as UiInput;
    return field.shadowRoot?.querySelector('input.control') as HTMLInputElement;
  }

  it('keeps a trailing space when the parent writes the keyword back', async () => {
    const el = await render('hello');
    el.addEventListener('filters-change', ((event: CustomEvent<LibraryListToolbarChangeDetail>) => {
      el.keyword = event.detail.keyword;
    }) as EventListener);

    const input = nativeInput(el);
    input.value = 'hello ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(el.keyword).toBe('hello ');
    expect(input.value).toBe('hello ');
  });
});
