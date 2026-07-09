import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { PortalHost } from './portal-host.js';

describe('PortalHost', () => {
  afterEach(() => {
    document.querySelector('[data-test-portal]')?.remove();
  });

  it('mounts and destroys portal host', () => {
    const host = new PortalHost({
      dataAttr: 'data-test-portal',
      styleText: '.popup { color: red; }',
      zIndex: 100,
      popupContainer: 'body',
    });

    const mount = host.ensureMount();
    expect(mount).toBeTruthy();
    expect(document.querySelector('[data-test-portal]')).not.toBeNull();

    host.render(html`<div class="popup">Hello</div>`);
    expect(host.getPopupEl('.popup')?.textContent).toBe('Hello');

    host.destroy();
    expect(document.querySelector('[data-test-portal]')).toBeNull();
  });
});
