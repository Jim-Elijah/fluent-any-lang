import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoadingOptions = {
  target?: string | HTMLElement;
  body?: boolean;
  fullscreen?: boolean;
  lock?: boolean;
  text?: string;
  background?: string;
  customClass?: string;
  beforeClose?: () => boolean | Promise<boolean>;
  closed?: () => void;
};

export type LoadingInstance = {
  close: () => void;
};

type ResolvedLoadingOptions = Required<
  Pick<LoadingOptions, 'body' | 'fullscreen' | 'lock' | 'text' | 'background' | 'customClass'>
> &
  Pick<LoadingOptions, 'beforeClose' | 'closed'> & {
    target: HTMLElement;
  };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const PARENT_RELATIVE_CLASS = 'ui-loading-parent--relative';
const PARENT_HIDDEN_CLASS = 'ui-loading-parent--hidden';
const DEFAULT_BACKGROUND = 'rgba(255, 255, 255, 0.9)';
const DEFAULT_Z_INDEX = 2000;

function resolveTarget(target?: string | HTMLElement): HTMLElement {
  if (!target) return document.body;
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (el instanceof HTMLElement) return el;
    console.warn(`[Loading] target "${target}" not found, fallback to document.body`);
    return document.body;
  }
  return target;
}

function resolveOptions(options: LoadingOptions = {}): ResolvedLoadingOptions {
  const fullscreen = options.fullscreen ?? true;
  const target = fullscreen ? document.body : resolveTarget(options.target);

  return {
    target,
    body: options.body ?? false,
    fullscreen,
    lock: options.lock ?? false,
    text: options.text ?? '',
    background: options.background ?? DEFAULT_BACKGROUND,
    customClass: options.customClass ?? '',
    beforeClose: options.beforeClose,
    closed: options.closed,
  };
}

// ---------------------------------------------------------------------------
// ui-loading-mask
// ---------------------------------------------------------------------------

@customElement('ui-loading-mask')
export class UiLoadingMask extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: var(--loading-z-index, 2000);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      transition: opacity 0.2s ease;
    }

    :host([fullscreen]),
    :host([body]) {
      position: fixed;
    }

    .spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .circular {
      width: 42px;
      height: 42px;
      animation: ui-loading-rotate 2s linear infinite;
    }

    .path {
      animation: ui-loading-dash 1.5s ease-in-out infinite;
      stroke: var(--color-primary, #1677ff);
      stroke-width: 2;
      stroke-linecap: round;
      fill: none;
    }

    .text {
      margin: 0;
      color: var(--color-primary, #1677ff);
      font-size: 14px;
      line-height: 1.5;
    }

    @keyframes ui-loading-rotate {
      100% {
        transform: rotate(360deg);
      }
    }

    @keyframes ui-loading-dash {
      0% {
        stroke-dasharray: 1, 200;
        stroke-dashoffset: 0;
      }
      50% {
        stroke-dasharray: 90, 150;
        stroke-dashoffset: -40px;
      }
      100% {
        stroke-dasharray: 90, 150;
        stroke-dashoffset: -120px;
      }
    }
  `;

  @property({ type: String }) text = '';
  @property({ type: String }) background = DEFAULT_BACKGROUND;
  @property({ type: String, attribute: 'custom-class' }) customClass = '';
  @property({ type: Boolean, reflect: true }) fullscreen = false;
  @property({ type: Boolean, reflect: true }) body = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.style.background = this.background;
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('background')) {
      this.style.background = this.background;
    }
  }

  render() {
    return html`
      <div class="spinner" role="status" aria-live="polite" aria-busy="true">
        <svg class="circular" viewBox="25 25 50 50" aria-hidden="true">
          <circle class="path" cx="50" cy="50" r="20" fill="none" />
        </svg>
        ${this.text ? html`<p class="text">${this.text}</p>` : nothing}
      </div>
    `;
  }
}

// ---------------------------------------------------------------------------
// Loading manager
// ---------------------------------------------------------------------------

type ManagedLoading = {
  options: ResolvedLoadingOptions;
  mask: UiLoadingMask;
  parentPositionChanged: boolean;
  parentOverflowChanged: boolean;
  bodyOverflowChanged: boolean;
  savedParentPosition: string;
  savedParentOverflow: string;
  savedBodyOverflow: string;
  closeRefCount: number;
  closed: boolean;
  syncBodyPosition?: () => void;
};

class LoadingManager {
  private _fullscreenInstance: ManagedLoading | null = null;

  service(options: LoadingOptions = {}): LoadingInstance {
    const resolved = resolveOptions(options);

    if (resolved.fullscreen && this._fullscreenInstance && !this._fullscreenInstance.closed) {
      this._fullscreenInstance.closeRefCount += 1;
      return this._wrapInstance(this._fullscreenInstance);
    }

    const managed = this._create(resolved);
    if (resolved.fullscreen) {
      this._fullscreenInstance = managed;
    }
    return this._wrapInstance(managed);
  }

  private _create(options: ResolvedLoadingOptions): ManagedLoading {
    const mask = document.createElement('ui-loading-mask') as UiLoadingMask;
    mask.text = options.text;
    mask.background = options.background;
    mask.customClass = options.customClass;
    mask.fullscreen = options.fullscreen;
    mask.body = options.body;
    mask.style.zIndex = String(DEFAULT_Z_INDEX);
    if (options.customClass) {
      for (const cls of options.customClass.split(/\s+/)) {
        if (cls) mask.classList.add(cls);
      }
    }

    const mountTarget = this._resolveMountTarget(options);

    const styleParent = options.fullscreen || options.body ? document.body : options.target;
    const savedParentPosition = styleParent.style.position;
    const savedParentOverflow = styleParent.style.overflow;
    const savedBodyOverflow = document.body.style.overflow;

    let parentPositionChanged = false;
    let parentOverflowChanged = false;
    let bodyOverflowChanged = false;

    if (!options.fullscreen && !options.body) {
      const computed = getComputedStyle(options.target).position;
      if (computed === 'static') {
        options.target.classList.add(PARENT_RELATIVE_CLASS);
        options.target.style.position = 'relative';
        parentPositionChanged = true;
      }
    }

    if (options.lock) {
      if (options.fullscreen || options.body) {
        document.body.classList.add(PARENT_HIDDEN_CLASS);
        document.body.style.overflow = 'hidden';
        bodyOverflowChanged = true;
      } else {
        options.target.classList.add(PARENT_HIDDEN_CLASS);
        options.target.style.overflow = 'hidden';
        parentOverflowChanged = true;
      }
    }

    mountTarget.appendChild(mask);

    let syncBodyPosition: (() => void) | undefined;
    if (options.body && !options.fullscreen) {
      syncBodyPosition = () => this._syncBodyMaskPosition(mask, options.target);
      syncBodyPosition();
      window.addEventListener('scroll', syncBodyPosition, true);
      window.addEventListener('resize', syncBodyPosition);
    }

    const managed: ManagedLoading = {
      options,
      mask,
      parentPositionChanged,
      parentOverflowChanged,
      bodyOverflowChanged,
      savedParentPosition,
      savedParentOverflow,
      savedBodyOverflow,
      closeRefCount: 1,
      closed: false,
      syncBodyPosition,
    };

    return managed;
  }

  private _resolveMountTarget(options: ResolvedLoadingOptions): HTMLElement {
    if (options.fullscreen || options.body) {
      return document.body;
    }
    return options.target;
  }

  private _syncBodyMaskPosition(mask: UiLoadingMask, target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    mask.style.top = `${rect.top}px`;
    mask.style.left = `${rect.left}px`;
    mask.style.width = `${rect.width}px`;
    mask.style.height = `${rect.height}px`;
    mask.style.right = 'auto';
    mask.style.bottom = 'auto';
  }

  private _wrapInstance(managed: ManagedLoading): LoadingInstance {
    return {
      close: () => {
        void this._close(managed);
      },
    };
  }

  private async _close(managed: ManagedLoading): Promise<void> {
    if (managed.closed) return;

    managed.closeRefCount -= 1;
    if (managed.closeRefCount > 0) return;

    const { beforeClose, closed } = managed.options;
    if (beforeClose) {
      const allow = await beforeClose();
      if (!allow) {
        managed.closeRefCount += 1;
        return;
      }
    }

    managed.closed = true;

    if (managed.syncBodyPosition) {
      window.removeEventListener('scroll', managed.syncBodyPosition, true);
      window.removeEventListener('resize', managed.syncBodyPosition);
    }

    managed.mask.remove();

    const { options } = managed;

    if (managed.parentPositionChanged) {
      options.target.classList.remove(PARENT_RELATIVE_CLASS);
      options.target.style.position = managed.savedParentPosition;
    }

    if (managed.parentOverflowChanged) {
      options.target.classList.remove(PARENT_HIDDEN_CLASS);
      options.target.style.overflow = managed.savedParentOverflow;
    }

    if (managed.bodyOverflowChanged) {
      document.body.classList.remove(PARENT_HIDDEN_CLASS);
      document.body.style.overflow = managed.savedBodyOverflow;
    }

    if (this._fullscreenInstance === managed) {
      this._fullscreenInstance = null;
    }

    closed?.();
  }
}

const manager = new LoadingManager();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type LoadingService = {
  (options?: LoadingOptions): LoadingInstance;
  service: (options?: LoadingOptions) => LoadingInstance;
};

function createLoading(options?: LoadingOptions): LoadingInstance {
  return manager.service(options);
}

export const Loading = createLoading as LoadingService;
Loading.service = (options) => manager.service(options);
