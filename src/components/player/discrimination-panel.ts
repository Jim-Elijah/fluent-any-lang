import { msg, str, localized } from '@lit/localize';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { DiscriminationSettings, NoiseItem } from '../../types/models.js';
import {
  DEFAULT_DISCRIMINATION_SETTINGS,
  DISCRIMINATION_LADDER_COUNT_MAX,
  DISCRIMINATION_LADDER_COUNT_MIN,
  DISCRIMINATION_MAX_NOISE_TRACKS,
  DISCRIMINATION_RATE_STEPS,
} from '../../types/models.js';
import { practiceViewStyles } from './practice-view-styles.js';
import { getDiscriminationSummary } from './practice-tips.js';
import '../ui/button.js';
import '../ui/select.js';
import '../ui/volume-control.js';
import type { SelectChangeDetail } from '../ui/select.js';
import type { VolumeControlChangeDetail } from '../ui/volume-control.js';

export type DiscriminationNoiseToggleDetail = {
  noiseId: string;
  on: boolean;
};

export type DiscriminationNoiseVolumeDetail = {
  noiseId: string;
  volume: number;
};

export type DiscriminationLadderCountDetail = {
  count: number;
};

export type DiscriminationLadderRateDetail = {
  index: number;
  rate: number;
};

/**
 * Presentational settings panel for discrimination (抗噪听) mode.
 * Parent owns NoiseMixer / RateLadder orchestration and persistence.
 */
@customElement('discrimination-panel')
@localized()
export class DiscriminationPanel extends LitElement {
  static styles = practiceViewStyles;

  @property({ attribute: false })
  settings: DiscriminationSettings = {
    selected: [],
    ladderCount: DEFAULT_DISCRIMINATION_SETTINGS.ladderCount,
    ladderRates: [...DEFAULT_DISCRIMINATION_SETTINGS.ladderRates],
  };

  @property({ attribute: false })
  noiseItems: NoiseItem[] = [];

  @property({ type: Number })
  ladderDisplayIndex = 0;

  @property({ attribute: false })
  ladderSequence: number[] = [];

  @property({ type: Number })
  currentRate = 1;

  private _emit<T>(name: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onOpenTips = (): void => {
    this._emit('open-tips', undefined);
  };

  private _onOpenLibrary = (): void => {
    this._emit('open-library', undefined);
  };

  render() {
    const settings = this.settings;
    const rateOptions = DISCRIMINATION_RATE_STEPS.map((rate) => ({
      value: String(rate),
      label: `${rate}x`,
    }));
    const countOptions = Array.from(
      { length: DISCRIMINATION_LADDER_COUNT_MAX - DISCRIMINATION_LADDER_COUNT_MIN + 1 },
      (_, i) => {
        const value = DISCRIMINATION_LADDER_COUNT_MIN + i;
        return { value: String(value), label: String(value) };
      },
    );
    const sequencePreview = this.ladderSequence.map((rate) => `${rate}x`).join(' → ');
    const stepLabel =
      this.ladderSequence.length > 0
        ? msg(
            str`当前阶梯：第 ${this.ladderDisplayIndex + 1}/${this.ladderSequence.length} 步（${this.currentRate}x）`,
          )
        : '';

    return html`
      <div class="settings-panel">
        <div class="info-text">
          <div class="tips-summary">
            <p>${getDiscriminationSummary()}</p>
            <ui-button variant="secondary" @click=${this._onOpenTips}> ${msg('说明')} </ui-button>
          </div>
          <div class="settings-group">
            <h3>${msg('噪音')}</h3>
            ${this.noiseItems.length === 0
              ? html`<p class="hint">
                  ${msg('暂无噪音素材。请在资料库中导入。')}<ui-button
                    variant="secondary"
                    @click=${this._onOpenLibrary}
                    >${msg('立即前往')}</ui-button
                  >
                </p>`
              : html`<div class="discrimination-noise-row">
                  ${this.noiseItems.map((item) => {
                    const selected = settings.selected.find((s) => s.noiseId === item.id);
                    const checked = Boolean(selected);
                    return html`
                      <div class="noise-item-row">
                        <label class="noise-check">
                          <input
                            type="checkbox"
                            .checked=${checked}
                            @change=${(e: Event) => {
                              const input = e.target as HTMLInputElement;
                              const on = input.checked;
                              // Undo native check when at max; Lit won't re-apply unchanged `.checked`.
                              if (
                                on &&
                                this.settings.selected.length >= DISCRIMINATION_MAX_NOISE_TRACKS
                              ) {
                                input.checked = false;
                              }
                              this._emit<DiscriminationNoiseToggleDetail>('noise-toggle', {
                                noiseId: item.id,
                                on,
                              });
                            }}
                          />
                          <span>${item.title}</span>
                        </label>
                        ${checked
                          ? html`<ui-volume-control
                              .value=${selected?.volume ?? 0.5}
                              .min=${0}
                              .max=${1}
                              .step=${0.05}
                              placement="right"
                              @change=${(e: CustomEvent<VolumeControlChangeDetail>) => {
                                this._emit<DiscriminationNoiseVolumeDetail>('noise-volume', {
                                  noiseId: item.id,
                                  volume: e.detail.value,
                                });
                              }}
                            ></ui-volume-control>`
                          : nothing}
                      </div>
                    `;
                  })}
                </div>`}
          </div>
          <div class="settings-group">
            <h3>${msg('速听阶梯')}</h3>
            <div class="discrimination-ladder-row">
              <span>${msg('次数')}</span>
              <ui-select
                .value=${String(settings.ladderCount)}
                .options=${countOptions}
                @change=${(e: CustomEvent<SelectChangeDetail>) => {
                  this._emit<DiscriminationLadderCountDetail>('ladder-count', {
                    count: Number(e.detail.value),
                  });
                }}
              ></ui-select>
            </div>
            <div class="discrimination-ladder-rates">
              ${settings.ladderRates.map(
                (rate, index) => html`
                  <ui-select
                    .value=${String(rate)}
                    .options=${rateOptions}
                    aria-label=${msg(str`第 ${index + 1} 档倍速`)}
                    @change=${(e: CustomEvent<SelectChangeDetail>) => {
                      this._emit<DiscriminationLadderRateDetail>('ladder-rate', {
                        index,
                        rate: Number(e.detail.value),
                      });
                    }}
                  ></ui-select>
                `,
              )}
            </div>
            <span class="ladder-sequence-preview">${msg('将播放：')}${sequencePreview}</span>
            <p class="ladder-progress">${stepLabel}</p>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'discrimination-panel': DiscriminationPanel;
  }
}
