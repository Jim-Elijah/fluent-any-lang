import eslint from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import lit from 'eslint-plugin-lit';
import globals from 'globals';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      lit,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...lit.configs.recommended.rules,
    },
  },
  prettier,
  {
    ignores: ['dist/**', 'node_modules/**', 'src/locales/en.ts'],
  },
];
