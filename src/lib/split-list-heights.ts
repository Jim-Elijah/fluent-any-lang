export type ListNaturalHeightOptions = {
  itemCount: number;
  rowHeight: number;
  hasHeader?: boolean;
  hasError?: boolean;
  loading?: boolean;
};

/** Approximate total height for a list section (header + body / empty state). */
export function estimateListNaturalHeight(options: ListNaturalHeightOptions): number {
  const header = options.hasHeader === false ? 0 : 40;
  const error = options.hasError ? 48 : 0;
  const body =
    options.loading || options.itemCount <= 0 ? 88 : options.itemCount * options.rowHeight;
  return header + error + body;
}

export type ListMetricsDetail = {
  naturalHeight: number;
  itemCount: number;
};
