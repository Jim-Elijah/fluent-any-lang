/**
 * Returns true when a keyboard event should not trigger app hotkeys.
 */
export function shouldIgnoreHotkey(event: KeyboardEvent): boolean {
  if (event.isComposing) {
    return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return true;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  const focusTarget =
    target instanceof HTMLElement ? (target.closest('[contenteditable]') ?? target) : target;

  if (focusTarget instanceof HTMLElement && focusTarget.isContentEditable) {
    return true;
  }

  if (
    focusTarget instanceof HTMLInputElement ||
    focusTarget instanceof HTMLTextAreaElement ||
    focusTarget instanceof HTMLSelectElement
  ) {
    return true;
  }

  const tag = focusTarget.tagName;
  if (tag === 'UI-INPUT' || tag === 'UI-TEXTAREA' || tag === 'UI-SELECT' || tag === 'UI-SLIDER') {
    return true;
  }

  return Boolean(focusTarget.closest('ui-input, ui-textarea, ui-select, ui-slider'));
}
