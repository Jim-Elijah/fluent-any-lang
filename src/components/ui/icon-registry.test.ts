import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_SPRITE =
  "<svg><symbol id='icon-play' viewBox='0 0 24 24'><path d='M0 0'/></symbol></svg>";

describe('icon-registry', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window._iconfont_svg_string_5204781;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadRegistry() {
    window._iconfont_svg_string_5204781 = SAMPLE_SPRITE;
    return import('./icon-registry.js');
  }

  it('registers icons from global sprite on load', async () => {
    const { getIconSymbol } = await loadRegistry();
    expect(getIconSymbol('play')).toBeDefined();
    expect(getIconSymbol('icon-play')).toBeDefined();
    expect(getIconSymbol('play')?.viewBox).toBe('0 0 24 24');
  });

  it('normalizes icon names with icon- prefix', async () => {
    const { getIconSymbol } = await loadRegistry();
    expect(getIconSymbol('  play  ')).toEqual(getIconSymbol('icon-play'));
  });

  it('returns undefined for unknown or empty names', async () => {
    const { getIconSymbol } = await loadRegistry();
    expect(getIconSymbol('missing')).toBeUndefined();
    expect(getIconSymbol('')).toBeUndefined();
    expect(getIconSymbol('   ')).toBeUndefined();
  });

  it('loads sprite from iconfont.js when global sprite is absent', async () => {
    const js = `_iconfont_svg_string_123='${SAMPLE_SPRITE}'`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(js),
      }),
    );

    const { ensureIconRegistry, getIconSymbol } = await import('./icon-registry.js');
    await ensureIconRegistry();

    expect(fetch).toHaveBeenCalledWith('/font/iconfont.js');
    expect(getIconSymbol('play')).toBeDefined();
  });

  it('throws when iconfont.js response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const { ensureIconRegistry } = await import('./icon-registry.js');
    await expect(ensureIconRegistry()).rejects.toThrow('Failed to load iconfont.js (404)');
  });

  it('resolve immediately when registry is already populated', async () => {
    const { ensureIconRegistry, getIconSymbol } = await loadRegistry();
    expect(getIconSymbol('play')).toBeDefined();
    await expect(ensureIconRegistry()).resolves.toBeUndefined();
  });
});
