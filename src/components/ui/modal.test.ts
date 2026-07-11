import { css, html, LitElement } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './modal.js';
import { getModalPortalRoot, UiModal } from './modal.js';
import { Z_INDEX } from './internal/z-index.js';
import { mount } from './test-utils.js';

class ModalChildStub extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`<span class="child">child</span>`;
  }
}

class ModalHostStub extends LitElement {
  private _open = true;

  private _handleClose() {
    this._open = false;
  }

  render() {
    return html`
      <ui-modal
        ?open=${this._open}
        title="Host"
        @close=${() => this._handleClose()}
        ?destroy-on-close=${true}
      >
        ${this._open ? html`<modal-child-stub></modal-child-stub>` : null}
      </ui-modal>
    `;
  }
}

customElements.define('modal-child-stub', ModalChildStub);
customElements.define('modal-host-stub', ModalHostStub);

function queryModal<T extends Element = Element>(selector: string): T | null {
  return getModalPortalRoot()?.querySelector(selector) as T | null;
}

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

  it('renders dialog in shadow root when open', async () => {
    await renderModal();
    expect(queryModal('.dialog')).not.toBeNull();
    expect(queryModal('.title')?.textContent?.trim()).toBe('Test Modal');
    expect(getModalPortalRoot()).not.toBeNull();
  });

  it('renders default slot content in the dialog body', async () => {
    const el = await renderModal();
    const slot = el.shadowRoot?.querySelector('.body > slot') as HTMLSlotElement | undefined;
    const assignedText = slot
      ?.assignedNodes({ flatten: true })
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
    expect(assignedText).toBe('Body');
  });

  it('does not render overlay before first open', async () => {
    const result = mount(html`<ui-modal title="Hidden">Body</ui-modal>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-modal') as UiModal;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.dialog')).toBeNull();
  });

  it('uses z-index above fullscreen overlay by default', async () => {
    const el = await renderModal();
    expect(el.style.getPropertyValue('--modal-z')).toBe(String(Z_INDEX.MODAL));
    expect(Number(el.style.getPropertyValue('--modal-z'))).toBeGreaterThan(Z_INDEX.FULLSCREEN);
  });

  it('dispatches ok and close on OK click', async () => {
    const el = await renderModal();
    const okHandler = vi.fn();
    const closeHandler = vi.fn();
    el.addEventListener('ok', okHandler);
    el.addEventListener('close', closeHandler);

    queryModal<HTMLButtonElement>('.btn.primary')?.click();
    expect(okHandler).toHaveBeenCalled();
    expect(closeHandler).toHaveBeenCalledOnce();
    expect(closeHandler.mock.calls[0][0].detail.reason).toBe('ok');
  });

  it('dispatches cancel on cancel button click', async () => {
    const el = await renderModal();
    const cancelHandler = vi.fn();
    el.addEventListener('cancel', cancelHandler);
    queryModal<HTMLButtonElement>('.btn.ghost')?.click();
    expect(cancelHandler).toHaveBeenCalledOnce();
  });

  it('respects beforeClose preventDefault', async () => {
    const el = await renderModal();
    el.addEventListener('beforeClose', (e) => e.preventDefault());
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);
    queryModal<HTMLButtonElement>('.btn.ghost')?.click();
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
    queryModal<HTMLElement>('.overlay')?.click();
    expect(closeHandler).toHaveBeenCalledOnce();
    expect(closeHandler.mock.calls[0][0].detail.reason).toBe('mask');
  });

  it('dispatches update:open on close', async () => {
    const el = await renderModal();
    const updateHandler = vi.fn();
    el.addEventListener('update:open', updateHandler);
    queryModal<HTMLButtonElement>('.btn.ghost')?.click();
    expect(updateHandler).toHaveBeenCalledOnce();
    expect(updateHandler.mock.calls[0][0].detail.open).toBe(false);
  });

  it('hides default footer when footer is false', async () => {
    await renderModal(html`<ui-modal open .footer=${false}>Body</ui-modal>`);
    expect(queryModal('.footer .btn')).toBeNull();
    expect(queryModal('.footer')).not.toBeNull();
  });

  it('disables OK button when confirmLoading', async () => {
    await renderModal(html`<ui-modal open confirm-loading>Body</ui-modal>`);
    expect(queryModal<HTMLButtonElement>('.btn.primary')?.disabled).toBe(true);
  });

  it('closes without breaking Lit-managed slot content', async () => {
    const host = document.createElement('modal-host-stub') as LitElement;
    document.body.appendChild(host);
    cleanup = () => host.remove();
    await host.updateComplete;

    const modal = host.renderRoot.querySelector('ui-modal') as UiModal;
    expect(modal.querySelector('modal-child-stub')).not.toBeNull();

    queryModal<HTMLElement>('.overlay')?.click();
    await host.updateComplete;
    await modal.updateComplete;

    host.requestUpdate();
    await host.updateComplete;
  });
});
