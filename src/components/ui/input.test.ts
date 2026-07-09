import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './input.js';
import { UiInput, UiInputPassword, UiInputSearch, UiInputTextArea } from './input.js';
import { mount } from './test-utils.js';

describe('ui-input', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function render<T extends HTMLElement>(template: ReturnType<typeof html>): Promise<T> {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.firstElementChild as T;
    await (el as unknown as { updateComplete: Promise<boolean> }).updateComplete;
    return el;
  }

  describe('ui-input', () => {
    it('renders value and placeholder', async () => {
      const el = await render<UiInput>(
        html`<ui-input value="hello" placeholder="Type here"></ui-input>`,
      );
      const input = el.shadowRoot?.querySelector('input.control') as HTMLInputElement;
      expect(input.value).toBe('hello');
      expect(input.placeholder).toBe('Type here');
    });

    it('dispatches change on input', async () => {
      const el = await render<UiInput>(html`<ui-input value=""></ui-input>`);
      const handler = vi.fn();
      el.addEventListener('change', handler);
      const input = el.shadowRoot?.querySelector('input.control') as HTMLInputElement;
      input.value = 'new';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail.value).toBe('new');
    });

    it('dispatches press-enter on Enter key', async () => {
      const el = await render<UiInput>(html`<ui-input value="abc"></ui-input>`);
      const handler = vi.fn();
      el.addEventListener('press-enter', handler);
      el.shadowRoot
        ?.querySelector('input.control')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail.value).toBe('abc');
    });

    it('shows clear button and clears value', async () => {
      const el = await render<UiInput>(html`<ui-input value="text" allow-clear></ui-input>`);
      expect(el.shadowRoot?.querySelector('.clear')).not.toBeNull();
      const changeHandler = vi.fn();
      const clearHandler = vi.fn();
      el.addEventListener('change', changeHandler);
      el.addEventListener('clear', clearHandler);
      el.shadowRoot?.querySelector<HTMLButtonElement>('.clear')?.click();
      expect(changeHandler).toHaveBeenCalledOnce();
      expect(changeHandler.mock.calls[0][0].detail.value).toBe('');
      expect(clearHandler).toHaveBeenCalledOnce();
    });

    it('applies status-error class', async () => {
      const el = await render<UiInput>(html`<ui-input status="error"></ui-input>`);
      expect(el.shadowRoot?.querySelector('.wrapper')?.classList.contains('status-error')).toBe(
        true,
      );
    });

    it('focus() focuses the control', async () => {
      const el = await render<UiInput>(html`<ui-input></ui-input>`);
      el.focus();
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.wrapper')?.classList.contains('focused')).toBe(true);
    });
  });

  describe('ui-input-textarea', () => {
    it('renders textarea with rows', async () => {
      const el = await render<UiInputTextArea>(
        html`<ui-input-textarea value="notes" rows="3"></ui-input-textarea>`,
      );
      const textarea = el.shadowRoot?.querySelector('textarea.control') as HTMLTextAreaElement;
      expect(textarea.value).toBe('notes');
      expect(Number(textarea.rows)).toBe(3);
    });

    it('shows character count when show-count is set', async () => {
      const el = await render<UiInputTextArea>(
        html`<ui-input-textarea value="hi" show-count max-length="10"></ui-input-textarea>`,
      );
      expect(el.shadowRoot?.querySelector('.count')?.textContent).toBe('2 / 10');
    });
  });

  describe('ui-input-search', () => {
    it('dispatches search on Enter', async () => {
      const el = await render<UiInputSearch>(
        html`<ui-input-search value="query"></ui-input-search>`,
      );
      const handler = vi.fn();
      el.addEventListener('search', handler);
      el.shadowRoot
        ?.querySelector('input.control')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail).toMatchObject({ value: 'query', source: 'input' });
    });

    it('dispatches search when search icon is clicked', async () => {
      const el = await render<UiInputSearch>(html`<ui-input-search value="q"></ui-input-search>`);
      const handler = vi.fn();
      el.addEventListener('search', handler);
      el.shadowRoot?.querySelector<HTMLButtonElement>('.icon-btn')?.click();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('dispatches search with clear source after clear', async () => {
      const el = await render<UiInputSearch>(
        html`<ui-input-search value="q" allow-clear></ui-input-search>`,
      );
      const handler = vi.fn();
      el.addEventListener('search', handler);
      el.shadowRoot?.querySelector<HTMLButtonElement>('.clear')?.click();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail).toMatchObject({ value: '', source: 'clear' });
    });

    it('renders enter button when enterButton is set', async () => {
      const el = await render<UiInputSearch>(
        html`<ui-input-search .enterButton=${'Go'}></ui-input-search>`,
      );
      expect(el.shadowRoot?.querySelector('.search-btn')?.textContent?.trim()).toBe('Go');
    });
  });

  describe('ui-input-password', () => {
    it('masks value by default', async () => {
      const el = await render<UiInputPassword>(
        html`<ui-input-password value="secret"></ui-input-password>`,
      );
      expect(el.shadowRoot?.querySelector('input.control')?.getAttribute('type')).toBe('password');
    });

    it('toggles visibility and dispatches password-visible-change', async () => {
      const el = await render<UiInputPassword>(
        html`<ui-input-password value="secret"></ui-input-password>`,
      );
      const handler = vi.fn();
      el.addEventListener('password-visible-change', handler);
      el.shadowRoot?.querySelector<HTMLButtonElement>('.icon-btn')?.click();
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('input.control')?.getAttribute('type')).toBe('text');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail.passwordVisible).toBe(true);
    });

    it('respects controlled passwordVisible property', async () => {
      const el = await render<UiInputPassword>(
        html`<ui-input-password value="secret" .passwordVisible=${true}></ui-input-password>`,
      );
      expect(el.shadowRoot?.querySelector('input.control')?.getAttribute('type')).toBe('text');
    });

    it('supports uncontrolled defaultValue', async () => {
      const el = await render<UiInput>(html`<ui-input default-value="hello"></ui-input>`);
      expect(el.shadowRoot?.querySelector('input.control')?.value).toBe('hello');
      const handler = vi.fn();
      el.addEventListener('update:value', handler);
      const input = el.shadowRoot?.querySelector('input.control') as HTMLInputElement;
      input.value = 'world';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await el.updateComplete;
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail.value).toBe('world');
      expect(el.shadowRoot?.querySelector('input.control')?.value).toBe('world');
    });
  });
});
