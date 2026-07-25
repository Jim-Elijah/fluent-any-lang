import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
  onRegisteredSW: (url: string, registration: ServiceWorkerRegistration) => void;
};

const registerSWMock = vi.fn((options: RegisterSWOptions) => {
  registerSWMock.lastOptions = options;
  return registerSWMock.updateSW;
});
registerSWMock.updateSW = vi.fn(async () => undefined);
registerSWMock.lastOptions = undefined as RegisterSWOptions | undefined;
registerSWMock.shouldThrow = false;

vi.mock('virtual:pwa-register', () => ({
  get registerSW() {
    if (registerSWMock.shouldThrow) {
      throw new Error('missing virtual module');
    }
    return registerSWMock;
  },
}));

async function loadPwa() {
  return import('./pwa.js');
}

function stubNavigatorServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('pwa', () => {
  beforeEach(() => {
    vi.resetModules();
    registerSWMock.mockClear();
    registerSWMock.updateSW.mockClear();
    registerSWMock.lastOptions = undefined;
    registerSWMock.shouldThrow = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes initial state and notifies subscribers', async () => {
    const { getPwaState, subscribePwa } = await loadPwa();
    const listener = vi.fn();

    expect(getPwaState()).toEqual({
      needRefresh: false,
      offlineReady: false,
      registered: false,
    });

    const unsubscribe = subscribePwa(listener);
    expect(listener).toHaveBeenCalledWith({
      needRefresh: false,
      offlineReady: false,
      registered: false,
    });
    unsubscribe();
  });

  it('detects standalone display mode and iOS navigator.standalone', async () => {
    const { isPwaStandalone } = await loadPwa();

    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(isPwaStandalone()).toBe(true);

    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
    expect(isPwaStandalone()).toBe(true);

    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: false,
    });
    expect(isPwaStandalone()).toBe(false);
  });

  it('registerPwa no-ops when service workers are unavailable and is idempotent', async () => {
    // Force the unsupported branch: serviceWorker key absent from a stubbed navigator.
    const bareNavigator = { userAgent: 'test' } as Navigator;
    vi.stubGlobal('navigator', bareNavigator);

    const { registerPwa, getPwaState, subscribePwa } = await loadPwa();
    const listener = vi.fn();
    subscribePwa(listener);
    listener.mockClear();

    registerPwa();
    registerPwa();

    expect(getPwaState().registered).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registerSWMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('wires registerSW callbacks and update helpers', async () => {
    stubNavigatorServiceWorker({
      getRegistration: vi.fn(async () => undefined),
    });

    const {
      registerPwa,
      subscribePwa,
      getPwaState,
      clearOfflineReady,
      dismissNeedRefresh,
      applyPwaUpdate,
      checkForPwaUpdate,
    } = await loadPwa();

    const listener = vi.fn();
    subscribePwa(listener);
    registerPwa();

    await vi.waitFor(() => expect(registerSWMock).toHaveBeenCalled());
    const options = registerSWMock.lastOptions!;
    expect(options).toBeTruthy();

    listener.mockClear();
    options.onOfflineReady();
    expect(getPwaState().offlineReady).toBe(true);
    expect(listener).toHaveBeenCalled();

    clearOfflineReady();
    expect(getPwaState().offlineReady).toBe(false);
    clearOfflineReady();

    options.onNeedRefresh();
    expect(getPwaState().needRefresh).toBe(true);
    dismissNeedRefresh();
    expect(getPwaState().needRefresh).toBe(false);
    dismissNeedRefresh();

    options.onRegisteredSW('/sw.js', {} as ServiceWorkerRegistration);

    await applyPwaUpdate();
    expect(registerSWMock.updateSW).toHaveBeenCalledWith(true);

    expect(await checkForPwaUpdate()).toBe(false);
  });

  it('handles registerSW import failure', async () => {
    registerSWMock.shouldThrow = true;
    stubNavigatorServiceWorker({ getRegistration: vi.fn() });

    const { registerPwa, getPwaState, subscribePwa } = await loadPwa();
    const listener = vi.fn();
    subscribePwa(listener);
    listener.mockClear();

    registerPwa();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(getPwaState().registered).toBe(true);
  });

  it('checkForPwaUpdate returns false without service worker support', async () => {
    vi.stubGlobal('navigator', { userAgent: 'test' } as Navigator);
    const { checkForPwaUpdate } = await loadPwa();
    await expect(checkForPwaUpdate()).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it('checkForPwaUpdate updates registration and detects waiting worker', async () => {
    const registration = {
      update: vi.fn(async () => undefined),
      waiting: {},
    };
    stubNavigatorServiceWorker({
      getRegistration: vi.fn(async () => registration),
    });

    const { checkForPwaUpdate, getPwaState, subscribePwa } = await loadPwa();
    const listener = vi.fn();
    subscribePwa(listener);
    listener.mockClear();

    await expect(checkForPwaUpdate()).resolves.toBe(true);
    expect(registration.update).toHaveBeenCalled();
    expect(getPwaState().needRefresh).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('checkForPwaUpdate returns false when there is no registration', async () => {
    stubNavigatorServiceWorker({
      getRegistration: vi.fn(async () => undefined),
    });
    const { checkForPwaUpdate } = await loadPwa();
    await expect(checkForPwaUpdate()).resolves.toBe(false);
  });

  it('checkForPwaUpdate returns current needRefresh when no waiting worker', async () => {
    const registration = {
      update: vi.fn(async () => undefined),
      waiting: undefined,
    };
    stubNavigatorServiceWorker({
      getRegistration: vi.fn(async () => registration),
    });

    const { registerPwa, checkForPwaUpdate, getPwaState } = await loadPwa();
    registerPwa();
    await vi.waitFor(() => expect(registerSWMock).toHaveBeenCalled());
    registerSWMock.lastOptions?.onNeedRefresh();
    expect(getPwaState().needRefresh).toBe(true);

    await expect(checkForPwaUpdate()).resolves.toBe(true);
  });

  it('applyPwaUpdate falls back to SKIP_WAITING and reload', async () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    stubNavigatorServiceWorker({
      getRegistration: vi.fn(async () => ({ waiting: { postMessage } })),
    });

    // Fresh module without updateSW set
    const { applyPwaUpdate } = await loadPwa();
    await applyPwaUpdate();

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
