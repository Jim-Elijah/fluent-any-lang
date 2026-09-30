import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { ShadowingSegmentRange } from '../../lib/shadowing-range-selection.js';
import { practiceViewStyles } from './practice-view-styles.js';
import '../ui/button.js';
import '../ui/switch.js';

export type ShadowingRangeSelectActiveChangeDetail = {
  active: boolean;
};

export type ShadowingRangeFocusChangeDetail = {
  focus: boolean;
};

/**
 * Shadowing segment-range settings. Parent owns range state and subtitle click routing.
 */
@customElement('shadowing-range-panel')
@localized()
export class ShadowingRangePanel extends LitElement {
  static styles = [
    practiceViewStyles,
    css`
      h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .group-intro {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .range-controls {
        display: grid;
        gap: var(--space-sm);
      }

      .switch-field {
        display: grid;
        justify-items: start;
        gap: 2px;
      }

      .switch-row {
        display: inline-flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .switch-label {
        font-size: 0.875rem;
        cursor: pointer;
      }

      .switch-label.is-disabled {
        cursor: default;
      }

      .switch-hint {
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .range-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm);
      }

      .range-status {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm);
        flex: 1;
        min-width: 0;
      }

      .range-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: 999px;
        background: rgba(22, 119, 255, 0.1);
        color: var(--color-primary, #1677ff);
        font-size: 0.8125rem;
        font-weight: 500;
        white-space: nowrap;
      }

      .range-hint {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .range-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm);
        margin-left: auto;
      }
    `,
  ];

  @property({ type: Boolean })
  selectActive = false;

  @property({ type: Number })
  anchor: number | null = null;

  @property({ attribute: false })
  range: ShadowingSegmentRange | null = null;

  @property({ type: Boolean })
  rangeFocus = false;

  @property({ type: Boolean })
  disabled = false;

  private _emit<T>(name: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _rangeSummary(): string {
    if (this.range) {
      const count = this.range.end - this.range.start + 1;
      return msg(str`#${this.range.start + 1}–#${this.range.end + 1} · ${count}句`);
    }
    if (this.anchor !== null) {
      return msg(str`开始句 #${this.anchor + 1} · 再点最后一句`);
    }
    return msg('先点开始句，再点最后一句');
  }

  private _canClear(): boolean {
    return this.anchor !== null || this.range !== null;
  }

  private _renderSwitchField(options: {
    label: string;
    hint: string;
    checked: boolean;
    onToggle: (checked: boolean) => void;
  }) {
    const toggleFromLabel = () => {
      if (this.disabled) {
        return;
      }
      options.onToggle(!options.checked);
    };

    return html`
      <div class="switch-field">
        <div class="switch-row">
          <span class="switch-label ${this.disabled ? 'is-disabled' : ''}" @click=${toggleFromLabel}
            >${options.label}</span
          >
          <ui-switch
            .checked=${options.checked}
            .label=${options.label}
            ?disabled=${this.disabled}
            @change=${(e: CustomEvent<{ checked: boolean }>) => {
              options.onToggle(e.detail.checked);
            }}
          ></ui-switch>
        </div>
        <span class="switch-hint">${options.hint}</span>
      </div>
    `;
  }

  render() {
    const summary = this.selectActive ? this._rangeSummary() : '';

    const selectLabel = msg('开启选段');
    const focusLabel = msg('仅看选段');

    return html`
      <div class="settings-group">
        <h3>${msg('选段')}</h3>
        <p class="group-intro">
          ${msg(
            '限定这次影子跟读的句子范围。开启后，在字幕里先点开始的那一句，再点最后一句；从开始句到最后一句都会包含。开始录音时从第一句播放，最后一句播完会暂停音频；是否结束录音由你决定。',
          )}
        </p>
        <div class="range-controls">
          ${this._renderSwitchField({
            label: selectLabel,
            hint: msg('打开后才能点字幕，把两句设成这次跟读的开始句和最后一句。'),
            checked: this.selectActive,
            onToggle: (active) => {
              this._emit<ShadowingRangeSelectActiveChangeDetail>(
                'shadowing-range-select-active-change',
                { active },
              );
            },
          })}
          ${this.selectActive
            ? html`<div class="range-row">
                  <div class="range-status">
                    ${this.range
                      ? html`<span class="range-chip">${summary}</span>`
                      : html`<span class="range-hint">${summary}</span>`}
                  </div>
                  <div class="range-actions">
                    <ui-button
                      variant="ghost"
                      size="small"
                      ?disabled=${this.disabled || !this._canClear()}
                      @click=${() => this._emit('shadowing-range-clear', undefined)}
                    >
                      ${msg('清除')}
                    </ui-button>
                  </div>
                </div>
                ${this.range
                  ? this._renderSwitchField({
                      label: focusLabel,
                      hint: msg('字幕只显示从开始句到最后一句。'),
                      checked: this.rangeFocus,
                      onToggle: (focus) => {
                        this._emit<ShadowingRangeFocusChangeDetail>(
                          'shadowing-range-focus-change',
                          { focus },
                        );
                      },
                    })
                  : nothing}`
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'shadowing-range-panel': ShadowingRangePanel;
  }
}
