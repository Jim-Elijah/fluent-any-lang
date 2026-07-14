import { findActionForCode } from './default-map.js';
import { shouldIgnoreHotkey } from './guards.js';
import type { HotkeyScope, HotkeyScopeId } from './types.js';

/**
 * Document-level hotkey dispatcher. Scopes stack by registration order;
 * the last registered enabled scope that owns a binding for the key wins.
 */
export class HotkeyManager {
  private readonly scopes = new Map<HotkeyScopeId, HotkeyScope>();
  private readonly order: HotkeyScopeId[] = [];
  private listening = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (shouldIgnoreHotkey(event)) {
      return;
    }

    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const scope = this.scopes.get(this.order[i]);
      if (!scope) {
        continue;
      }
      if (scope.enabled && !scope.enabled()) {
        continue;
      }

      const action = findActionForCode(scope.id, event.code);
      if (!action) {
        continue;
      }

      const handler = scope.handlers[action];
      if (!handler) {
        continue;
      }

      event.preventDefault();
      event.stopPropagation();
      void handler();
      return;
    }
  };

  registerScope(scope: HotkeyScope): void {
    if (this.scopes.has(scope.id)) {
      this.unregisterScope(scope.id);
    }
    this.scopes.set(scope.id, scope);
    this.order.push(scope.id);
    this.ensureListening();
  }

  unregisterScope(id: HotkeyScopeId): void {
    if (!this.scopes.delete(id)) {
      return;
    }
    const index = this.order.indexOf(id);
    if (index >= 0) {
      this.order.splice(index, 1);
    }
    if (this.order.length === 0) {
      this.stopListening();
    }
  }

  /** Test helper: clear all scopes and detach the listener. */
  reset(): void {
    this.scopes.clear();
    this.order.length = 0;
    this.stopListening();
  }

  private ensureListening(): void {
    if (this.listening || typeof document === 'undefined') {
      return;
    }
    document.addEventListener('keydown', this.onKeyDown, true);
    this.listening = true;
  }

  private stopListening(): void {
    if (!this.listening || typeof document === 'undefined') {
      return;
    }
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.listening = false;
  }
}

let sharedManager: HotkeyManager | null = null;

export function getHotkeyManager(): HotkeyManager {
  if (!sharedManager) {
    sharedManager = new HotkeyManager();
  }
  return sharedManager;
}

/** Test helper: replace the singleton (pass null to clear). */
export function setHotkeyManagerForTests(manager: HotkeyManager | null): void {
  sharedManager = manager;
}
