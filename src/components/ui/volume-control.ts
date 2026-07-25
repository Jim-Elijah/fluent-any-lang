import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import './dropdown.js';
import './slider.js';
import type { DropdownPlacement } from './dropdown.js';
import type { SliderChangeDetail } from './slider.js';
import { Z_INDEX } from './internal/z-index.js';
import { buildSparseMarks } from '../../lib/slider-marks.js';

export type VolumeControlChangeDetail = { value: number };

/**
 * Compact volume trigger (e.g. "50%") that opens a horizontal slider in a dropdown.
 */
@customElement('ui-volume-control')
@localized()
export class UiVolumeControl extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .volume-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2.75rem;
      padding: 2px 8px;
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: transparent;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font: inherit;
      font-size: 0.8125rem;
      line-height: 1.5;
      cursor: pointer;
      white-space: nowrap;
    }

    .volume-trigger:hover:not(:disabled) {
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      border-color: var(--color-primary, #1677ff);
    }

    .volume-trigger--boosted {
      color: var(--color-warning, #fa8c16);
    }

    .volume-trigger:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `;

  @property({ type: Number })
  value = 0.5;

  @property({ type: Number })
  min = 0;

  @property({ type: Number })
  max = 1;

  @property({ type: Number })
  step = 0.05;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: String })
  placement: DropdownPlacement = 'bottom';

  @property({ type: Number, attribute: 'z-index' })
  zIndex = Z_INDEX.DROPDOWN;

  /** Optional label shown above the slider (e.g. track name). */
  @property({ type: String })
  label = '';

  private get _percent(): number {
    return Math.round(Math.max(0, this.value) * 100);
  }

  private _formatPercent(value: number): string {
    return `${Math.round(Math.max(0, value) * 100)}%`;
  }

  /** Noise / simple 0–1 volume: keep fixed 0 / 50 / 100 pattern (not media boost marks). */
  private get _volumeMarks(): Record<number, string> {
    const format = (v: number) => `${Math.round(v * 100)}%`;
    const candidates: Array<readonly [number, string]> = [
      [this.min, format(this.min)],
      [0.5, '50%'],
      [1, '100%'],
    ];
    if (this.max > 1 + 1e-9) {
      candidates.push([this.max, format(this.max)]);
    }
    return buildSparseMarks(this.min, this.max, candidates);
  }

  render() {
    const percent = this._percent;
    const boosted = this.value > 1;
    const title = this.label ? `${this.label} ${percent}%` : `${msg('音量')} ${percent}%`;

    return html`
      <ui-dropdown
        trigger="click"
        placement=${this.placement}
        .arrow=${true}
        .zIndex=${this.zIndex}
        ?disabled=${this.disabled}
        style="--dropdown-overlay-min-width: 160px; --dropdown-overlay-padding-block: var(--space-sm); --dropdown-overlay-padding-inline: var(--space-sm);"
        .overlay=${html`
          <span
            class="overlay-panel-label"
            style=${boosted ? 'color: var(--color-warning, #fa8c16);' : ''}
            >${title}</span
          >
          <ui-slider
            .value=${this.value}
            .min=${this.min}
            .max=${this.max}
            .step=${this.step}
            ?disabled=${this.disabled}
            style="--slider-mark-edge-padding: var(--space-sm);"
            orientation="horizontal"
            .marks=${this._volumeMarks}
            .tooltip=${{
              formatter: (v: number) => this._formatPercent(v),
              placement: 'top',
            }}
            @change=${(e: CustomEvent<SliderChangeDetail>) => this._onSliderChange(e)}
          ></ui-slider>
        `}
      >
        <button
          type="button"
          class="volume-trigger${boosted ? ' volume-trigger--boosted' : ''}"
          ?disabled=${this.disabled}
          title=${title}
          aria-label=${title}
        >
          ${percent}%
        </button>
      </ui-dropdown>
    `;
  }

  private _onSliderChange(e: CustomEvent<SliderChangeDetail>): void {
    const next = Math.max(this.min, Math.min(this.max, e.detail.value));
    this.value = next;
    this.dispatchEvent(
      new CustomEvent<VolumeControlChangeDetail>('change', {
        detail: { value: next },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-volume-control': UiVolumeControl;
  }
}
