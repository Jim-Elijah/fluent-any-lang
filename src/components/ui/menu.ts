import { LitElement, html, css, nothing, TemplateResult, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export type MenuItem = {
  key: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  children?: MenuItem[];
};

export type MenuMode = 'horizontal' | 'vertical';

export type MenuSelectDetail = {
  key: string;
  keyPath: string[];
  selectedKeys: string[];
  item: MenuItem;
  domEvent: Event;
};

export type MenuOpenChangeDetail = {
  openKeys: string[];
};

export type MenuClickDetail = {
  key: string;
  keyPath: string[];
  item: MenuItem;
  domEvent: Event;
};

@customElement('ui-menu')
export class UiMenu extends LitElement {
  static styles = css`
    :host {
      display: block;
      --menu-bg: transparent;
      --menu-border: #f0f0f0;
      --menu-item-height: 40px;
      --menu-item-padding: 0 var(--space-inline);
      --menu-text: rgba(0, 0, 0, 0.88);
      --menu-muted: rgba(0, 0, 0, 0.45);
      --menu-active: #1677ff;
      --menu-hover: rgba(22, 119, 255, 0.08);
      --menu-submenu-indent: var(--space-inline);
    }

    .menu {
      background: var(--menu-bg);
      border: 1px solid var(--menu-border);
      border-radius: 6px;
      overflow: hidden;
    }

    /* horizontal */
    .menu.horizontal {
      border: none;
      border-bottom: 1px solid var(--menu-border);
      border-radius: 0;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      background: #fff;
    }

    /* vertical */
    .menu.vertical {
      /* width: 220px; */
      background: #fff;
    }

    .top-level {
      display: flex;
    }

    .menu.vertical .top-level {
      flex-direction: column;
      width: 100%;
    }

    .item {
      height: var(--menu-item-height);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--menu-item-padding);
      color: var(--menu-text);
      cursor: pointer;
      user-select: none;
      position: relative;
      white-space: nowrap;
      background: transparent;
      outline: none;
    }

    .item:hover {
      background: var(--menu-hover);
    }

    .item.disabled {
      color: var(--menu-muted);
      cursor: not-allowed;
    }

    .item[aria-current='page'] {
      color: var(--menu-active);
      background: rgba(22, 119, 255, 0.12);
    }

    /* active indicator for vertical */
    .menu.vertical .item[aria-current='page']::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      background: var(--menu-active);
      border-radius: 3px;
    }

    .icon {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: currentColor;
    }

    .chevron {
      margin-left: auto;
      opacity: 0.65;
      transition: transform 0.15s ease;
    }

    .submenu {
      overflow: hidden;
    }

    .submenu .children {
      padding-left: var(--menu-submenu-indent);
    }

    .submenu.collapsible > .item .chevron.open {
      transform: rotate(90deg);
    }

    /* horizontal submenu dropdown */
    .menu.horizontal .submenu {
      position: relative;
    }

    .menu.horizontal .submenu .children {
      position: absolute;
      top: 100%;
      left: 0;
      min-width: 200px;
      background: #fff;
      border: 1px solid var(--menu-border);
      border-top: none;
      z-index: 10;
      padding: 6px 0;
      display: none;
    }

    .menu.horizontal .submenu.open .children {
      display: block;
    }

    .submenu-item {
      height: var(--menu-item-height);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-inline);
      cursor: pointer;
      color: var(--menu-text);
      user-select: none;
      background: transparent;
    }

    .submenu-item:hover {
      background: var(--menu-hover);
    }

    .submenu-item.disabled {
      color: var(--menu-muted);
      cursor: not-allowed;
    }

    .submenu-item[aria-current='page'] {
      color: var(--menu-active);
      background: rgba(22, 119, 255, 0.12);
    }

    /* 侧边栏 / 内嵌：去掉外框 */
    :host([inline]) .menu {
      border: none;
      border-radius: 0;
    }

    :host([inline]) .menu.vertical {
      width: 100%;
    }

    /* 底部 tab bar */
    :host([bottom-nav]) .menu.horizontal {
      border: none;
      border-radius: 0;
      background: #fff;
    }

    :host([bottom-nav]) .menu.horizontal .top-level {
      display: flex;
      width: 100%;
    }

    :host([bottom-nav]) .menu.horizontal .item {
      flex: 1;
      flex-direction: column;
      justify-content: center;
      height: var(--menu-item-height, 56px);
      padding: 6px var(--space-xs);
      font-size: 12px;
      gap: var(--space-xs);
    }

    /* 底部激活指示：左侧竖条 → 顶部横条 */
    :host([bottom-nav]) .menu.horizontal .item[aria-current='page']::before {
      left: 20%;
      right: 20%;
      top: 0;
      bottom: auto;
      width: auto;
      height: 3px;
    }

    /* 底部导航不需要左侧竖条 */
    .menu.vertical .item[aria-current='page']::before {
      /* 保持现有 */
    }
    :host([bottom-nav]) .menu.horizontal .item[aria-current='page']::before {
      /* 覆盖 vertical 的 left 竖条规则 */
    }
  `;

  @property({ type: Boolean, reflect: true }) bottomNav = false;
  @property({ type: Boolean, reflect: true }) inline = false;

  @property({ type: String }) mode: MenuMode = 'vertical';
  @property({ type: Array }) items: MenuItem[] = [];

  // 受控：undefined = 非受控；[] = 受控且空
  @property({ type: Array }) selectedKeys?: string[];
  @property({ type: Array }) openKeys?: string[];
  @property({ type: Array, attribute: 'default-selected-keys' }) defaultSelectedKeys?: string[];
  @property({ type: Array, attribute: 'default-open-keys' }) defaultOpenKeys?: string[];

  @state() private _internalSelectedKeys: string[] = [];
  @state() private _internalOpenKeys: string[] = [];
  private _keysInitialized = false;

  // 可选：仅用于 vertical 的外观控制（这里不强制实现）
  @property({ type: Boolean, reflect: true }) collapsed = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._initKeys();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('defaultSelectedKeys') || changed.has('defaultOpenKeys')) {
      this._initKeys();
    }
  }

  private _initKeys(): void {
    if (this._keysInitialized) return;
    if (this.selectedKeys === undefined && this.defaultSelectedKeys !== undefined) {
      this._internalSelectedKeys = [...this.defaultSelectedKeys];
    }
    if (this.openKeys === undefined && this.defaultOpenKeys !== undefined) {
      this._internalOpenKeys = [...this.defaultOpenKeys];
    }
    this._keysInitialized = true;
  }

  private _getSelectedKeys(): string[] {
    return this.selectedKeys ?? this._internalSelectedKeys;
  }

  private _getOpenKeys(): string[] {
    return this.openKeys ?? this._internalOpenKeys;
  }

  private _currentSelectedKey(): string | undefined {
    return this._getSelectedKeys()[0];
  }

  private _isOpen(key: string): boolean {
    return this._getOpenKeys().includes(key);
  }

  private _findKeyPath(
    key: string,
    items: MenuItem[] = this.items,
    path: string[] = [],
  ): string[] | null {
    for (const item of items) {
      const currentPath = [...path, item.key];
      if (item.key === key) {
        return currentPath;
      }
      if (item.children?.length) {
        const found = this._findKeyPath(key, item.children, currentPath);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  private _dispatchOpenChange(openKeys: string[]) {
    this.dispatchEvent(
      new CustomEvent('open-change', {
        detail: { openKeys } satisfies MenuOpenChangeDetail,
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent('update:openKeys', {
        detail: { openKeys },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _dispatchMenuClick(item: MenuItem, domEvent: Event) {
    const keyPath = this._findKeyPath(item.key) ?? [item.key];
    this.dispatchEvent(
      new CustomEvent('menu-click', {
        detail: { key: item.key, keyPath, item, domEvent } satisfies MenuClickDetail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleSelect(item: MenuItem, domEvent: Event) {
    if (item.disabled) return;

    this._dispatchMenuClick(item, domEvent);

    const keyPath = this._findKeyPath(item.key) ?? [item.key];
    const selectedKeys = [item.key];

    if (this.selectedKeys === undefined) {
      this._internalSelectedKeys = selectedKeys;
    }

    this.dispatchEvent(
      new CustomEvent('select', {
        detail: { key: item.key, keyPath, selectedKeys, item, domEvent } satisfies MenuSelectDetail,
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent('update:selectedKeys', {
        detail: { selectedKeys },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleSubmenuClick(item: MenuItem, domEvent: Event) {
    if (item.disabled) return;

    this._dispatchMenuClick(item, domEvent);

    const open = this._isOpen(item.key);
    const currentOpen = this._getOpenKeys();
    const next = open ? currentOpen.filter((k) => k !== item.key) : [...currentOpen, item.key];

    if (this.openKeys === undefined) {
      this._internalOpenKeys = next;
    }
    this._dispatchOpenChange(next);
  }

  // 遍历渲染：递归 submenu
  private _renderItems(items: MenuItem[], level = 0): TemplateResult {
    const selectedKey = this._currentSelectedKey();

    return html`
      ${items.map((item) => {
        const hasChildren = !!item.children?.length;
        const isSelected = selectedKey === item.key;

        if (hasChildren) {
          const isOpen = this._isOpen(item.key);

          // vertical：子级在当前流内展开（这里用简单显示/隐藏）
          if (this.mode === 'vertical') {
            return html`
              <div class="submenu ${isOpen ? 'open' : ''}">
                <div
                  class="item collapsible ${item.disabled ? 'disabled' : ''}"
                  role="menuitem"
                  aria-current=${isSelected ? 'page' : 'false'}
                  aria-expanded=${isOpen}
                  @click=${(e: Event) => this._handleSubmenuClick(item, e)}
                >
                  ${item.icon
                    ? html`<ui-icon name=${item.icon} size="var(--icon-xl)"></ui-icon>`
                    : nothing}
                  <span>${item.label}</span>
                  <span class="chevron ${isOpen ? 'open' : ''}">›</span>
                </div>

                ${isOpen
                  ? html`
                      <div class="children">${this._renderItems(item.children!, level + 1)}</div>
                    `
                  : nothing}
              </div>
            `;
          }

          // horizontal：子级作为 dropdown
          return html`
            <div class="submenu ${isOpen ? 'open' : ''}">
              <div
                class="item collapsible ${item.disabled ? 'disabled' : ''}"
                role="menuitem"
                aria-current=${isSelected ? 'page' : 'false'}
                aria-expanded=${isOpen}
                @click=${(e: Event) => this._handleSubmenuClick(item, e)}
              >
                ${item.icon ? html`<span class="icon">${item.icon}</span>` : nothing}
                <span>${item.label}</span>
                <span class="chevron ${isOpen ? 'open' : ''}">›</span>
              </div>

              <div class="children" role="menu">
                ${item.children!.map((child) => {
                  const childSelected = selectedKey === child.key;
                  return html`
                    <div
                      class="submenu-item ${child.disabled ? 'disabled' : ''}"
                      aria-current=${childSelected ? 'page' : 'false'}
                      @click=${(e: Event) => this._handleSelect(child, e)}
                    >
                      ${child.icon
                        ? html`<ui-icon name=${child.icon} size="var(--icon-xl)"></ui-icon>`
                        : nothing}
                      <span>${child.label}</span>
                    </div>
                  `;
                })}
              </div>
            </div>
          `;
        }

        // 普通 item
        return html`
          <div
            class="item ${item.disabled ? 'disabled' : ''}"
            aria-current=${isSelected ? 'page' : 'false'}
            role="menuitem"
            @click=${(e: Event) => this._handleSelect(item, e)}
          >
            ${item.icon
              ? html`<ui-icon name=${item.icon} size="var(--icon-xl)"></ui-icon>`
              : nothing}
            <span>${item.label}</span>
          </div>
        `;
      })}
    `;
  }

  render() {
    const classMap = {
      horizontal: this.mode === 'horizontal',
      vertical: this.mode === 'vertical',
      menu: true,
    };

    return html`
      <div
        class=${Object.entries(classMap)
          .map(([k, v]) => (v ? k : ''))
          .join(' ')}
      >
        <div class="top-level" role="menu">${this._renderItems(this.items)}</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-menu': UiMenu;
  }

  interface HTMLElementEventMap {
    select: CustomEvent<MenuSelectDetail>;
    'open-change': CustomEvent<MenuOpenChangeDetail>;
    'menu-click': CustomEvent<MenuClickDetail>;
  }
}
