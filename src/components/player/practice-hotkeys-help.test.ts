import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './practice-hotkeys-help.js';
import type { PracticeHotkeysHelp } from './practice-hotkeys-help.js';
import { getModalPortalRoot } from '../ui/modal.js';
import { mount } from '../ui/test-utils.js';

describe('practice-hotkeys-help', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderHelp(open = false) {
    const result = mount(html`<practice-hotkeys-help .open=${open}></practice-hotkeys-help>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-hotkeys-help') as PracticeHotkeysHelp;
    await el.updateComplete;
    return el;
  }

  function getModal(el: PracticeHotkeysHelp) {
    return el.shadowRoot?.querySelector('ui-modal') as HTMLElement | null;
  }

  it('renders nothing when open is false', async () => {
    const el = await renderHelp(false);
    expect(el.shadowRoot?.querySelector('ui-modal')).toBeNull();
  });

  it('renders hotkey list when open is true', async () => {
    const el = await renderHelp(true);
    expect(getModal(el)).not.toBeNull();
    expect(getModalPortalRoot()?.querySelector('.dialog')).not.toBeNull();

    const rows = el.shadowRoot?.querySelectorAll('.hotkeys-help-row');
    expect(rows?.length).toBeGreaterThan(0);
    expect(el.shadowRoot?.querySelector('.hotkeys-help-note')?.textContent?.length).toBeGreaterThan(
      0,
    );
  });

  it('dispatches close when footer button is clicked', async () => {
    const el = await renderHelp(true);
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);

    el.shadowRoot
      ?.querySelector('ui-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(closeHandler).toHaveBeenCalledOnce();
  });

  it('dispatches close when ui-modal emits update:open false', async () => {
    const el = await renderHelp(true);
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);

    getModal(el)!.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );

    expect(closeHandler).toHaveBeenCalledOnce();
  });
});
