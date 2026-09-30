import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushUpdates, mount } from '../../components/ui/test-utils.js';
import './index.js';
import type { LibraryPage } from './index.js';

describe('library-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPage() {
    const result = mount(html`<library-page></library-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-page') as LibraryPage;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('renders hub links to library sections', async () => {
    const el = await renderPage();
    const buttons = [
      ...(el.shadowRoot?.querySelectorAll('button.link') ?? []),
    ] as HTMLButtonElement[];
    expect(buttons.length).toBe(5);
    expect(el.shadowRoot?.textContent).toContain('媒体库');
    expect(el.shadowRoot?.textContent).toContain('录音库');
    expect(el.shadowRoot?.textContent).toContain('噪音素材');
    expect(el.shadowRoot?.textContent).toContain('播放列表');
    expect(el.shadowRoot?.textContent).toContain('句库');
  });

  it('navigates to a section when a hub link is clicked', async () => {
    const el = await renderPage();
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    const mediaLink = [...(el.shadowRoot?.querySelectorAll('button.link') ?? [])].find((btn) =>
      btn.textContent?.includes('媒体库'),
    ) as HTMLButtonElement;

    mediaLink.click();

    const href = navigateSpy.mock.calls[0]?.[0];
    expect(href).toMatch(/^\/library\/media#[0-9a-z]+$/);
  });
});
