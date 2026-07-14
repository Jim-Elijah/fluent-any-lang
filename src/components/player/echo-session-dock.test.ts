import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WaveformController } from '../../controllers/waveform-controller.js';
import { getPortalShadow, mount } from '../ui/test-utils.js';
import './echo-session-dock.js';
import type { EchoSessionDock } from './echo-session-dock.js';

describe('echo-session-dock', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.querySelector('[data-echo-session-dock-portal]')?.remove();
    document.documentElement.style.removeProperty('scroll-padding-bottom');
    document.documentElement.style.removeProperty('--echo-dock-inset');
    document.documentElement.style.removeProperty('--session-dock-inset');
  });

  async function renderDock(phase: EchoSessionDock['phase'] = 'idle') {
    const controller = new WaveformController();
    const result = mount(html`
      <echo-session-dock .phase=${phase} .waveformController=${controller}></echo-session-dock>
    `);
    cleanup = result.cleanup;
    const el = result.container.querySelector('echo-session-dock') as EchoSessionDock;
    await el.updateComplete;
    return { el, controller };
  }

  it('does not portal content when idle', async () => {
    await renderDock('idle');
    expect(document.querySelector('[data-echo-session-dock-portal]')).toBeNull();
  });

  it('portals listening status above the page', async () => {
    await renderDock('listening');
    const portal = getPortalShadow('[data-echo-session-dock-portal]');
    expect(portal?.querySelector('.dock')).not.toBeNull();
    expect(portal?.textContent).toContain('正在播放原音');
    expect(document.documentElement.style.getPropertyValue('scroll-padding-bottom')).toBe('140px');
    expect(document.documentElement.style.getPropertyValue('--session-dock-inset')).toBe('140px');
  });

  it('hides during countdown phase', async () => {
    const { el } = await renderDock('listening');
    el.phase = 'countdown';
    await el.updateComplete;
    const portal = getPortalShadow('[data-echo-session-dock-portal]');
    expect(portal?.querySelector('.dock')).toBeNull();
  });

  it('shows waveform and stop control while recording', async () => {
    const { el, controller } = await renderDock('listening');
    el.phase = 'recording';
    el.waveformController = controller;
    await el.updateComplete;

    const portal = getPortalShadow('[data-echo-session-dock-portal]');
    expect(portal?.querySelector('waveform-player')).not.toBeNull();
    expect(portal?.textContent).toContain('录音中');
  });

  it('emits stop when stop button is clicked', async () => {
    const { el } = await renderDock('recording');
    const onStop = vi.fn();
    el.addEventListener('echo-session-stop', onStop);
    await el.updateComplete;

    const portal = getPortalShadow('[data-echo-session-dock-portal]');
    portal?.querySelector('ui-button')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
