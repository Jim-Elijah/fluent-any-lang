import { css } from 'lit';

/** Shared layout / panel styles for practice-view and its leaf panels. */
export const practiceViewStyles = css`
  :host {
    display: block;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-block);
    margin-bottom: var(--space-inline);
  }

  .header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .layout {
    display: grid;
    gap: var(--space-inline);
  }

  .mode-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-bottom: var(--space-inline);
  }

  .speaking-mode-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-bottom: var(--space-block);
  }

  .discrimination-noise-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-sm);
  }

  .noise-item-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .discrimination-noise-row label.noise-check {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .discrimination-ladder {
    display: flex;
    flex-direction: column;
    gap: var(--space-block);
  }

  .discrimination-ladder .setting-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
  }

  .discrimination-ladder .setting-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #666);
  }

  .discrimination-ladder ui-select {
    width: 100%;
    max-width: 6rem;
    min-width: 0;
  }

  .discrimination-ladder-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6rem, 6rem));
    gap: var(--space-block);
    justify-content: start;
  }

  .ladder-sequence-preview {
    font-size: 0.8125rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    line-height: 1.5;
    word-break: break-word;
  }

  .ladder-progress {
    margin: var(--space-xs) 0 0;
    font-size: 0.8125rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .settings-panel {
    display: grid;
    gap: var(--space-block);
    padding: var(--space-inline);
    margin-bottom: var(--space-inline);
    border: 1px solid var(--color-border, #d9d9d9);
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface, #fff);
  }

  .settings-panel h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .settings-group {
    display: grid;
    gap: var(--space-sm);
  }

  .storage-info {
    display: grid;
    gap: var(--space-xs);
    font-size: 0.875rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .info-text {
    display: grid;
    gap: var(--space-sm);
    font-size: 0.875rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .echo-recorder {
    margin-top: var(--space-sm);
  }

  :host([data-session-dock]) {
    padding-bottom: var(--session-dock-inset, var(--echo-dock-inset, 180px));
  }

  .tips-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .tips-summary p {
    margin: 0;
    flex: 1;
    min-width: 12rem;
  }

  .recordings-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .recordings-summary p {
    margin: 0;
    flex: 1;
    min-width: 10rem;
  }

  .recordings-modal-body {
    min-height: 12rem;
  }

  .tips-modal-body {
    display: grid;
    gap: var(--space-sm);
    font-size: 0.875rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .tips-skip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    font-size: 0.8125rem;
    cursor: pointer;
    user-select: none;
  }

  .tips-skip input {
    width: 16px;
    height: 16px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--color-primary, #1677ff);
  }

  .tips-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-block);
    width: 100%;
  }

  .hotkeys-help-body {
    display: grid;
    gap: var(--space-inline);
  }

  .hotkeys-help-list {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hotkeys-help-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-block);
    font-size: 0.875rem;
  }

  .hotkeys-help-scope {
    font-size: 0.75rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .hotkeys-help-code {
    flex-shrink: 0;
    min-width: 3.5rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--color-border, #d9d9d9);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-surface-secondary, #f5f5f5);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    text-align: center;
  }

  .hotkeys-help-note {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }
`;
