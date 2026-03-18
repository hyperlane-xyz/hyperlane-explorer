import js from '@eslint/js';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import nextConfig from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/build',
      '**/coverage',
      '**/postcss.config.js',
      '**/next.config.js',
      '**/tailwind.config.js',
    ],
  },
  js.configs.recommended,
  ...nextConfig,
  ...tanstackQuery.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },

      ecmaVersion: 12,
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.json',
      },
    },

    rules: {
      camelcase: ['error'],
      'guard-for-in': ['error'],
      'import/no-cycle': ['error'],
      'import/no-self-import': ['error'],
      'no-console': ['warn'],
      'no-eval': ['error'],
      'no-ex-assign': ['error'],
      'no-extra-boolean-cast': ['error'],
      'no-constant-condition': ['off'],
      'no-multiple-empty-lines': ['error'],
      'jsx-a11y/alt-text': ['off'],
      '@next/next/no-img-element': ['off'],
      'react-hooks/set-state-in-effect': ['off'],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],

    rules: {
      // Disable base rules that @typescript-eslint replaces
      'no-unused-vars': ['off'],
      'no-undef': ['off'],

      '@typescript-eslint/ban-ts-comment': ['off'],
      '@typescript-eslint/explicit-module-boundary-types': ['off'],
      '@typescript-eslint/no-explicit-any': ['off'],
      '@typescript-eslint/no-non-null-assertion': ['off'],
      '@typescript-eslint/no-require-imports': ['warn'],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],

    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
