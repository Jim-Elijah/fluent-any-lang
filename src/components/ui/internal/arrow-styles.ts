import { css } from 'lit';

export type ArrowStyleOptions = {
  backgroundVar?: string;
  backgroundFallback?: string;
};

/** Shared arrow CSS for tooltip/dropdown/popconfirm portal popups. */
export function arrowStyles(opts: ArrowStyleOptions = {}) {
  const bg = opts.backgroundVar ?? '--overlay-bg';
  const fallback = opts.backgroundFallback ?? 'rgba(0, 0, 0, 0.85)';

  return css`
    .arrow {
      position: absolute;
      overflow: hidden;
      background: transparent;
      pointer-events: none;
    }

    .arrow::before {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      background: var(${bg}, ${fallback});
      box-sizing: border-box;
      transform: rotate(45deg);
    }

    .arrow.placement-bottom {
      width: 10px;
      height: 5px;
    }
    .arrow.placement-bottom::before {
      left: 50%;
      margin-left: -4px;
      top: 0;
    }

    .arrow.placement-top {
      width: 10px;
      height: 5px;
    }
    .arrow.placement-top::before {
      left: 50%;
      margin-left: -4px;
      top: -4px;
    }

    .arrow.placement-left {
      width: 5px;
      height: 10px;
    }
    .arrow.placement-left::before {
      top: 50%;
      margin-top: -4px;
      left: 0;
    }

    .arrow.placement-right {
      width: 5px;
      height: 10px;
    }
    .arrow.placement-right::before {
      top: 50%;
      margin-top: -4px;
      left: -4px;
    }
  `.cssText;
}
