import { describe, expect, it } from 'vitest';

import { Z_INDEX } from './z-index.js';

describe('Z_INDEX', () => {
  it('orders dropdown below fullscreen above-fullscreen popup modal and toast', () => {
    expect(Z_INDEX.DROPDOWN).toBeLessThan(Z_INDEX.FULLSCREEN);
    expect(Z_INDEX.FULLSCREEN).toBeLessThan(Z_INDEX.POPUP_ABOVE_FULLSCREEN);
    expect(Z_INDEX.POPUP_ABOVE_FULLSCREEN).toBeLessThan(Z_INDEX.ECHO_SESSION_DOCK);
    expect(Z_INDEX.ECHO_SESSION_DOCK).toBeLessThan(Z_INDEX.MODAL);
    expect(Z_INDEX.MODAL).toBeLessThan(Z_INDEX.TOAST);
  });
});
