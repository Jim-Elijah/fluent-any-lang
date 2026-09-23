import { css } from 'lit';

import { WORD_RAIL_LANE_PX } from '../../lib/word-waveform.js';

/** Shared word-rail overlay styles for source align markers on waveform-player. */
export const wordRailStyles = css`
  .word-rail {
    position: relative;
    height: 100%;
    pointer-events: none;
  }

  .word-marker {
    position: absolute;
    top: 0;
    height: 100%;
    box-sizing: border-box;
    padding: 0 2px;
    border: none;
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: inherit;
    font-size: 0.6875rem;
    line-height: ${WORD_RAIL_LANE_PX}px;
    text-align: center;
    cursor: pointer;
    pointer-events: auto;
  }

  .word-marker.is-compact {
    width: auto;
    padding: 0 4px;
  }

  .word-marker.is-align {
    background: rgba(0, 0, 0, 0.06);
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .word-marker:disabled {
    cursor: default;
    opacity: 0.85;
  }
`;
