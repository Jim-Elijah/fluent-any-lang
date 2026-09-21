import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../../components/ui/icon.js';

const NavigatorElement = navigator(LitElement);

type HubLink = {
  href: string;
  icon: string;
  title: string;
  description: string;
};

@customElement('library-page')
@localized()
export class LibraryPage extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
    }

    .intro {
      margin: 0 0 var(--space-section);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.9375rem;
    }

    .hub {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    button.link {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-md);
      width: 100%;
      margin: 0;
      padding: var(--space-md) var(--space-lg);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
      text-align: left;
      font: inherit;
      color: inherit;
      cursor: pointer;
      box-sizing: border-box;
    }

    button.link:hover {
      border-color: var(--color-primary, #1677ff);
    }

    .icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-md, 8px);
      background: var(--color-primary-bg, #e6f4ff);
      color: var(--color-primary, #1677ff);
      flex-shrink: 0;
    }

    .copy {
      min-width: 0;
    }

    .title {
      margin: 0 0 var(--space-xs);
      font-size: 1.0625rem;
      font-weight: 600;
    }

    .desc {
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
      line-height: 1.45;
    }

    .chevron {
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
      flex-shrink: 0;
    }

    @media (max-width: 767px) {
      .hub {
        gap: var(--space-xs);
      }

      button.link {
        gap: var(--space-xs);
        padding: var(--space-sm) var(--space-md);
      }
    }
  `;

  render() {
    return html`
      <p class="intro">${msg('浏览与管理练习材料、录音、噪音、播放列表与句库。')}</p>
      <ul class="hub">
        ${this._getLinks().map(
          (link) => html`
            <li>
              <button type="button" class="link" @click=${() => this.navigate(link.href)}>
                <span class="icon-wrap">
                  <ui-icon name=${link.icon} size="var(--icon-lg, 1.25rem)"></ui-icon>
                </span>
                <span class="copy">
                  <p class="title">${link.title}</p>
                  <p class="desc">${link.description}</p>
                </span>
                <ui-icon class="chevron" name="right-arrow" size="var(--icon-sm)"></ui-icon>
              </button>
            </li>
          `,
        )}
      </ul>
    `;
  }

  private _getLinks(): HubLink[] {
    return [
      {
        href: '/library/media',
        icon: 'media',
        title: msg('媒体库'),
        description: msg('导入的音视频练习材料'),
      },
      {
        href: '/library/playlists',
        icon: 'playlist',
        title: msg('播放列表'),
        description: msg('按列表顺序练习多个媒体'),
      },
      {
        href: '/library/noise',
        icon: 'listen',
        title: msg('噪音素材'),
        description: msg('听辨练习用的环境噪音叠加素材'),
      },
      {
        href: '/library/sentences',
        icon: 'dialog',
        title: msg('句库'),
        description: msg('收藏的句子，可单独练习'),
      },
      {
        href: '/library/records',
        icon: 'recording',
        title: msg('录音库'),
        description: msg('口语练习产生的录音'),
      },
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'library-page': LibraryPage;
  }
}
