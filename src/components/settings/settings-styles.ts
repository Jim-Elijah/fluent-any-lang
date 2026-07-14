import { css } from 'lit';

/** Shared card / row look for settings sections (aligned with practice-stats cards). */
export const settingsCardStyles = css`
  :host {
    display: block;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-block);
    padding: var(--space-inline);
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, #d9d9d9);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
  }

  h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--color-text, rgba(0, 0, 0, 0.88));
  }

  h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text, rgba(0, 0, 0, 0.88));
  }

  .desc {
    margin: 0;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    font-size: 0.875rem;
  }

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
  }

  .rows {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-inline);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--color-border, #f0f0f0);
  }

  .row:last-child {
    border-bottom: none;
  }

  .label-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .label {
    font-size: 0.9375rem;
    color: var(--color-text, rgba(0, 0, 0, 0.88));
  }
`;
