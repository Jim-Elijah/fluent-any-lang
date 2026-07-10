import { describe, expect, it, vi } from 'vitest';

import { emitOpenChange } from './open-change.js';

describe('emitOpenChange', () => {
  function collectEvents(host: HTMLElement) {
    const events: { type: string; detail: unknown }[] = [];
    for (const type of ['open-change', 'update:open', 'open', 'close'] as const) {
      host.addEventListener(type, (e) => {
        events.push({ type, detail: (e as CustomEvent).detail });
      });
    }
    return events;
  }

  it('dispatches open-change, update:open, and open when opening', () => {
    const host = document.createElement('div');
    const events = collectEvents(host);

    emitOpenChange(host, true, { trigger: 'click' });

    expect(events.map((e) => e.type)).toEqual(['open-change', 'update:open', 'open']);
    expect(events[0]?.detail).toEqual({ open: true, trigger: 'click' });
    expect(events[2]?.detail).toEqual({ trigger: 'click' });
  });

  it('dispatches open-change, update:open, and close when closing', () => {
    const host = document.createElement('div');
    const events = collectEvents(host);

    emitOpenChange(host, false, { reason: 'esc' });

    expect(events.map((e) => e.type)).toEqual(['open-change', 'update:open', 'close']);
    expect(events[0]?.detail).toEqual({ open: false, reason: 'esc' });
    expect(events[2]?.detail).toEqual({ reason: 'esc' });
  });

  it('uses custom detail factory when provided', () => {
    const host = document.createElement('div');
    const detail = vi.fn((next: boolean, meta) => ({ next, source: meta.source }));
    const events: unknown[] = [];
    host.addEventListener('open-change', (e) => events.push((e as CustomEvent).detail));

    emitOpenChange(host, true, { source: 'test' }, { detail });

    expect(detail).toHaveBeenCalledWith(true, { source: 'test' });
    expect(events[0]).toEqual({ next: true, source: 'test' });
  });

  it('skips open/close lifecycle events when skipLifecycle is set', () => {
    const host = document.createElement('div');
    const open = vi.fn();
    const close = vi.fn();
    host.addEventListener('open', open);
    host.addEventListener('close', close);

    emitOpenChange(host, true, {}, { skipLifecycle: true });
    emitOpenChange(host, false, {}, { skipLifecycle: true });

    expect(open).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('bubbles and is composed', () => {
    const host = document.createElement('div');
    const parent = document.createElement('div');
    parent.appendChild(host);
    const handler = vi.fn();
    parent.addEventListener('update:open', handler);

    emitOpenChange(host, true);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].composed).toBe(true);
    expect(handler.mock.calls[0][0].bubbles).toBe(true);
  });
});
