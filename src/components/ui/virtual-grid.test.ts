import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import './virtual-grid.js';
import type { UiVirtualGrid } from './virtual-grid.js';
import { mount } from './test-utils.js';

describe('ui-virtual-grid', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders only visible rows for a long list', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i, label: `Item ${i}` }));
    const result = mount(html`
      <ui-virtual-grid
        .items=${items}
        .itemHeight=${40}
        .containerHeight=${200}
        .gridItems=${1}
        .overscan=${0}
        .renderItem=${(item: unknown) => {
          const row = item as { id: number; label: string };
          return html`<div class="cell">${row.label}</div>`;
        }}
      ></ui-virtual-grid>
    `);
    cleanup = result.cleanup;

    const el = result.container.querySelector('ui-virtual-grid') as UiVirtualGrid;
    await el.updateComplete;
    await el.updateComplete;

    const cells = el.querySelectorAll('.cell');
    // Viewport 200 / 40 = 5 visible rows; without overscan should stay small.
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(items.length);
    expect(el.textContent).toContain('Item 0');
    expect(el.textContent).not.toContain('Item 99');
  });

  it('lays out multiple columns when gridItems > 1', async () => {
    const items = Array.from({ length: 8 }, (_, i) => `n-${i}`);
    const result = mount(html`
      <ui-virtual-grid
        .items=${items}
        .itemHeight=${50}
        .containerHeight=${100}
        .gridItems=${4}
        .overscan=${0}
        .renderItem=${(item: unknown) => html`<div class="cell">${item as string}</div>`}
      ></ui-virtual-grid>
    `);
    cleanup = result.cleanup;

    const el = result.container.querySelector('ui-virtual-grid') as UiVirtualGrid;
    await el.updateComplete;
    await el.updateComplete;

    const rows = el.querySelectorAll('.ui-vg-row');
    expect(rows.length).toBeGreaterThan(0);
    const firstRowCells = rows[0]?.querySelectorAll('.cell') ?? [];
    expect(firstRowCells.length).toBe(4);
  });

  it('updates visible window on scroll', async () => {
    const items = Array.from({ length: 50 }, (_, i) => `row-${i}`);
    const result = mount(html`
      <ui-virtual-grid
        .items=${items}
        .itemHeight=${40}
        .containerHeight=${120}
        .gridItems=${1}
        .overscan=${0}
        .renderItem=${(item: unknown) => html`<div class="cell">${item as string}</div>`}
      ></ui-virtual-grid>
    `);
    cleanup = result.cleanup;

    const el = result.container.querySelector('ui-virtual-grid') as UiVirtualGrid;
    await el.updateComplete;

    const container = el.querySelector('.ui-vg-container') as HTMLElement;
    container.scrollTop = 400; // row 10
    container.dispatchEvent(new Event('scroll'));
    await el.updateComplete;

    expect(el.textContent).toContain('row-10');
    expect(el.textContent).not.toContain('row-0');
  });
});
