export type Placement4 = 'top' | 'bottom' | 'left' | 'right';

export type ComputePlacement4Options = {
  placement: Placement4;
  triggerRect: DOMRect;
  popupWidth: number;
  popupHeight: number;
  gap?: number;
  container: HTMLElement;
  /** When set, popup width matches trigger width (select dropdown). */
  alignTo?: 'trigger-width';
  /** Flip to opposite side when overflow (select bottom → top). */
  flip?: boolean;
  arrowHalf?: number;
};

export type Placement4Result = {
  top: number;
  left: number;
  arrow: Record<string, string>;
  inContainer: boolean;
  popupWidth: number;
};

const DEFAULT_GAP = 8;

/** 4-direction placement with optional container-relative coordinates. */
export function computePlacement4(opts: ComputePlacement4Options): Placement4Result {
  const {
    placement,
    triggerRect,
    popupHeight,
    gap = DEFAULT_GAP,
    container,
    alignTo,
    flip = false,
    arrowHalf = 5,
  } = opts;

  let popupWidth = opts.popupWidth;
  if (alignTo === 'trigger-width') {
    popupWidth = triggerRect.width;
  }

  const inContainer = container !== document.body;
  const containerRect = container.getBoundingClientRect();

  let top: number;
  let left: number;
  let arrow: Record<string, string> = {};
  let effectivePlacement = placement;

  const placeBottom = () => {
    top = triggerRect.bottom + gap;
    left = triggerRect.left + triggerRect.width / 2 - popupWidth / 2;
    arrow = { left: `${popupWidth / 2 - arrowHalf}px`, top: `-${arrowHalf}px` };
  };

  const placeTop = () => {
    top = triggerRect.top - popupHeight - gap;
    left = triggerRect.left + triggerRect.width / 2 - popupWidth / 2;
    arrow = { left: `${popupWidth / 2 - arrowHalf}px`, top: `${popupHeight - arrowHalf}px` };
  };

  const placeLeft = () => {
    top = triggerRect.top + triggerRect.height / 2 - popupHeight / 2;
    left = triggerRect.left - popupWidth - gap;
    arrow = { top: `${popupHeight / 2 - arrowHalf}px`, left: `${popupWidth - arrowHalf}px` };
  };

  const placeRight = () => {
    top = triggerRect.top + triggerRect.height / 2 - popupHeight / 2;
    left = triggerRect.right + gap;
    arrow = { top: `${popupHeight / 2 - arrowHalf}px`, left: `-${arrowHalf}px` };
  };

  if (placement === 'bottom') placeBottom();
  else if (placement === 'top') placeTop();
  else if (placement === 'left') placeLeft();
  else placeRight();

  const viewportBottom = inContainer ? containerRect.bottom : window.innerHeight;
  const viewportTop = inContainer ? containerRect.top : 0;
  const viewportLeft = inContainer ? containerRect.left : 0;
  const viewportRight = inContainer ? containerRect.right : window.innerWidth;

  if (flip && placement === 'bottom') {
    if (
      top! + popupHeight > viewportBottom - 8 &&
      triggerRect.top - popupHeight - gap > viewportTop + 8
    ) {
      placeTop();
      effectivePlacement = 'top';
    }
  }

  if (alignTo === 'trigger-width') {
    left = triggerRect.left;
  }

  const minLeft = viewportLeft + 8;
  const maxLeft = viewportRight - popupWidth - 8;
  left = Math.max(minLeft, Math.min(maxLeft, left!));

  const minTop = viewportTop + 8;
  const maxTop = viewportBottom - popupHeight - 8;
  top = Math.max(minTop, Math.min(maxTop, top!));

  if (effectivePlacement === 'top' || effectivePlacement === 'bottom') {
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const arrowLeft = triggerCenterX - left! - arrowHalf;
    arrow.left = `${Math.max(12, Math.min(popupWidth - 22, arrowLeft))}px`;
  } else {
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;
    const arrowTop = triggerCenterY - top! - arrowHalf;
    arrow.top = `${Math.max(12, Math.min(popupHeight - 22, arrowTop))}px`;
  }

  if (inContainer) {
    left = left! - containerRect.left + container.scrollLeft;
    top = top! - containerRect.top + container.scrollTop;
  }

  return {
    top: top!,
    left: left!,
    arrow,
    inContainer,
    popupWidth,
  };
}

export type PlacementSide = 'top' | 'bottom' | 'left' | 'right';
export type PlacementAlign = 'start' | 'center' | 'end';

export type DropdownPlacement =
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

export function parsePlacement(placement: DropdownPlacement): {
  side: PlacementSide;
  align: PlacementAlign;
} {
  if (
    placement === 'top' ||
    placement === 'bottom' ||
    placement === 'left' ||
    placement === 'right'
  ) {
    return { side: placement, align: 'center' };
  }
  if (placement.startsWith('top')) {
    return {
      side: 'top',
      align: placement === 'topLeft' ? 'start' : placement === 'topRight' ? 'end' : 'center',
    };
  }
  if (placement.startsWith('bottom')) {
    return {
      side: 'bottom',
      align: placement === 'bottomLeft' ? 'start' : placement === 'bottomRight' ? 'end' : 'center',
    };
  }
  if (placement.startsWith('left')) {
    return {
      side: 'left',
      align: placement === 'leftTop' ? 'start' : placement === 'leftBottom' ? 'end' : 'center',
    };
  }
  return {
    side: 'right',
    align: placement === 'rightTop' ? 'start' : placement === 'rightBottom' ? 'end' : 'center',
  };
}

export function flipSide(side: PlacementSide): PlacementSide {
  const map: Record<PlacementSide, PlacementSide> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  return map[side];
}

export type ComputePlacement12Options = {
  placement: DropdownPlacement;
  triggerRect: DOMRect;
  popupWidth: number;
  popupHeight: number;
  gap?: number;
  container: HTMLElement;
  autoAdjustOverflow?: boolean;
  arrowHalf?: number;
  arrowPointAtCenter?: boolean;
};

export type Placement12Result = Placement4Result & {
  effectivePlacement: DropdownPlacement;
};

/** 12-direction placement with flip overflow (dropdown). */
export function computePlacement12(opts: ComputePlacement12Options): Placement12Result {
  const {
    triggerRect,
    popupWidth,
    popupHeight,
    gap = DEFAULT_GAP,
    container,
    autoAdjustOverflow = true,
    arrowHalf = 5,
    arrowPointAtCenter = false,
  } = opts;

  const inContainer = container !== document.body;
  const containerRect = container.getBoundingClientRect();

  const computeFor = (
    placement: DropdownPlacement,
  ): { top: number; left: number; arrow: Record<string, string>; fits: boolean } => {
    const { side, align } = parsePlacement(placement);
    let top: number;
    let left: number;
    const arrow: Record<string, string> = {};

    if (side === 'bottom') {
      top = triggerRect.bottom + gap;
      if (align === 'start') left = triggerRect.left;
      else if (align === 'end') left = triggerRect.right - popupWidth;
      else left = triggerRect.left + triggerRect.width / 2 - popupWidth / 2;
      arrow.top = `-${arrowHalf}px`;
    } else if (side === 'top') {
      top = triggerRect.top - popupHeight - gap;
      if (align === 'start') left = triggerRect.left;
      else if (align === 'end') left = triggerRect.right - popupWidth;
      else left = triggerRect.left + triggerRect.width / 2 - popupWidth / 2;
      arrow.top = `${popupHeight - arrowHalf}px`;
    } else if (side === 'left') {
      left = triggerRect.left - popupWidth - gap;
      if (align === 'start') top = triggerRect.top;
      else if (align === 'end') top = triggerRect.bottom - popupHeight;
      else top = triggerRect.top + triggerRect.height / 2 - popupHeight / 2;
      arrow.left = `${popupWidth - arrowHalf}px`;
    } else {
      left = triggerRect.right + gap;
      if (align === 'start') top = triggerRect.top;
      else if (align === 'end') top = triggerRect.bottom - popupHeight;
      else top = triggerRect.top + triggerRect.height / 2 - popupHeight / 2;
      arrow.left = `-${arrowHalf}px`;
    }

    const clampLeft = inContainer ? containerRect.left : 0;
    const clampTop = inContainer ? containerRect.top : 0;
    const clampWidth = inContainer ? container.clientWidth : window.innerWidth;
    const clampHeight = inContainer ? container.clientHeight : window.innerHeight;

    const fits =
      left >= clampLeft + 8 &&
      left + popupWidth <= clampLeft + clampWidth - 8 &&
      top >= clampTop + 8 &&
      top + popupHeight <= clampTop + clampHeight - 8;

    return { top, left, arrow, fits };
  };

  let effectivePlacement = opts.placement;
  let result = computeFor(effectivePlacement);

  if (autoAdjustOverflow && !result.fits) {
    const { side } = parsePlacement(effectivePlacement);
    const flipped =
      `${flipSide(side)}${effectivePlacement.replace(/^(top|bottom|left|right)/, '').replace(/^$/, '')}` as DropdownPlacement;
    const alt = computeFor(flipped);
    if (alt.fits) {
      effectivePlacement = flipped;
      result = alt;
    }
  }

  let { top, left, arrow } = result;

  if (arrowPointAtCenter) {
    const { side } = parsePlacement(effectivePlacement);
    if (side === 'top' || side === 'bottom') {
      const triggerCenterX = triggerRect.left + triggerRect.width / 2;
      arrow.left = `${triggerCenterX - left - arrowHalf}px`;
    } else {
      const triggerCenterY = triggerRect.top + triggerRect.height / 2;
      arrow.top = `${triggerCenterY - top - arrowHalf}px`;
    }
  }

  if (inContainer) {
    left = left - containerRect.left + container.scrollLeft;
    top = top - containerRect.top + container.scrollTop;
  }

  return {
    top,
    left,
    arrow,
    inContainer,
    popupWidth,
    effectivePlacement,
  };
}
