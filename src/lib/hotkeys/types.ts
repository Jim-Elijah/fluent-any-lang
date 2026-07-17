export type HotkeyScopeId = 'practice' | 'recording-preview' | 'sentence-practice';

export type HotkeyAction =
  | 'togglePlay'
  | 'previousSegment'
  | 'nextSegment'
  | 'volumeUp'
  | 'volumeDown'
  | 'rateUp'
  | 'rateDown'
  | 'playSource'
  | 'playRecording'
  | 'playSync';

export type HotkeyHandler = () => void | Promise<void>;

export type HotkeyBinding = {
  /** KeyboardEvent.code, e.g. `Space`, `ArrowLeft`. */
  code: string;
  action: HotkeyAction;
};

export type HotkeyScope = {
  id: HotkeyScopeId;
  /** When false, bindings for this scope are ignored. Defaults to always enabled. */
  enabled?: () => boolean;
  handlers: Partial<Record<HotkeyAction, HotkeyHandler>>;
};
