/// <reference types="vitest/config" />

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Vitest's vi.mock resolves relative paths with an importer taken from the
 * call stack. With Vite's module runner that importer is often a root-relative
 * URL (`/src/...`), a `file://` URL, or a Windows path whose drive letter casing
 * differs from the module graph (`d:` vs `D:`). Any of those causes the mock
 * registry key to miss the loaded module, so tests get the real export.
 *
 * Normalize importers to filesystem paths and lowercase Windows drive letters
 * on resolved ids so mock registration and module lookup share one key.
 */
function normalizeVitestMockImporter(): Plugin {
  function lowercaseDrive(p: string): string {
    return p.replace(/^([A-Za-z]):/, (_, d: string) => `${d.toLowerCase()}:`);
  }

  function toFsImporter(importer: string): string | undefined {
    const bare = importer.replace(/[?#].*$/, '');
    if (bare.startsWith('file:')) {
      try {
        return fileURLToPath(bare);
      } catch {
        return undefined;
      }
    }
    if (bare.startsWith('/@fs/')) {
      return bare.slice('/@fs/'.length);
    }
    // Stack / Vite URL shaped like /D:/path/...
    if (/^\/[A-Za-z]:\//.test(bare)) {
      return bare.slice(1);
    }
    // Root-relative Vite URL (/src/foo.ts). On Windows Node treats "/src/..." as
    // absolute, so detect by leading slash without a drive letter.
    if (bare.startsWith('/') && !bare.startsWith('/@') && !/^[A-Za-z]:/.test(bare.slice(1))) {
      return resolve(rootDir, bare.slice(1));
    }
    return undefined;
  }

  return {
    name: 'normalize-vitest-mock-importer',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (!importer || (!id.startsWith('./') && !id.startsWith('../'))) {
        return;
      }
      const fsImporter = lowercaseDrive((toFsImporter(importer) ?? importer).replace(/\\/g, '/'));
      const resolved = await this.resolve(id, fsImporter, {
        ...options,
        skipSelf: true,
      });
      if (!resolved) {
        return;
      }
      const normalizedId = lowercaseDrive(resolved.id.replace(/\\/g, '/'));
      if (normalizedId === resolved.id) {
        return resolved;
      }
      return { ...resolved, id: normalizedId };
    },
  };
}

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readCommitHash(): string {
  const fromEnv = process.env.GITHUB_SHA?.trim() || process.env.COMMIT_HASH?.trim();
  if (fromEnv) {
    return fromEnv.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  server: {
    host: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(readPackageVersion()),
    __COMMIT_HASH__: JSON.stringify(readCommitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [
    normalizeVitestMockImporter(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'FluentAnyLang',
        short_name: 'FluALang',
        description: 'Listening and speaking practice for any language — local-first.',
        start_url: '/',
        display: 'standalone',
        background_color: '#1677ff',
        theme_color: '#1677ff',
        lang: 'zh-CN',
        dir: 'ltr',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', 'manifest.webmanifest'],
        globIgnores: ['**/release-notes.json'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        enabled: false,
      },
    }),
    basicSsl(),
  ],
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/locales/**', 'src/main.ts', 'src/types/**'],
    },
  },
});
