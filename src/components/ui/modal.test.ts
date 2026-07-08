import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './modal.js';
import { UiModal } from './modal.js';
import { mount } from './test-utils.js';

describe('ui-modal', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderModal(template = html`<ui-modal open title="Test Modal">Body</ui-modal>`) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-modal') as UiModal;
    await el.updateComplete;
    return el;
  }

  it('renders dialog when open', async () => {
    const el = await renderModal();
    expect(el.shadowRoot?.querySelector('.dialog')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.title')?.textContent?.trim()).toBe('Test Modal');
  });

  it('does not render overlay before first open', async () => {
    const result = mount(html`<ui-modal title="Hidden">Body</ui-modal>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-modal') as UiModal;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.overlay')).toBeNull();
  });

  it('dispatches ok and close on OK click', async () => {
    const el = await renderModal();
    const okHandler = vi.fn();
    const closeHandler = vi.fn();
    el.addEventListener('ok', okHandler);
    el.addEventListener('close', closeHandler);

    el.shadowRoot?.querySelector<HTMLButtonElement>('.btn.primary')?.click();
    expect(okHandler).toHaveBeenCalled();
    expect(closeHandler).toHaveBeenCalledOnce();
    expect(closeHandler.mock.calls[0][0].detail.reason).toBe('ok');
  });

  it('dispatches cancel on cancel button click', async () => {
    const el = await renderModal();
    const cancelHandler = vi.fn();
    el.addEventListener('cancel', cancelHandler);
    el.shadowRoot?.querySelector<HTMLButtonElement>('.btn.ghost')?.click();
    expect(cancelHandler).toHaveBeenCalledOnce();
  });

  it('respects beforeClose preventDefault', async () => {
    const el = await renderModal();
    el.addEventListener('beforeClose', (e) => e.preventDefault());
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);
    el.shadowRoot?.querySelector<HTMLButtonElement>('.btn.ghost')?.click();
    expect(closeHandler).not.toHaveBeenCalled();
  });

  it('closes on Escape when keyboard is enabled', async () => {
    const el = await renderModal();
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(closeHandler).toHaveBeenCalledOnce();
    expect(closeHandler.mock.calls[0][0].detail.reason).toBe('cancel');
  });

  it('does not close on Escape when keyboard is disabled', async () => {
    const el = await renderModal(html`<ui-modal open .keyboard=${false}>Body</ui-modal>`);
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closeHandler).not.toHaveBeenCalled();
  });

  it('closes on mask click when maskClosable', async () => {
    const el = await renderModal();
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);
    el.shadowRoot?.querySelector<HTMLElement>('.overlay')?.click();
    expect(closeHandler).toHaveBeenCalledOnce();
    expect(closeHandler.mock.calls[0][0].detail.reason).toBe('mask');
  });

  it('uses visible property as open alias', async () => {
    const result = mount(html`<ui-modal .visible=${true} title="Visible">Body</ui-modal>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-modal') as UiModal;
    await el.updateComplete;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.dialog')).not.toBeNull();
  });

  it('hides default footer when footer is false', async () => {
    const el = await renderModal(html`<ui-modal open .footer=${false}>Body</ui-modal>`);
    expect(el.shadowRoot?.querySelector('.footer .btn')).toBeNull();
    expect(el.shadowRoot?.querySelector('slot[name="footer"]')).not.toBeNull();
  });

  it('disables OK button when confirmLoading', async () => {
    const el = await renderModal(html`<ui-modal open confirm-loading>Body</ui-modal>`);
    expect(el.shadowRoot?.querySelector<HTMLButtonElement>('.btn.primary')?.disabled).toBe(true);
  });
});
