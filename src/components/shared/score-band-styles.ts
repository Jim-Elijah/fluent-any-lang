import { css } from 'lit';

/**
 * Shared high / good / mid / low fill for Pronunciation Score badges and chips.
 * Pair with `scoreBand()` and class `score-band ${band}`.
 * Traffic-light palette: excellent → good → passing → fail (tinted bg + darker fg).
 */
export const scoreBandStyles = css`
  .score-band.high {
    background: rgba(82, 196, 26, 0.16);
    color: #389e0d;
  }
  .score-band.good {
    background: rgba(22, 119, 255, 0.14);
    color: #0958d9;
  }
  .score-band.mid {
    background: rgba(250, 173, 20, 0.2);
    color: #ad6800;
  }
  .score-band.low {
    background: rgba(255, 77, 79, 0.16);
    color: #cf1322;
  }
`;
