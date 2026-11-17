import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['build/', 'dist/', 'node_modules/', '.shell-src/', 'docs/', 'sdk/index.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/**/*.ts',
      'tests/shell-helper/**/*.js',
      'sdk/**/*.js',
      'examples/**/src/**/*.{ts,js}',
    ],
    languageOptions: {
      globals: {
        ...globals.es2021,
        global: 'readonly',
        log: 'readonly',
        logError: 'readonly',
        print: 'readonly',
        printerr: 'readonly',
      },
    },
    rules: {
      // Style rules in the spirit of the gjs.guide ESLint config
      'array-bracket-newline': ['error', 'consistent'],
      'arrow-parens': ['error', 'as-needed'],
      'block-scoped-var': 'error',
      'consistent-return': 'error',
      eqeqeq: ['error', 'always'],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-var': 'error',
      'no-shadow': 'off',
      'prefer-const': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.js', '*.js', '*.ts', 'tests/**/*.ts', 'tests/t3-mock/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
