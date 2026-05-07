'use strict';

module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
  rules: {
    // correctness
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'no-constant-condition': 'error',

    // security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // style (only things that cause real bugs)
    'no-var': 'error',
    'prefer-const': ['error', { destructuring: 'all' }],
    'no-console': 'off',

    // function length — warn when a handler grows beyond 130 meaningful lines
    'max-lines-per-function': ['warn', { max: 130, skipBlankLines: true, skipComments: true }],
  },
  overrides: [
    {
      files: ['src/__tests__/**/*.test.js'],
      env: { jest: true },
    },
    {
      // layout.js is a single page() function that contains all the app CSS — length is expected
      files: ['src/layout.js'],
      rules: { 'max-lines-per-function': 'off' },
    },
  ],
  ignorePatterns: ['node_modules/', 'uploads/'],
};
