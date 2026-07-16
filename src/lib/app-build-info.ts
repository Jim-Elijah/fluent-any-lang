export type AppBuildInfo = {
  appVersion: string;
  commitHash: string;
  buildTime: string;
};

export function getAppBuildInfo(): AppBuildInfo {
  return {
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev',
    commitHash: typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'unknown',
    buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '',
  };
}
