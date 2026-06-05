module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // All `any` usages require a justifying comment.
    '@typescript-eslint/no-explicit-any': 'error',
  },
  env: {
    node: true,
    es2020: true,
  },
};
