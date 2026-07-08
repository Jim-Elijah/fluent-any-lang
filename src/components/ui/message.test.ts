import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Message, UiMessageItem } from './message.js';
import { mount } from './test-utils.js';

describe('ui-message-item', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders message text and type icon', async () => {
    const result = mount(html`<ui-message-item message="Saved" type="success"></ui-message-item>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-message-item') as UiMessageItem;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.content')?.textContent).toBe('Saved');
    expect(el.shadowRoot?.querySelector('.message')?.classList.contains('success')).toBe(true);
  });

  it('shows repeat badge when repeatNum > 1', async () => {
    const result = mount(html`<ui-message-item message="Dup" repeat-num="3"></ui-message-item>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-message-item') as UiMessageItem;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.badge')?.textContent).toBe('3');
  });

  it('dispatches close event from close button', async () => {
    const result = mount(html`<ui-message-item message="x" show-close></ui-message-item>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-message-item') as UiMessageItem;
    await el.updateComplete;
    const handler = vi.fn();
    el.addEventListener('close', handler);
    el.shadowRoot?.querySelector<HTMLButtonElement>('.close')?.click();
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('Message service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Message.closeAll();
  });

  afterEach(() => {
    Message.closeAll();
    vi.useRealTimers();
  });

  it('shows a message in a container', () => {
    const instance = Message('Hello');
    const item = document.querySelector('ui-message-item') as UiMessageItem;
    expect(item).not.toBeNull();
    expect(item.message).toBe('Hello');
    expect(document.querySelector('[data-ui-message-container]')).not.toBeNull();
    instance.close();
  });

  it('supports typed helpers', () => {
    Message.success('Done');
    const item = document.querySelector('ui-message-item') as UiMessageItem;
    expect(item.type).toBe('success');
    Message.closeAll();
  });

  it('groups duplicate messages when grouping is enabled', () => {
    Message({ message: 'Same', grouping: true });
    Message({ message: 'Same', grouping: true });
    expect(document.querySelectorAll('ui-message-item').length).toBe(1);
    const item = document.querySelector('ui-message-item') as UiMessageItem;
    expect(item.repeatNum).toBe(2);
    Message.closeAll();
  });

  it('auto closes after duration', async () => {
    Message({ message: 'Auto', duration: 1000 });
    expect(document.querySelector('ui-message-item')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.querySelector('ui-message-item')).toBeNull();
  });

  it('respects max config and removes oldest', () => {
    Message.config({ max: 2 });
    Message('One');
    Message('Two');
    Message('Three');
    const items = document.querySelectorAll('ui-message-item');
    expect(items.length).toBe(2);
    expect(items[0]?.message).toBe('Two');
    Message.closeAll();
    Message.config({});
  });

  it('calls onClose callback', async () => {
    const onClose = vi.fn();
    const instance = Message({ message: 'Bye', onClose, duration: 3000 });
    instance.close();
    await vi.advanceTimersByTimeAsync(200);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
