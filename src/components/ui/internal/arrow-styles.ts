export type ArrowStyleOptions = {
  backgroundVar?: string;
  backgroundFallback?: string;
  /** When set, draws a 1px outline via a larger ::before triangle and ::after fill. */
  borderColor?: string;
};

const ARROW_HALF = 5;

/** Shared arrow CSS for tooltip/dropdown/popconfirm portal popups. */
export function arrowStyles(opts: ArrowStyleOptions = {}): string {
  const bg = opts.backgroundVar ?? '--overlay-bg';
  const fallback = opts.backgroundFallback ?? 'rgba(0, 0, 0, 0.85)';
  const fill = `var(${bg}, ${fallback})`;
  const border = opts.borderColor;
  const outer = border ? ARROW_HALF + 1 : ARROW_HALF;

  const triangle = (
    direction: 'up' | 'down' | 'left' | 'right',
    size: number,
    color: string,
  ): string => {
    switch (direction) {
      case 'up':
        return `border-width: 0 ${size}px ${size}px ${size}px; border-color: transparent transparent ${color} transparent;`;
      case 'down':
        return `border-width: ${size}px ${size}px 0 ${size}px; border-color: ${color} transparent transparent transparent;`;
      case 'left':
        return `border-width: ${size}px ${size}px ${size}px 0; border-color: transparent ${color} transparent transparent;`;
      case 'right':
        return `border-width: ${size}px 0 ${size}px ${size}px; border-color: transparent transparent transparent ${color};`;
    }
  };

  const borderedFill = border
    ? `
    .arrow.placement-bottom::after {
      left: 50%;
      margin-left: -${ARROW_HALF}px;
      top: -1px;
      ${triangle('down', ARROW_HALF, fill)}
    }

    .arrow.placement-top::after {
      left: 50%;
      margin-left: -${ARROW_HALF}px;
      top: 1px;
      ${triangle('up', ARROW_HALF, fill)}
    }

    .arrow.placement-left::after {
      top: 50%;
      margin-top: -${ARROW_HALF}px;
      left: 1px;
      ${triangle('left', ARROW_HALF, fill)}
    }

    .arrow.placement-right::after {
      top: 50%;
      margin-top: -${ARROW_HALF}px;
      left: -1px;
      ${triangle('right', ARROW_HALF, fill)}
    }
  `
    : '';

  return `
    .arrow {
      position: absolute;
      background: transparent;
      pointer-events: none;
    }

    .arrow::before,
    .arrow::after {
      content: '';
      position: absolute;
      width: 0;
      height: 0;
      border-style: solid;
      border-color: transparent;
      box-sizing: content-box;
    }

    .arrow.placement-bottom {
      width: ${outer * 2}px;
      height: ${outer}px;
    }
    .arrow.placement-bottom::before {
      left: 50%;
      margin-left: -${outer}px;
      top: 0;
      ${triangle('down', outer, border ?? fill)}
    }

    .arrow.placement-top {
      width: ${outer * 2}px;
      height: ${outer}px;
    }
    .arrow.placement-top::before {
      left: 50%;
      margin-left: -${outer}px;
      top: 0;
      ${triangle('up', outer, border ?? fill)}
    }

    .arrow.placement-left {
      width: ${outer}px;
      height: ${outer * 2}px;
    }
    .arrow.placement-left::before {
      top: 50%;
      margin-top: -${outer}px;
      left: 0;
      ${triangle('left', outer, border ?? fill)}
    }

    .arrow.placement-right {
      width: ${outer}px;
      height: ${outer * 2}px;
    }
    .arrow.placement-right::before {
      top: 50%;
      margin-top: -${outer}px;
      left: 0;
      ${triangle('right', outer, border ?? fill)}
    }
    ${borderedFill}
  `;
}
