export interface IconSymbol {
  viewBox: string;
  innerHTML: string;
}

declare global {
  interface Window {
    _iconfont_svg_string_5204781?: string;
  }
}

const registry = new Map<string, IconSymbol>();
let loadPromise: Promise<void> | null = null;

function normalizeIconName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('icon-') ? trimmed : `icon-${trimmed}`;
}

function registerSymbol(id: string, symbol: IconSymbol): void {
  registry.set(id, symbol);
  if (id.startsWith('icon-')) {
    registry.set(id.slice(5), symbol);
  }
}

function parseSprite(svgString: string): void {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  doc.querySelectorAll('symbol').forEach((symbol) => {
    const id = symbol.getAttribute('id');
    if (!id) return;

    registerSymbol(id, {
      viewBox: symbol.getAttribute('viewBox') ?? '0 0 1024 1024',
      innerHTML: symbol.innerHTML,
    });
  });
}

function extractSvgFromIconfontJs(js: string): string {
  const match = js.match(/_iconfont_svg_string_\d+='(<svg>[\s\S]*?<\/svg>)'/);
  if (!match) {
    throw new Error('Failed to parse iconfont.js sprite');
  }
  return match[1];
}

function initFromGlobalSprite(): boolean {
  const svgString = window._iconfont_svg_string_5204781;
  if (!svgString) return false;

  parseSprite(svgString);
  return registry.size > 0;
}

export function getIconSymbol(name: string): IconSymbol | undefined {
  const id = normalizeIconName(name);
  return id ? registry.get(id) : undefined;
}

export function ensureIconRegistry(): Promise<void> {
  if (registry.size > 0) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (initFromGlobalSprite()) return;

    const response = await fetch('/font/iconfont.js');
    if (!response.ok) {
      throw new Error(`Failed to load iconfont.js (${response.status})`);
    }

    parseSprite(extractSvgFromIconfontJs(await response.text()));
  })();

  return loadPromise;
}

if (typeof window !== 'undefined') {
  initFromGlobalSprite();
}
