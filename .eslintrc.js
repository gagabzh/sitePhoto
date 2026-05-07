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
  },
  overrides: [
    {
      files: ['src/__tests__/**/*.test.js'],
      env: { jest: true },
    },
  ],
  ignorePatterns: ['node_modules/', 'uploads/'],
};
