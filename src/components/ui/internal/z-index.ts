/** Shared stacking order for portaled overlays. */
export const Z_INDEX = {
  NAV: 100,
  DROPDOWN: 1050,
  TOOLTIP: 1070,
  POPCONFIRM: 1080,
  FULLSCREEN: 1500,
  /** Popups portaled to body while a fullscreen overlay is active. */
  POPUP_ABOVE_FULLSCREEN: 1510,
  /** Recording session dock (Echo / Shadowing) — above subtitle fullscreen, below modal/countdown. */
  ECHO_SESSION_DOCK: 1520,
  MODAL: 1600,
  TOAST: 2000,
} as const;
