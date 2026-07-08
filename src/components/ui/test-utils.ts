import { render, type TemplateResult } from 'lit';

export function mount(template: TemplateResult): {
  container: HTMLDivElement;
  cleanup: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(template, container);
  return {
    container,
    cleanup: () => container.remove(),
  };
}

export async function flushUpdates(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function getPortalShadow(selector: string): ShadowRoot | null {
  const host = document.querySelector(selector);
  return host?.shadowRoot ?? null;
}
