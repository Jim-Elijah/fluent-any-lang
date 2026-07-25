import { describe, expect, it } from 'vitest';

import {
  getDiscriminationSummary,
  getDiscriminationTips,
  getEchoSummary,
  getEchoTips,
  getShadowingSummary,
  getShadowingTips,
  getTipsForKind,
  getTipsTitle,
} from './practice-tips.js';

describe('practice-tips', () => {
  it('returns non-empty shadowing tips and summary', () => {
    const tips = getShadowingTips();
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((tip) => typeof tip === 'string' && tip.length > 0)).toBe(true);
    expect(getShadowingSummary().length).toBeGreaterThan(0);
  });

  it('returns non-empty echo tips and summary', () => {
    const tips = getEchoTips();
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((tip) => typeof tip === 'string' && tip.length > 0)).toBe(true);
    expect(getEchoSummary().length).toBeGreaterThan(0);
  });

  it('returns non-empty discrimination tips and summary', () => {
    const tips = getDiscriminationTips();
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((tip) => typeof tip === 'string' && tip.length > 0)).toBe(true);
    expect(getDiscriminationSummary().length).toBeGreaterThan(0);
  });

  it('maps getTipsForKind to the correct tip arrays', () => {
    expect(getTipsForKind('shadowing')).toEqual(getShadowingTips());
    expect(getTipsForKind('echo')).toEqual(getEchoTips());
    expect(getTipsForKind('discrimination')).toEqual(getDiscriminationTips());
  });

  it('returns distinct titles for each practice kind', () => {
    const shadowingTitle = getTipsTitle('shadowing');
    const echoTitle = getTipsTitle('echo');
    const discriminationTitle = getTipsTitle('discrimination');

    expect(shadowingTitle.length).toBeGreaterThan(0);
    expect(echoTitle.length).toBeGreaterThan(0);
    expect(discriminationTitle.length).toBeGreaterThan(0);

    const titles = new Set([shadowingTitle, echoTitle, discriminationTitle]);
    expect(titles.size).toBe(3);
  });

  it('returns distinct summaries for each practice mode', () => {
    const summaries = new Set([
      getShadowingSummary(),
      getEchoSummary(),
      getDiscriminationSummary(),
    ]);
    expect(summaries.size).toBe(3);
  });
});
