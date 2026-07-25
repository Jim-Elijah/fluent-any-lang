import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shouldSkipShadowingTips = vi.fn(() => false);
const shouldSkipEchoTips = vi.fn(() => false);
const shouldSkipDiscriminationTips = vi.fn(() => false);

vi.mock('../../lib/app-settings.js', () => ({
  shouldSkipDiscriminationTips: () => shouldSkipDiscriminationTips(),
}));

vi.mock('../../lib/user-settings.js', () => ({
  shouldSkipShadowingTips: () => shouldSkipShadowingTips(),
  shouldSkipEchoTips: () => shouldSkipEchoTips(),
}));

import './practice-tips-modal.js';
import type { PracticeTipsModal } from './practice-tips-modal.js';
import { getModalPortalRoot } from '../ui/modal.js';
import { mount } from '../ui/test-utils.js';

describe('practice-tips-modal', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    shouldSkipShadowingTips.mockReturnValue(false);
    shouldSkipEchoTips.mockReturnValue(false);
    shouldSkipDiscriminationTips.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderModal(kind: PracticeTipsModal['kind'] = null) {
    const result = mount(html`<practice-tips-modal .kind=${kind}></practice-tips-modal>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-tips-modal') as PracticeTipsModal;
    await el.updateComplete;
    return el;
  }

  function getModal(el: PracticeTipsModal) {
    return el.shadowRoot?.querySelector('ui-modal') as HTMLElement | null;
  }

  it('renders nothing when kind is null', async () => {
    const el = await renderModal(null);
    expect(el.shadowRoot?.querySelector('ui-modal')).toBeNull();
  });

  it.each(['shadowing', 'echo', 'discrimination'] as const)(
    'opens modal with tips for %s kind',
    async (kind) => {
      const el = await renderModal(kind);
      const modal = getModal(el);
      expect(modal).not.toBeNull();
      expect(getModalPortalRoot()?.querySelector('.dialog')).not.toBeNull();
      expect(el.shadowRoot?.querySelectorAll('.tips-modal-body div').length).toBeGreaterThan(0);
    },
  );

  it('shows skip checkbox when tips are not skipped for the kind', async () => {
    const el = await renderModal('shadowing');
    expect(el.shadowRoot?.querySelector('.tips-skip input[type="checkbox"]')).not.toBeNull();
  });

  it('hides skip checkbox when tips are already skipped for the kind', async () => {
    shouldSkipShadowingTips.mockReturnValue(true);
    const el = await renderModal('shadowing');
    expect(el.shadowRoot?.querySelector('.tips-skip')).toBeNull();
  });

  it('dispatches confirm with skipFuture false by default', async () => {
    const el = await renderModal('echo');
    const confirmHandler = vi.fn();
    el.addEventListener('confirm', confirmHandler);

    el.shadowRoot
      ?.querySelector('ui-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(confirmHandler).toHaveBeenCalledOnce();
    expect(confirmHandler.mock.calls[0][0].detail).toEqual({
      kind: 'echo',
      skipFuture: false,
    });
  });

  it('dispatches confirm with skipFuture true when checkbox is checked', async () => {
    const el = await renderModal('discrimination');
    const confirmHandler = vi.fn();
    el.addEventListener('confirm', confirmHandler);

    const checkbox = el.shadowRoot?.querySelector(
      '.tips-skip input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    el.shadowRoot
      ?.querySelector('ui-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(confirmHandler).toHaveBeenCalledOnce();
    expect(confirmHandler.mock.calls[0][0].detail).toEqual({
      kind: 'discrimination',
      skipFuture: true,
    });
  });

  it('dispatches close when ui-modal emits update:open false', async () => {
    const el = await renderModal('shadowing');
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);

    const modal = getModal(el)!;
    modal.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );

    expect(closeHandler).toHaveBeenCalledOnce();
  });

  it('does not dispatch close when update:open bubbles from a nested target', async () => {
    const el = await renderModal('shadowing');
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);

    const modal = getModal(el)!;
    const nested = document.createElement('div');
    modal.appendChild(nested);
    nested.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );

    expect(closeHandler).not.toHaveBeenCalled();
  });

  it('resets skip checkbox when kind changes', async () => {
    const el = await renderModal('shadowing');
    const checkbox = el.shadowRoot?.querySelector(
      '.tips-skip input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    el.kind = 'echo';
    await el.updateComplete;

    const echoCheckbox = el.shadowRoot?.querySelector(
      '.tips-skip input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(echoCheckbox.checked).toBe(false);
  });
});
