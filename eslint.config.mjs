import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginPrettier from 'eslint-plugin-prettier';
import configPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      'dist',
      'coverage',
      '.env',
      '.env.example',
      'node_modules',
      'eslint.config.mjs',
    ],
  },
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: pluginPrettier,
      import: importPlugin,
    },
    rules: {
      ...configPrettier.rules,
      'prettier/prettier': 'error',
      'import/order': [
        'error',
        {
          groups: [
            ['builtin', 'external'],
            ['internal'],
            ['parent', 'sibling', 'index'],
          ],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'always',
        },
      ],
    },
  },
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
];
